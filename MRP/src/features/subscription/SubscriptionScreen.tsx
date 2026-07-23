import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {getSubscriptionsCatalog} from './subscriptionCatalog';

type Props = {onBack?: () => void};

export function SubscriptionScreen({}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    tier,
    snapshot,
    loading,
    refresh,
    purchase,
    restore,
    activateEnterpriseKey,
    openManage,
    isPaid,
    billingMode,
    caps,
  } = useEntitlements();
  const [busy, setBusy] = useState(false);
  const [enterpriseKey, setEnterpriseKey] = useState('');
  const catalog = useMemo(() => getSubscriptionsCatalog(), []);

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      const result: any = await fn();
      if (result && result.ok === false) {
        Alert.alert('Purchase', result.message || 'Purchase did not complete');
      } else if (okMsg) {
        Alert.alert('Done', okMsg);
      }
    } catch (e: any) {
      Alert.alert('Billing error', e?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const selectPlan = (productId: string, basePlanId: string, title: string) => {
    const label =
      billingMode === 'hardcoded'
        ? `Select ${title}? Features unlock locally (test catalog — not charged).`
        : `Subscribe to ${title}?`;
    Alert.alert(title, label, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: billingMode === 'hardcoded' ? 'Enable' : 'Subscribe',
        onPress: () =>
          run(
            () => purchase(productId, basePlanId),
            billingMode === 'hardcoded'
              ? `${title} enabled for testing`
              : 'Subscription updated',
          ),
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Subscriptions</Text>
      <Text style={styles.sub}>
        Current plan: {tier.toUpperCase()}
        {snapshot.source !== 'none' ? ` · via ${snapshot.source}` : ''}
        {snapshot.productId ? ` · ${snapshot.productId}` : ''}
      </Text>

      {billingMode === 'hardcoded' ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Test catalog (Play Billing incomplete)</Text>
          <Text style={styles.warnBody}>
            Plans load from Subscriptions.json. Selecting a plan enables real FeatureGate caps
            locally. Complete Play Console later — see PLAY_BILLING_INCOMPLETE.md.
          </Text>
        </View>
      ) : (
        <Text style={styles.meta}>Live Play Billing mode.</Text>
      )}

      <Text style={styles.capsLine}>
        Caps now: {caps.simContacts} SIM contacts · {caps.timelineDays}-day timeline
        {caps.circleLive ? ' · Circle ON' : ' · Circle OFF'}
      </Text>

      {catalog.products.map(product => {
        const isCurrent = tier === product.tier;
        return (
          <View
            key={product.productId}
            style={[styles.card, isCurrent && styles.cardActive]}>
            <Text style={styles.cardTitle}>
              {product.title}
              {isCurrent ? ' · current' : ''}
            </Text>
            <Text style={styles.cardBody}>{product.description}</Text>
            <Text style={styles.productId}>{product.productId}</Text>
            {product.basePlans.map(bp => (
              <TouchableOpacity
                key={`${product.productId}-${bp.basePlanId}`}
                style={[styles.primaryBtn, isCurrent && styles.primaryBtnMuted]}
                disabled={busy}
                onPress={() =>
                  selectPlan(product.productId, bp.basePlanId, `${product.title} ${bp.label}`)
                }>
                <Text style={styles.primaryBtnText}>
                  {isCurrent && product.productId !== 'free'
                    ? `Selected · ${bp.label} ${bp.formattedPrice}`
                    : `${bp.label} · ${bp.formattedPrice}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Enterprise license key</Text>
        <TextInput
          style={styles.input}
          placeholder="MRP-ENT-…"
          placeholderTextColor={colors.textMuted}
          value={enterpriseKey}
          onChangeText={setEnterpriseKey}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={styles.outlineBtn}
          disabled={busy || !enterpriseKey.trim()}
          onPress={() =>
            run(() => activateEnterpriseKey(enterpriseKey.trim()), 'Enterprise activated')
          }>
          <Text style={styles.outlineBtnText}>Activate key</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.linkBtn}
        disabled={busy}
        onPress={() => run(() => restore(), 'Status refreshed')}>
        <Text style={styles.linkText}>
          {billingMode === 'hardcoded' ? 'Refresh entitlement' : 'Restore purchases'}
        </Text>
      </TouchableOpacity>
      {isPaid && billingMode === 'play' ? (
        <TouchableOpacity style={styles.linkBtn} disabled={busy} onPress={() => openManage()}>
          <Text style={styles.linkText}>Manage in Play Store</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.linkBtn} disabled={busy} onPress={() => refresh()}>
        <Text style={styles.linkText}>Refresh status</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    centered: {justifyContent: 'center', alignItems: 'center'},
    title: {fontSize: 22, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.sm},
    meta: {fontSize: 12, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18},
    capsLine: {
      fontSize: 12,
      color: colors.sky,
      fontWeight: '700',
      marginBottom: spacing.md,
    },
    warnCard: {
      backgroundColor: colors.amberSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.amber,
    },
    warnTitle: {fontSize: 13, fontWeight: '800', color: colors.amber, marginBottom: 4},
    warnBody: {fontSize: 12, color: colors.textBody, lineHeight: 18},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardActive: {borderColor: colors.sky},
    cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    cardBody: {fontSize: 13, color: colors.textBody, marginTop: 4, lineHeight: 19},
    productId: {
      fontSize: 11,
      color: colors.textMuted,
      fontFamily: 'monospace',
      marginTop: 6,
      marginBottom: 4,
    },
    input: {
      marginTop: spacing.sm,
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      color: colors.textPrimary,
    },
    primaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryBtnMuted: {opacity: 0.85},
    primaryBtnText: {color: '#fff', fontWeight: '800'},
    outlineBtn: {
      marginTop: spacing.sm,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.sky,
    },
    outlineBtnText: {color: colors.sky, fontWeight: '800'},
    linkBtn: {marginTop: spacing.md, alignItems: 'center'},
    linkText: {color: colors.sky, fontWeight: '700', fontSize: 14},
  });
}
