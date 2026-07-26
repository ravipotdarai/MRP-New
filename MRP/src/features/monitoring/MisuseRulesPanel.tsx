import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, Switch, ActivityIndicator} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type MisuseRule = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

/** Misuse rules UI — lives under Security → Setup (moved from App Usage → Safety). */
export function MisuseRulesPanel() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [rules, setRules] = useState<MisuseRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const misuse = await (mrpmModule as any).getMisuseRules?.();
      setRules(Array.isArray(misuse) ? misuse : []);
    } catch {
      setRules([]);
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
      await (mrpmModule as any).setMisuseRuleEnabled?.(id, enabled);
      setRules(prev => prev.map(r => (r.id === id ? {...r, enabled} : r)));
    } catch {
      /* ignore */
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
      <Text style={styles.sectionTitle}>MISUSE RULES</Text>
      <Text style={styles.muted}>
        Timeline alerts when a rule matches (max once per hour). Toggle master “App misuse alerts”
        above.
      </Text>
      {rules.length === 0 ? (
        <Text style={styles.muted}>No rules available.</Text>
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
    muted: {fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 18},
    appName: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
    checkDetail: {fontSize: 12, color: colors.textSecondary, marginTop: 2},
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
  });
}
