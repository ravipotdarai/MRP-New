import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Alert,
  AppState,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type RiskApp = {
  packageName: string;
  appName: string;
  installer: string;
  riskLevel: string;
  score: number;
  reasons: string[];
  hasDeviceAdmin: boolean;
  hasAccessibility: boolean;
};

type PostureCheck = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
  severity: string;
};

type MisuseRule = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export function AppSafetyScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [riskApps, setRiskApps] = useState<RiskApp[]>([]);
  const [grade, setGrade] = useState('Unknown');
  const [checks, setChecks] = useState<PostureCheck[]>([]);
  const [rules, setRules] = useState<MisuseRule[]>([]);
  const [scanning, setScanning] = useState(false);

  const applyRiskAndRules = useCallback((risk: any, misuse: any) => {
    const apps = Array.isArray(risk) ? risk : [];
    setRiskApps(
      apps.filter(
        (a: RiskApp) =>
          a.riskLevel === 'HIGH' ||
          a.riskLevel === 'CRITICAL' ||
          a.riskLevel === 'MEDIUM',
      ),
    );
    setRules(Array.isArray(misuse) ? misuse : []);
  }, []);

  const applyPostureSummary = useCallback((summary: any) => {
    if (summary?.grade) setGrade(summary.grade);
    if (summary?.lastJson) {
      try {
        const parsed = JSON.parse(summary.lastJson);
        setChecks(Array.isArray(parsed.checks) ? parsed.checks : []);
      } catch {
        setChecks([]);
      }
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const bridge = mrpmModule as any;
      const [risk, summary, misuse] = await Promise.all([
        bridge.getAppRiskReport?.() ?? Promise.resolve([]),
        bridge.getBreachPostureSummary?.() ?? Promise.resolve(null),
        bridge.getMisuseRules?.() ?? Promise.resolve([]),
      ]);
      applyRiskAndRules(risk, misuse);
      applyPostureSummary(summary);
    } catch (e) {
      console.warn('[AppSafety] load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyRiskAndRules, applyPostureSummary]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-check when returning from system Settings (disable admin / a11y / etc.)
  useFocusEffect(
    useCallback(() => {
      load();
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') load();
      });
      return () => sub.remove();
    }, [load]),
  );

  const runScan = async () => {
    setScanning(true);
    try {
      const bridge = mrpmModule as any;
      const report = await bridge.runBreachPostureScan?.();
      // Apply scan result immediately — do not wait for prefs reload
      if (report?.grade) setGrade(report.grade);
      if (Array.isArray(report?.checks)) setChecks(report.checks);

      // Refresh risky apps + misuse rules without clobbering fresh posture
      const [risk, misuse] = await Promise.all([
        bridge.getAppRiskReport?.() ?? Promise.resolve([]),
        bridge.getMisuseRules?.() ?? Promise.resolve([]),
      ]);
      applyRiskAndRules(risk, misuse);

      const failed = Array.isArray(report?.checks)
        ? report.checks.filter((c: PostureCheck) => !c.ok)
        : [];
      const detail =
        failed.length === 0
          ? 'No issues found.'
          : failed.map((c: PostureCheck) => `• ${c.title}: ${c.detail}`).join('\n');
      Alert.alert(`Security check: ${report?.grade || 'Unknown'}`, detail);
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message || String(e));
    } finally {
      setScanning(false);
    }
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    try {
      const bridge = mrpmModule as any;
      await bridge.setMisuseRuleEnabled?.(id, enabled);
      setRules(prev => prev.map(r => (r.id === id ? {...r, enabled} : r)));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update rule');
      // Re-sync from native if toggle failed
      try {
        const misuse = await (mrpmModule as any).getMisuseRules?.();
        if (Array.isArray(misuse)) setRules(misuse);
      } catch {
        /* ignore */
      }
    }
  };

  const openAppBatteryUsage = async () => {
    try {
      const ok = await (mrpmModule as any).openAppBatteryUsageSettings?.();
      if (!ok) {
        Alert.alert(
          'Open Battery settings',
          'Settings → Apps → MRP → App battery usage',
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open App battery usage');
    }
  };

  const gradeColor =
    grade === 'Healthy'
      ? colors.emerald
      : grade === 'Critical'
        ? colors.red
        : colors.amber;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.sky}
        />
      }>
      <Text style={styles.trust}>
        Heuristics only — MRP does not read SMS, chats, or your media. MRP's own
        Device Admin is expected for protection and is not treated as a Critical risk.
        Find and Recover web sync is not part of this screen.
      </Text>

      {/* Posture */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>SECURITY HEALTH</Text>
          <Text style={[styles.grade, {color: gradeColor}]}>{grade}</Text>
        </View>
        {checks.length === 0 ? (
          <Text style={styles.muted}>Run a check to see posture status.</Text>
        ) : (
          checks.map(c => {
            const canConfigureBattery = c.id === 'battery_exempt';
            const Row = canConfigureBattery ? TouchableOpacity : View;
            return (
              <Row
                key={c.id}
                style={styles.checkRow}
                {...(canConfigureBattery
                  ? {onPress: openAppBatteryUsage, activeOpacity: 0.7}
                  : {})}>
                <Text style={styles.checkIcon}>{c.ok ? '✓' : '!'}</Text>
                <View style={{flex: 1}}>
                  <Text style={styles.checkTitle}>{c.title}</Text>
                  <Text style={styles.checkDetail}>{c.detail}</Text>
                  {canConfigureBattery ? (
                    <Text style={styles.configureHint}>
                      Tap to change in Android App battery usage
                    </Text>
                  ) : null}
                </View>
              </Row>
            );
          })
        )}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={openAppBatteryUsage}>
          <Text style={styles.secondaryBtnText}>Configure App Battery Usage</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, scanning && {opacity: 0.7}]}
          disabled={scanning}
          onPress={runScan}>
          {scanning ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryBtnText}>Run security check</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Risky apps */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>RISKY / HIGH-PRIVILEGE APPS</Text>
        {riskApps.length === 0 ? (
          <Text style={styles.muted}>No medium+ risk apps detected.</Text>
        ) : (
          riskApps.slice(0, 25).map(app => (
            <TouchableOpacity
              key={app.packageName}
              style={styles.appRow}
              onPress={() =>
                Alert.alert(
                  app.appName,
                  `${app.packageName}\nInstaller: ${app.installer}\nScore: ${app.score} (${app.riskLevel})\n\n${(app.reasons || []).join('\n')}`,
                )
              }>
              <View style={{flex: 1}}>
                <Text style={styles.appName}>{app.appName}</Text>
                <Text style={styles.appPkg} numberOfLines={1}>
                  {app.packageName}
                </Text>
              </View>
              <Text
                style={[
                  styles.riskBadge,
                  {
                    color:
                      app.riskLevel === 'CRITICAL'
                        ? colors.red
                        : app.riskLevel === 'HIGH'
                          ? colors.amber
                          : colors.sky,
                  },
                ]}>
                {app.riskLevel}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Misuse rules */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>MISUSE RULES</Text>
        <Text style={styles.muted}>
          Alerts appear on Timeline when a rule matches (max once per hour).
        </Text>
        {rules.map(rule => (
          <View key={rule.id} style={styles.ruleRow}>
            <View style={{flex: 1, paddingRight: 8}}>
              <Text style={styles.appName}>{rule.title}</Text>
              <Text style={styles.checkDetail}>{rule.description}</Text>
            </View>
            <Switch
              value={rule.enabled}
              onValueChange={v => toggleRule(rule.id, v)}
              trackColor={{false: colors.border, true: colors.emeraldDark}}
              thumbColor={rule.enabled ? colors.emerald : colors.textSecondary}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    content: {padding: spacing.md, paddingBottom: 40},
    center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    trust: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: spacing.md,
      lineHeight: 17,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    grade: {fontSize: 16, fontWeight: '800'},
    muted: {fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm},
    checkRow: {flexDirection: 'row', marginBottom: 10, gap: 8},
    checkIcon: {fontSize: 14, fontWeight: '800', color: colors.textPrimary, width: 18},
    checkTitle: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    checkDetail: {fontSize: 12, color: colors.textSecondary, marginTop: 2},
    configureHint: {
      fontSize: 11,
      color: colors.sky,
      marginTop: 4,
      fontWeight: '600',
    },
    primaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.sky,
      paddingVertical: 12,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    primaryBtnText: {color: colors.bg, fontWeight: '700'},
    secondaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingVertical: 12,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    secondaryBtnText: {color: colors.sky, fontWeight: '700'},
    appRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    appName: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    appPkg: {fontSize: 11, color: colors.textMuted, marginTop: 2},
    riskBadge: {fontSize: 11, fontWeight: '800'},
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
  });
}
