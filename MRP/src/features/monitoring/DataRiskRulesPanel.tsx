import React, {useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type DataRiskRule = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

/** Abuse / data-risk permission criteria — Security → Setup. */
export function DataRiskRulesPanel() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rules, setRules] = useState<DataRiskRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await mrpmModule.getDataRiskRules();
      setRules(Array.isArray(list) ? list : []);
      if (!Array.isArray(list) || list.length === 0) {
        setError('Could not load abuse-app criteria from native.');
      }
    } catch (e: any) {
      setRules([]);
      setError(e?.message || 'Failed to load abuse-app criteria');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggleRule = async (id: string, enabled: boolean) => {
    try {
      await mrpmModule.setDataRiskRuleEnabled(id, enabled);
      setRules(prev => prev.map(r => (r.id === id ? {...r, enabled} : r)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update rule');
    }
  };

  const scanNow = async () => {
    setScanning(true);
    setError(null);
    try {
      await mrpmModule.evaluateDataRiskRules();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>ABUSE APP CRITERIA</Text>
      <Text style={styles.muted}>
        Timeline alert (DATA_RISK_APP) when a non-system app matches a permission
        combo. Max once per rule every 6 hours. Requires monitoring ON.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rules.length === 0 ? (
        <Text style={styles.muted}>No criteria available.</Text>
      ) : (
        rules.map(rule => (
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
        ))
      )}
      <TouchableOpacity
        style={[styles.scanBtn, scanning && {opacity: 0.7}]}
        disabled={scanning}
        onPress={scanNow}>
        {scanning ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.scanBtnText}>Scan installed apps now</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
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
    muted: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      lineHeight: 18,
    },
    error: {
      fontSize: 12,
      color: colors.red,
      marginBottom: spacing.sm,
    },
    appName: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    checkDetail: {fontSize: 12, color: colors.textSecondary, marginTop: 2},
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    scanBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.sky,
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    scanBtnText: {
      color: colors.bg,
      fontWeight: '700',
      fontSize: 13,
    },
  });
}
