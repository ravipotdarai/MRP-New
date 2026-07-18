import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {colors, spacing, radius} from '../../shared/theme';
import {MonitoringScreen} from '../monitoring/MonitoringScreen';
import {TimelineScreen} from '../graph/TimelineScreen';
import {PhotoGallery} from '../photos/PhotoGallery';
import {PermissionsScreen} from '../../screens/PermissionsScreen';

type SecurityTab = 'MONITORING' | 'TIMELINE' | 'PHOTOS' | 'PERMISSIONS';

const TABS: {key: SecurityTab; label: string; icon: string}[] = [
  {key: 'MONITORING', label: 'Monitoring', icon: '🛡️'},
  {key: 'TIMELINE', label: 'Timeline', icon: '📋'},
  {key: 'PHOTOS', label: 'Photos', icon: '📷'},
  {key: 'PERMISSIONS', label: 'Permissions', icon: '🔒'},
];

export function SecurityScreen({route}: {route?: any}) {
  const [active, setActive] = useState<SecurityTab>('MONITORING');

  // Allow deep-linking from Home ("View All" → Timeline, "Manage" → Monitoring)
  useEffect(() => {
    const initial = route?.params?.initialTab as SecurityTab | undefined;
    if (initial && TABS.some(t => t.key === initial)) {
      setActive(initial);
    }
  }, [route?.params?.initialTab]);

  return (
    <View style={styles.container}>
      {/* Security header + segmented tabs */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active === tab.key && styles.activeTab]}
              onPress={() => setActive(tab.key)}>
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text
                style={[styles.tabText, active === tab.key && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.content}>
        {active === 'MONITORING' && <MonitoringScreen />}
        {active === 'TIMELINE' && <TimelineScreen />}
        {active === 'PHOTOS' && <PhotoGallery />}
        {active === 'PERMISSIONS' && <PermissionsScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md},
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  activeTab: {backgroundColor: colors.surface},
  tabIcon: {fontSize: 14},
  tabText: {fontSize: 10, color: colors.textMuted, fontWeight: '600', marginTop: 2, textAlign: 'center'},
  activeTabText: {color: colors.sky},
  content: {flex: 1},
});
