import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Share,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {useAuth} from '../../services/auth/AuthContext';
import {PaywallModal} from '../subscription/PaywallModal';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {CIRCLE_CATEGORIES, createLocalCircle, getCircleCategory} from './circleCatalog';
import {
  addMemberByInvite,
  addSimulatedPeer,
  removeMember,
  revokeAllConsent,
  setMemberConsent,
} from './circleInvite';
import {loadLocalCircles, saveLocalCircles} from './circleLocalStore';
import {CircleLiveMap} from './CircleLiveMap';
import {
  fetchRemoteCircle,
  joinCircleByInvite,
  publishCircleDirectory,
  publishLivePoint,
  setRemoteConsent,
  stopSharing,
  subscribeLivePoints,
  type LivePointNative,
} from './circleLive';
import type {CircleCategoryCode, LocalCircle} from './circleTypes';
import type {LiveMapPoint} from './circleMapUrls';

type Props = {
  onUpgrade?: () => void;
};

type Mode = 'list' | 'create' | 'join' | 'detail';

const INTERVALS: Array<LocalCircle['intervalSec']> = [20, 60, 600];

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function remoteMembersToLocal(
  members: Array<{
    id: string;
    displayName: string;
    role: string;
    consentLive: boolean;
    joinedAtMs: number;
  }>,
): LocalCircle['members'] {
  return members.map(m => ({
    id: m.id,
    displayName: m.displayName,
    role: m.role === 'owner' ? 'owner' : 'member',
    consentLive: m.consentLive,
    joinedAtMs: m.joinedAtMs,
  }));
}

export function CircleScreen({onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature, tier, caps} = useEntitlements();
  const {auth, firebaseReady, ensureFirebaseAuth} = useAuth();
  const unlocked = caps.circleLive;

  const [circles, setCircles] = useState<LocalCircle[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CircleCategoryCode>('family');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [livePoints, setLivePoints] = useState<LivePointNative[]>([]);
  const shareTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveUnsub = useRef<{unsubscribe: () => void} | null>(null);
  const lastLoc = useRef<{lat: number; lng: number} | null>(null);
  const failBackoff = useRef(0);

  const selected = useMemo(
    () => circles.find(c => c.id === selectedId) ?? null,
    [circles, selectedId],
  );

  const mapPoints: LiveMapPoint[] = useMemo(
    () =>
      livePoints
        .filter(p => p.shareOn)
        .map(p => ({
          id: p.uid,
          displayName: p.displayName,
          latitude: p.lat,
          longitude: p.lng,
          colorIndex: p.colorIndex,
        })),
    [livePoints],
  );

  const persist = useCallback(async (next: LocalCircle[]) => {
    setCircles(next);
    await saveLocalCircles(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await loadLocalCircles();
    setCircles(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearLiveHooks = useCallback(() => {
    if (shareTimer.current) {
      clearInterval(shareTimer.current);
      shareTimer.current = null;
    }
    liveUnsub.current?.unsubscribe();
    liveUnsub.current = null;
    setLivePoints([]);
  }, []);

  useEffect(() => {
    return () => clearLiveHooks();
  }, [clearLiveHooks]);

  const publishOnce = useCallback(async (circle: LocalCircle) => {
    if (!circle.shareEnabled || !circle.liveReady) return;
    try {
      const loc = await mrpmModule.getCurrentLocationWithAddress?.();
      if (!loc || typeof loc.latitude !== 'number') return;
      const myIdx = Math.max(
        0,
        circle.members.findIndex(m => m.displayName === 'You' || m.role === 'owner'),
      );
      await publishLivePoint({
        circleId: circle.id,
        lat: loc.latitude,
        lng: loc.longitude,
        displayName: 'You',
        colorIndex: myIdx,
        shareOn: true,
        groupKey: circle.groupKey,
        inviteCode: circle.inviteCode,
      });
      lastLoc.current = {lat: loc.latitude, lng: loc.longitude};
      failBackoff.current = 0;
    } catch (e: any) {
      failBackoff.current = Math.min(60, (failBackoff.current || 2) * 2);
      console.warn('[CircleLive] publish', e?.message || e, 'backoff', failBackoff.current);
    }
  }, []);

  const effectiveIntervalSec = useCallback((circle: LocalCircle) => {
    let sec = circle.intervalSec;
    // Battery-adaptive: if barely moved since last fix, slow down (cap 10m).
    if (lastLoc.current && livePoints.length > 0) {
      const mine = livePoints.find(p => p.displayName === 'You');
      if (mine) {
        const moved = haversineM(
          lastLoc.current.lat,
          lastLoc.current.lng,
          mine.lat,
          mine.lng,
        );
        if (moved < 25) {
          sec = Math.min(600, sec * 3) as LocalCircle['intervalSec'];
        }
      }
    }
    return sec + failBackoff.current;
  }, [livePoints]);

  useEffect(() => {
    clearLiveHooks();
    if (mode !== 'detail' || !selected) return;

    liveUnsub.current = subscribeLivePoints(selected.id, setLivePoints, {
      groupKey: selected.groupKey,
      inviteCode: selected.inviteCode,
    });

    if (selected.shareEnabled && selected.liveReady) {
      publishOnce(selected);
      const tick = () => {
        publishOnce(selected);
        if (shareTimer.current) clearInterval(shareTimer.current);
        shareTimer.current = setInterval(tick, effectiveIntervalSec(selected) * 1000);
      };
      shareTimer.current = setInterval(tick, effectiveIntervalSec(selected) * 1000);
    }

    // Soft refresh remote roster (2-device consent)
    (async () => {
      const remote = await fetchRemoteCircle(selected.id);
      if (!remote) return;
      const updated: LocalCircle = {
        ...selected,
        members: remoteMembersToLocal(remote.members),
        memberCount: remote.memberCount,
        liveReady: remote.liveReady,
        groupKey: remote.groupKey || selected.groupKey,
        inviteCode: remote.inviteCode || selected.inviteCode,
        maxMembers: remote.maxMembers,
        name: remote.name || selected.name,
      };
      const next = circles.map(c => (c.id === updated.id ? updated : c));
      await persist(next);
    })();

    return () => clearLiveHooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    selected?.id,
    selected?.shareEnabled,
    selected?.liveReady,
    selected?.intervalSec,
    selected?.groupKey,
  ]);

  const requireEnterprise = () => {
    if (!unlocked) {
      setPaywallVisible(true);
      return false;
    }
    return true;
  };

  const publishInviteToCloud = async (circle: LocalCircle): Promise<LocalCircle> => {
    await ensureFirebaseAuth();
    const pub = await publishCircleDirectory({
      circleId: circle.id,
      name: circle.name,
      category: circle.category,
      inviteCode: circle.inviteCode,
      maxMembers: circle.maxMembers,
      groupKey: circle.groupKey,
      displayName: auth.displayName || 'You',
    });
    return {...circle, groupKey: pub.groupKey};
  };

  const onCreate = async () => {
    if (!requireEnterprise()) return;
    const cat = getCircleCategory(category);
    if (!cat || !canUseFeature(cat.featureKey)) {
      setPaywallVisible(true);
      return;
    }
    const result = createLocalCircle({name, category});
    if (!result.ok) {
      Alert.alert('Cannot create', result.reason);
      return;
    }
    setBusy(true);
    try {
      let circle = result.circle;
      try {
        circle = await publishInviteToCloud(circle);
      } catch (e: any) {
        Alert.alert(
          'Invite not published',
          (e?.message || 'Could not publish invite to cloud.') +
            '\n\nSign in with Google on Hub → Account, then open this Circle and tap “Publish invite”.',
        );
      }
      const next = [circle, ...circles];
      await persist(next);
      setName('');
      setSelectedId(circle.id);
      setMode('detail');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (!requireEnterprise()) return;
    setBusy(true);
    try {
      try {
        await ensureFirebaseAuth();
      } catch (e: any) {
        Alert.alert(
          'Sign in required',
          e?.message || 'Sign in with Google from Hub → Account before joining.',
        );
        return;
      }
      try {
        const remote = await joinCircleByInvite(joinCode, joinName || 'Member');
        const local: LocalCircle = {
          id: remote.id,
          name: remote.name,
          category: (remote.category as CircleCategoryCode) || 'family',
          maxMembers: remote.maxMembers,
          memberCount: remote.memberCount,
          createdAtMs: Date.now(),
          inviteCode: remote.inviteCode,
          members: remoteMembersToLocal(remote.members),
          liveReady: remote.liveReady,
          shareEnabled: false,
          intervalSec: 60,
          groupKey: remote.groupKey,
        };
        const without = circles.filter(c => c.id !== local.id);
        await persist([local, ...without]);
        setJoinCode('');
        setJoinName('');
        setSelectedId(local.id);
        setMode('detail');
        return;
      } catch (remoteErr: any) {
        const msg = String(remoteErr?.message || remoteErr || '');
        const notFound =
          msg.includes('No circle') ||
          msg.includes('NOT_FOUND') ||
          msg.toLowerCase().includes('invite code');
        if (notFound) {
          Alert.alert(
            'No circle for that code',
            'The other device has not published this invite to Firebase yet.\n\n' +
              'On the creator phone: Hub → Account (Google signed in) → open the Circle → ' +
              'tap “Publish invite”, then try joining again.',
          );
          return;
        }
        // Same-device local join only (rare).
        const result = addMemberByInvite(circles, joinCode, joinName);
        if (!result.ok) {
          Alert.alert('Cannot join', msg || result.reason);
          return;
        }
        await persist(result.circles);
        setJoinCode('');
        setJoinName('');
        setSelectedId(result.circleId);
        setMode('detail');
      }
    } finally {
      setBusy(false);
    }
  };

  const updateSelected = async (updater: (c: LocalCircle) => LocalCircle | null) => {
    if (!selected) return;
    const updated = updater(selected);
    if (!updated) return;
    const next = circles.map(c => (c.id === updated.id ? updated : c));
    await persist(next);
  };

  const onLeave = (id: string) => {
    Alert.alert('Leave circle?', 'Removes this circle from this device.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await stopSharing(id);
          } catch {
            /* ignore */
          }
          await persist(circles.filter(c => c.id !== id));
          if (selectedId === id) {
            setSelectedId(null);
            setMode('list');
          }
        },
      },
    ]);
  };

  const shareInvite = async (circle: LocalCircle) => {
    setBusy(true);
    try {
      const synced = await publishInviteToCloud(circle);
      await updateSelected(() => synced);
      await Share.share({
        message: `Join my MRP Circle "${synced.name}" with invite code: ${synced.inviteCode}`,
      });
    } catch (e: any) {
      Alert.alert(
        'Publish failed',
        (e?.message || 'Could not publish invite.') +
          '\n\nSign in with Google from Hub → Account, then try Share invite again.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Enterprise required</Text>
          <Text style={styles.body}>
            Circle live share is an Enterprise feature. Your current plan is {tier}. Upgrade in
            Subscriptions to unlock.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => (onUpgrade ? onUpgrade() : setPaywallVisible(true))}>
            <Text style={styles.primaryBtnText}>View subscriptions</Text>
          </TouchableOpacity>
        </View>
        <PaywallModal
          visible={paywallVisible}
          title="Enterprise required"
          message="Circle live share needs an Enterprise plan."
          onClose={() => setPaywallVisible(false)}
          onUpgrade={() => {
            setPaywallVisible(false);
            onUpgrade?.();
          }}
        />
      </View>
    );
  }

  if (mode === 'detail' && selected) {
    const cat = getCircleCategory(selected.category);
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => {
            clearLiveHooks();
            setMode('list');
          }}
          hitSlop={12}>
          <Text style={styles.backLink}>← Circles</Text>
        </TouchableOpacity>
        <Text style={styles.hero}>{selected.name}</Text>
        <Text style={styles.sub}>
          {cat?.label ?? selected.category} · {selected.memberCount}/{selected.maxMembers} members
        </Text>

        <CircleLiveMap points={mapPoints} title="Live map (OSM)" />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live share</Text>
          <Text style={styles.body}>
            Mutual consent + Google Sign-In required. Points → Firebase RTDB. NestJS handles
            invites/FCM later.
          </Text>
          <View style={styles.memberRow}>
            <View style={styles.memberText}>
              <Text style={styles.memberName}>Share my location</Text>
              <Text style={styles.memberMeta}>
                {selected.liveReady ? 'Consent OK' : 'Blocked until mutual consent'}
              </Text>
            </View>
            <Switch
              value={selected.shareEnabled}
              disabled={!selected.liveReady}
              onValueChange={async v => {
                await updateSelected(c => ({...c, shareEnabled: v}));
                if (!v) {
                  try {
                    await stopSharing(selected.id);
                  } catch {
                    /* ignore */
                  }
                }
              }}
              trackColor={{false: colors.border, true: colors.emeraldDark}}
              thumbColor={selected.shareEnabled ? colors.emerald : colors.textSecondary}
            />
          </View>
          <Text style={styles.label}>Interval</Text>
          <View style={styles.intervalRow}>
            {INTERVALS.map(sec => {
              const label = sec === 20 ? '20s' : sec === 60 ? '1m' : '10m';
              const on = selected.intervalSec === sec;
              return (
                <TouchableOpacity
                  key={sec}
                  style={[styles.intervalChip, on && styles.intervalChipOn]}
                  onPress={() => updateSelected(c => ({...c, intervalSec: sec}))}>
                  <Text style={[styles.intervalChipText, on && styles.intervalChipTextOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite code</Text>
          <Text style={styles.inviteCode}>{selected.inviteCode}</Text>
          <Text style={styles.body}>
            {firebaseReady
              ? `Cloud auth ready (${(auth.firebaseUid || '').slice(0, 8)}…)`
              : 'Cloud auth missing — publish will fail until Google Sign-In links Firebase.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const synced = await publishInviteToCloud(selected);
                await updateSelected(() => synced);
                Alert.alert(
                  'Invite published',
                  `Code ${synced.inviteCode} is now in Firebase. Join from the other device.`,
                );
              } catch (e: any) {
                Alert.alert('Publish failed', e?.message || 'Could not publish invite');
              } finally {
                setBusy(false);
              }
            }}>
            <Text style={styles.primaryBtnText}>
              {busy ? 'Publishing…' : 'Publish invite'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryFull}
            disabled={busy}
            onPress={() => shareInvite(selected)}>
            <Text style={styles.secondaryBtnText}>Share invite</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryFull}
            onPress={async () => {
              const result = addSimulatedPeer(selected);
              if (!result.ok) {
                Alert.alert('Cannot add', result.reason);
                return;
              }
              await updateSelected(() => result.circle);
            }}>
            <Text style={styles.secondaryBtnText}>Add test peer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mutual consent</Text>
          <View
            style={[
              styles.liveBanner,
              selected.liveReady ? styles.liveReadyBanner : styles.liveBlocked,
            ]}>
            <Text style={styles.liveBannerText}>
              {selected.liveReady
                ? 'Live ready — turn Share ON'
                : selected.members.length < 2
                  ? 'Need 2+ members, then consent'
                  : 'Waiting for all consents'}
            </Text>
          </View>
          {selected.members.map(m => (
            <View key={m.id} style={styles.memberRow}>
              <View style={styles.memberText}>
                <Text style={styles.memberName}>
                  {m.displayName}
                  {m.role === 'owner' ? ' · owner' : ''}
                </Text>
                <Text style={styles.memberMeta}>
                  {m.consentLive ? 'Consented' : 'Not consented'}
                </Text>
              </View>
              <Switch
                value={m.consentLive}
                onValueChange={async v => {
                  await updateSelected(c => setMemberConsent(c, m.id, v));
                  try {
                    await setRemoteConsent(selected.id, v);
                  } catch {
                    /* local still updated */
                  }
                }}
                trackColor={{false: colors.border, true: colors.emeraldDark}}
                thumbColor={m.consentLive ? colors.emerald : colors.textSecondary}
              />
              {m.role !== 'owner' ? (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Remove member?', m.displayName, [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: async () => {
                          await updateSelected(c => removeMember(c, m.id));
                        },
                      },
                    ])
                  }
                  hitSlop={8}
                  style={styles.removeBtn}>
                  <Text style={styles.leave}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            style={styles.secondaryFull}
            onPress={async () => {
              await updateSelected(c => ({...revokeAllConsent(c), shareEnabled: false}));
              try {
                await stopSharing(selected.id);
              } catch {
                /* ignore */
              }
            }}>
            <Text style={styles.secondaryBtnText}>Revoke all consent</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.dangerBtn} onPress={() => onLeave(selected.id)}>
          <Text style={styles.dangerBtnText}>Leave circle</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.hero}>Live Share</Text>
      <Text style={styles.sub}>
        Create or join. Consent + Share ON → Firebase live points; OSM map with colored pins.
      </Text>

      {mode === 'list' ? (
        <View style={styles.rowBtns}>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.flexBtn]}
            onPress={() => setMode('create')}>
            <Text style={styles.primaryBtnText}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flexBtn, {marginRight: 0}]}
            onPress={() => setMode('join')}>
            <Text style={styles.secondaryBtnText}>Join with code</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === 'create' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New circle</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Family home"
            placeholderTextColor={colors.textMuted}
            maxLength={48}
            autoFocus
          />
          <Text style={styles.label}>Category</Text>
          {CIRCLE_CATEGORIES.map(catItem => {
            const selectedCat = category === catItem.code;
            return (
              <TouchableOpacity
                key={catItem.code}
                style={[styles.catRow, selectedCat && styles.catRowSelected]}
                onPress={() => setCategory(catItem.code)}>
                <View style={styles.catText}>
                  <Text style={styles.catLabel}>{catItem.label}</Text>
                  <Text style={styles.catDesc}>
                    {catItem.description} · max {catItem.maxMembers}
                  </Text>
                </View>
                <Text style={styles.catCheck}>{selectedCat ? '●' : '○'}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.rowBtns}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('list')}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.flexBtn, busy && styles.btnDisabled]}
              onPress={onCreate}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {mode === 'join' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Join with invite code</Text>
          <Text style={styles.label}>Invite code</Text>
          <TextInput
            style={styles.input}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            maxLength={12}
            placeholderTextColor={colors.textMuted}
            placeholder="AB12CD"
          />
          <Text style={styles.label}>Your display name</Text>
          <TextInput
            style={styles.input}
            value={joinName}
            onChangeText={setJoinName}
            maxLength={32}
            placeholderTextColor={colors.textMuted}
            placeholder="Name"
          />
          <View style={styles.rowBtns}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode('list')}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.flexBtn, busy && styles.btnDisabled]}
              onPress={onJoin}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Join</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Your circles</Text>
      {loading ? (
        <ActivityIndicator color={colors.sky} />
      ) : circles.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>No circles yet.</Text>
        </View>
      ) : (
        circles.map(c => {
          const catItem = getCircleCategory(c.category);
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.circleCard}
              onPress={() => {
                setSelectedId(c.id);
                setMode('detail');
              }}>
              <View style={styles.circleMain}>
                <Text style={styles.circleName}>{c.name}</Text>
                <Text style={styles.circleMeta}>
                  {catItem?.label} · {c.memberCount}/{c.maxMembers} · {c.inviteCode}
                </Text>
                <Text style={styles.circleHint}>
                  {c.shareEnabled ? 'Sharing live' : c.liveReady ? 'Live ready' : 'Setup needed'}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })
      )}

      <PaywallModal
        visible={paywallVisible}
        title="Enterprise required"
        message="This Circle category needs an Enterprise plan."
        onClose={() => setPaywallVisible(false)}
        onUpgrade={() => {
          setPaywallVisible(false);
          onUpgrade?.();
        }}
      />
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {padding: spacing.lg},
    scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    backLink: {color: colors.sky, fontWeight: '700', marginBottom: spacing.sm},
    hero: {fontSize: 22, fontWeight: '800', color: colors.textPrimary},
    sub: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 4,
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    title: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    body: {fontSize: 15, color: colors.textBody, lineHeight: 22, marginBottom: spacing.sm},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    inviteCode: {
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 4,
      color: colors.sky,
      marginBottom: spacing.sm,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceAlt,
      marginBottom: spacing.md,
      fontSize: 16,
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      marginBottom: 8,
    },
    catRowSelected: {borderColor: colors.sky, backgroundColor: colors.skySoft},
    catText: {flex: 1},
    catLabel: {fontSize: 15, fontWeight: '800', color: colors.textPrimary},
    catDesc: {fontSize: 12, color: colors.textMuted, marginTop: 2},
    catCheck: {fontSize: 16, color: colors.sky, marginLeft: 8},
    primaryBtn: {
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    primaryBtnText: {color: '#fff', fontWeight: '800', fontSize: 14},
    secondaryBtn: {
      flex: 1,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: spacing.sm,
      marginBottom: spacing.md,
    },
    secondaryFull: {
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    secondaryBtnText: {color: colors.textBody, fontWeight: '700'},
    rowBtns: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm},
    flexBtn: {flex: 1, marginBottom: 0},
    btnDisabled: {opacity: 0.6},
    sectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    circleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    circleMain: {flex: 1},
    circleName: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    circleMeta: {fontSize: 13, color: colors.textMuted, marginTop: 2},
    circleHint: {fontSize: 12, color: colors.textSecondary, marginTop: 4},
    chevron: {fontSize: 22, color: colors.textMuted, marginLeft: 8},
    leave: {color: colors.red, fontWeight: '700', fontSize: 13},
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    memberText: {flex: 1, paddingRight: 8},
    memberName: {fontSize: 15, fontWeight: '700', color: colors.textPrimary},
    memberMeta: {fontSize: 12, color: colors.textMuted, marginTop: 2},
    removeBtn: {marginLeft: 8, padding: 4},
    liveBanner: {borderRadius: radius.md, padding: 12, marginBottom: spacing.sm},
    liveReadyBanner: {backgroundColor: colors.emeraldSoft},
    liveBlocked: {backgroundColor: colors.amberSoft},
    liveBannerText: {fontSize: 13, fontWeight: '700', color: colors.textPrimary},
    dangerBtn: {
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.red,
      marginBottom: spacing.lg,
    },
    dangerBtnText: {color: colors.red, fontWeight: '800'},
    intervalRow: {flexDirection: 'row', gap: 8, marginBottom: spacing.sm},
    intervalChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    intervalChipOn: {backgroundColor: colors.skySoft, borderColor: colors.sky},
    intervalChipText: {color: colors.textBody, fontWeight: '700', fontSize: 13},
    intervalChipTextOn: {color: colors.sky},
  });
}
