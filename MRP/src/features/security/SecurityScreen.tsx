import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
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
      <View style={styles.tabHeader}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}>
          {TABS.map(tab => {
            const isActive = active === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.activeTab]}
                onPress={() => setActive(tab.key)}
                activeOpacity={0.7}>
                <Text style={styles.tabIcon}>{tab.icon}</Text>
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
  tabHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  activeTab: {
    backgroundColor: colors.skySoft,
    borderColor: colors.sky,
  },
  tabIcon: {fontSize: 14, marginRight: 6},
  tabText: {fontSize: 13, color: colors.textSecondary, fontWeight: '600'},
  activeTabText: {color: colors.sky, fontWeight: '700'},
  content: {flex: 1},
});

