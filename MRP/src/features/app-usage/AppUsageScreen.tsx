import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {AppUsageDashboard} from './AppUsageDashboard';
import {AppUsageTimeline} from './AppUsageTimeline';
import {AppUsageReports} from './AppUsageReports';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

export type AppUsageSession = {
  packageName: string;
  appName: string;
  category: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  batteryLevel?: number;
  networkType?: string;
  latitude?: number;
  longitude?: number;
};

export type UnifiedEvent = {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  syncStatus: string;
  latitude?: number;
  longitude?: number;
  intruderId?: string;
  photoPath?: string;
};

type AppUsageTab = 'DASHBOARD' | 'TIMELINE' | 'REPORTS';

export function AppUsageScreen({route}: {route?: any}) {
  const [activeTab, setActiveTab] = useState<AppUsageTab>('DASHBOARD');
  const [sessions, setSessions] = useState<AppUsageSession[]>([]);
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [mrpBattery, setMrpBattery] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const {colors} = useTheme();
  const styles = useMemo(() => createAppUsageStyles(colors), [colors]);

  const applyInitialTab = useCallback(() => {
    const t = route?.params?.initialTab as AppUsageTab | undefined;
    if (t === 'DASHBOARD' || t === 'TIMELINE' || t === 'REPORTS') {
      setActiveTab(t);
    }
  }, [route?.params?.initialTab]);

  useEffect(() => {
    applyInitialTab();
  }, [applyInitialTab]);

  useFocusEffect(
    useCallback(() => {
      applyInitialTab();
    }, [applyInitialTab]),
  );

  useEffect(() => {
    checkPermissionAndLoad();
  }, []);

  const checkPermissionAndLoad = async () => {
    try {
      console.log('[AppUsageScreen] Checking permissions...');
      if (!mrpmModule) {
        console.error('[AppUsageScreen] MrpNative module not available');
        setHasPermission(false);
        setLoading(false);
        return;
      }
      const perm = await mrpmModule.hasUsageStatsPermission();
      console.log('[AppUsageScreen] Has permission:', perm);
      setHasPermission(perm);
      if (perm) {
        await fetchData();
      }
    } catch (e) {
      console.error('[AppUsageScreen] Failed to check permission', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      console.log('[AppUsageScreen] Fetching data...');
      if (!mrpmModule) {
        console.error('[AppUsageScreen] MrpNative module not available');
        return;
      }
      // Events come from getTimeline() — getEvents() reads a separate store that
      // is never written. Photos feed the "Photos captured today" count.
      const [usageRes, timelineRes, photosRes, batteryRes] = await Promise.allSettled([
        // 30 days so Reports WEEKLY/MONTHLY have data; Dashboard filters to today
        (mrpmModule as any).getAppUsageForRange
          ? (mrpmModule as any).getAppUsageForRange(30)
          : mrpmModule.getAppUsage(),
        mrpmModule.getTimeline(),
        mrpmModule.getPhotos(),
        mrpmModule.getMrpBatteryUsage(),
      ]);

      const usageData = usageRes.status === 'fulfilled' ? usageRes.value : [];
      const timelineData = timelineRes.status === 'fulfilled' ? timelineRes.value : [];
      const photosData = photosRes.status === 'fulfilled' ? photosRes.value : [];
      const mrpBatteryData = batteryRes.status === 'fulfilled' ? batteryRes.value : null;

      if (usageRes.status === 'rejected') console.error('[AppUsageScreen] getAppUsage failed:', usageRes.reason);
      if (timelineRes.status === 'rejected') console.error('[AppUsageScreen] getTimeline failed:', timelineRes.reason);
      if (photosRes.status === 'rejected') console.error('[AppUsageScreen] getPhotos failed:', photosRes.reason);
      if (batteryRes.status === 'rejected') console.error('[AppUsageScreen] getMrpBatteryUsage failed:', batteryRes.reason);

      console.log('[AppUsageScreen] Usage length:', Array.isArray(usageData) ? usageData.length : 0);
      console.log('[AppUsageScreen] Timeline length:', Array.isArray(timelineData) ? timelineData.length : 0);

      setSessions(Array.isArray(usageData) ? usageData : []);
      setEvents(mapTimelineToEvents(Array.isArray(timelineData) ? timelineData : []));
      setPhotos(Array.isArray(photosData) ? photosData : []);
      setMrpBattery(mrpBatteryData);
    } catch (e) {
      console.error('[AppUsageScreen] Failed to fetch data:', e);
      Alert.alert('Error', 'Failed to fetch data: ' + String(e));
    }
  };

  // Map timeline entries (the real event store) into the UnifiedEvent shape the
  // dashboard/timeline expect: top-level type/timestamp/description/lat/lng.
  const mapTimelineToEvents = (tl: any[]): UnifiedEvent[] =>
    (tl || []).map(e => ({
      id: e.id,
      type: e.event_type,
      timestamp: Date.parse(e.timestamp) || Number(e.timestamp) || 0,
      description: e.metadata?.description || e.status || '',
      syncStatus: 'SYNCED',
      latitude: e.location?.latitude || undefined,
      longitude: e.location?.longitude || undefined,
      intruderId: e.metadata?.intruderId,
      photoPath: e.metadata?.photoPath || '',
    }));

  const handleRequestPermission = async () => {
    try {
      console.log('[AppUsageScreen] Requesting permission...');
      if (!mrpmModule) {
        console.error('[AppUsageScreen] MrpNative module not available');
        Alert.alert('Error', 'Native module not available');
        return;
      }
      await mrpmModule.requestUsageStatsPermission();
    } catch (e) {
      console.error('[AppUsageScreen] Error requesting permission', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.sky} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Usage Access Required</Text>
        <Text style={styles.permissionText}>
          To provide App Usage Analytics and Reports, MRP needs Usage Access permission.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={handleRequestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission in Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshButton} onPress={checkPermissionAndLoad}>
          <Text style={styles.refreshButtonText}>I already granted it (Refresh)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'DASHBOARD' && styles.activeTab]}
          onPress={() => setActiveTab('DASHBOARD')}
        >
          <Text style={[styles.tabText, activeTab === 'DASHBOARD' && styles.activeTabText]}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'TIMELINE' && styles.activeTab]}
          onPress={() => setActiveTab('TIMELINE')}
        >
          <Text style={[styles.tabText, activeTab === 'TIMELINE' && styles.activeTabText]}>Timeline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'REPORTS' && styles.activeTab]}
          onPress={() => setActiveTab('REPORTS')}
        >
          <Text style={[styles.tabText, activeTab === 'REPORTS' && styles.activeTabText]}>Reports</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {activeTab === 'DASHBOARD' && <AppUsageDashboard sessions={sessions} events={events} photos={photos} mrpBattery={mrpBattery} onRefresh={fetchData} />}
        {activeTab === 'TIMELINE' && <AppUsageTimeline sessions={sessions} events={events} />}
        {activeTab === 'REPORTS' && <AppUsageReports sessions={sessions} />}
      </View>
    </SafeAreaView>
  );
}

function createAppUsageStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 16,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  permissionText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: colors.sky,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  permissionButtonText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: 'bold',
  },
  refreshButton: {
    paddingVertical: 14,
  },
  refreshButtonText: {
    color: colors.sky,
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.sky,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.sky,
  },
  content: {
    flex: 1,
  },
});
}