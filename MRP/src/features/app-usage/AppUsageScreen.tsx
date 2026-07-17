import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator} from 'react-native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {AppUsageDashboard} from './AppUsageDashboard';
import {AppUsageTimeline} from './AppUsageTimeline';
import {AppUsageReports} from './AppUsageReports';

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
};

export function AppUsageScreen() {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'TIMELINE' | 'REPORTS'>('DASHBOARD');
  const [sessions, setSessions] = useState<AppUsageSession[]>([]);
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [mrpBattery, setMrpBattery] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    checkPermissionAndLoad();
  }, []);

  const checkPermissionAndLoad = async () => {
    try {
      console.log('[AppUsageScreen] Checking permissions...');
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
      const [usageData, eventsData, mrpBatteryData] = await Promise.all([
        mrpmModule.getAppUsage(),
        mrpmModule.getEvents(),
        mrpmModule.getMrpBatteryUsage()
      ]);
      console.log('[AppUsageScreen] Usage data:', usageData);
      console.log('[AppUsageScreen] Events data:', eventsData);
      console.log('[AppUsageScreen] MRP battery data:', mrpBatteryData);
      console.log('[AppUsageScreen] Usage data type:', typeof usageData);
      console.log('[AppUsageScreen] Events data type:', typeof eventsData);
      console.log('[AppUsageScreen] Usage data length:', Array.isArray(usageData) ? usageData.length : 'N/A');
      console.log('[AppUsageScreen] Events data length:', Array.isArray(eventsData) ? eventsData.length : 'N/A');

      setSessions(Array.isArray(usageData) ? usageData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setMrpBattery(mrpBatteryData);
    } catch (e) {
      console.error('[AppUsageScreen] Failed to fetch data:', e);
      Alert.alert('Error', 'Failed to fetch data: ' + String(e));
    }
  };

  const handleRequestPermission = async () => {
    try {
      console.log('[AppUsageScreen] Requesting permission...');
      await mrpmModule.requestUsageStatsPermission();
    } catch (e) {
      console.error('[AppUsageScreen] Error requesting permission', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
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
        {activeTab === 'DASHBOARD' && <AppUsageDashboard sessions={sessions} events={events} mrpBattery={mrpBattery} onRefresh={fetchData} />}
        {activeTab === 'TIMELINE' && <AppUsageTimeline sessions={sessions} events={events} />}
        {activeTab === 'REPORTS' && <AppUsageReports sessions={sessions} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 16,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  permissionText: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  permissionButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  refreshButton: {
    paddingVertical: 14,
  },
  refreshButtonText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#38bdf8',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#38bdf8',
  },
  content: {
    flex: 1,
  },
});
