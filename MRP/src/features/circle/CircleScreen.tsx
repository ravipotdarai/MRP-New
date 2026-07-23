import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import {PaywallModal} from '../subscription/PaywallModal';
import {CIRCLE_CATEGORIES, createLocalCircle, getCircleCategory} from './circleCatalog';
import {
  addMemberByInvite,
  addSimulatedPeer,
  removeMember,
  revokeAllConsent,
  setMemberConsent,
} from './circleInvite';
import {loadLocalCircles, saveLocalCircles} from './circleLocalStore';
import type {CircleCategoryCode, LocalCircle} from './circleTypes';

type Props = {
  onUpgrade?: () => void;
};

type Mode = 'list' | 'create' | 'join' | 'detail';

export function CircleScreen({onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature, tier, caps} = useEntitlements();
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

  const selected = useMemo(
    () => circles.find(c => c.id === selectedId) ?? null,
    [circles, selectedId],
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

  const requireEnterprise = () => {
    if (!unlocked) {
      setPaywallVisible(true);
      return false;
    }
    return true;
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
      const next = [result.circle, ...circles];
      await persist(next);
      setName('');
      setSelectedId(result.circle.id);
      setMode('detail');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (!requireEnterprise()) return;
    setBusy(true);
    try {
      const result = addMemberByInvite(circles, joinCode, joinName);
      if (!result.ok) {
        Alert.alert('Cannot join', result.reason);
        return;
      }
      await persist(result.circles);
      setJoinCode('');
      setJoinName('');
      setSelectedId(result.circleId);
      setMode('detail');
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
    try {
      await Share.share({
        message: `Join my MRP Circle "${circle.name}" with invite code: ${circle.inviteCode}`,
      });
    } catch {
      Alert.alert('Invite code', circle.inviteCode);
    }
  };

  if (!unlocked) {
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Enterprise required</Text>
          <Text style={styles.body}>
            Circle live share is an Enterprise feature. Your current plan is {tier}. Upgrade in
            Subscriptions to unlock categories and create circles.
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
    const owner = selected.members.find(m => m.role === 'owner');
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => setMode('list')} hitSlop={12}>
          <Text style={styles.backLink}>← Circles</Text>
        </TouchableOpacity>
        <Text style={styles.hero}>{selected.name}</Text>
        <Text style={styles.sub}>
          {cat?.label ?? selected.category} · {selected.memberCount}/{selected.maxMembers} members
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite code</Text>
          <Text style={styles.inviteCode}>{selected.inviteCode}</Text>
          <Text style={styles.body}>
            Share this code so others can join. FCM deep links come with NestJS (P6). On one device,
            use “Add test peer” or Join with code.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => shareInvite(selected)}>
            <Text style={styles.primaryBtnText}>Share invite</Text>
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
          <Text style={styles.body}>
            Live location stays off until every member consents. Map relay ships next.
          </Text>
          <View
            style={[
              styles.liveBanner,
              selected.liveReady ? styles.liveReady : styles.liveBlocked,
            ]}>
            <Text style={styles.liveBannerText}>
              {selected.liveReady
                ? 'Live ready — mutual consent OK (map next)'
                : selected.members.length < 2
                  ? 'Need at least 2 members, then mutual consent'
                  : 'Live blocked — waiting for all consents'}
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
                  {m.consentLive ? 'Consented to live share' : 'Has not consented'}
                </Text>
              </View>
              <Switch
                value={m.consentLive}
                onValueChange={async v => {
                  await updateSelected(c => setMemberConsent(c, m.id, v));
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
              await updateSelected(c => revokeAllConsent(c));
            }}>
            <Text style={styles.secondaryBtnText}>Revoke all consent</Text>
          </TouchableOpacity>
        </View>

        {owner ? (
          <Text style={styles.hint}>
            Tip: toggle consent for You and each peer to unlock “Live ready”.
          </Text>
        ) : null}

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
        Create or join a circle. Mutual consent is required before live location (map next).
      </Text>

      {mode === 'list' ? (
        <View style={styles.rowBtns}>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.flexBtn]}
            onPress={() => setMode('create')}
            activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flexBtn, {marginRight: 0}]}
            onPress={() => setMode('join')}
            activeOpacity={0.8}>
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
          {CIRCLE_CATEGORIES.map(cat => {
            const selectedCat = category === cat.code;
            return (
              <TouchableOpacity
                key={cat.code}
                style={[styles.catRow, selectedCat && styles.catRowSelected]}
                onPress={() => setCategory(cat.code)}
                activeOpacity={0.75}>
                <View style={styles.catText}>
                  <Text style={styles.catLabel}>{cat.label}</Text>
                  <Text style={styles.catDesc}>
                    {cat.description} · max {cat.maxMembers}
                  </Text>
                </View>
                <Text style={styles.catCheck}>{selectedCat ? '●' : '○'}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setMode('list')}
              disabled={busy}>
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
            placeholder="e.g. AB12CD"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={12}
            autoFocus
          />
          <Text style={styles.label}>Your display name</Text>
          <TextInput
            style={styles.input}
            value={joinName}
            onChangeText={setJoinName}
            placeholder="Name shown to the circle"
            placeholderTextColor={colors.textMuted}
            maxLength={32}
          />
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setMode('list')}
              disabled={busy}>
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
        <ActivityIndicator color={colors.sky} style={{marginTop: spacing.md}} />
      ) : circles.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>No circles yet. Create one or join with a code.</Text>
        </View>
      ) : (
        circles.map(c => {
          const cat = getCircleCategory(c.category);
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.circleCard}
              activeOpacity={0.75}
              onPress={() => {
                setSelectedId(c.id);
                setMode('detail');
              }}>
              <View style={styles.circleMain}>
                <Text style={styles.circleName}>{c.name}</Text>
                <Text style={styles.circleMeta}>
                  {cat?.label ?? c.category} · {c.memberCount}/{c.maxMembers} · code {c.inviteCode}
                </Text>
                <Text style={styles.circleHint}>
                  {c.liveReady ? 'Live ready (consent OK)' : 'Open for invite & consent'}
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
    hint: {fontSize: 12, color: colors.textMuted, marginBottom: spacing.md},
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
      letterSpacing: 0.4,
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
    catRowSelected: {
      borderColor: colors.sky,
      backgroundColor: colors.skySoft,
    },
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
      letterSpacing: 0.5,
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
    liveBanner: {
      borderRadius: radius.md,
      padding: 12,
      marginBottom: spacing.sm,
    },
    liveReady: {backgroundColor: colors.emeraldSoft},
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
  });
}
