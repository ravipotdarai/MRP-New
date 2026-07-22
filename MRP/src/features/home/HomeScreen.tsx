import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  RefreshControl,
  AppState,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {useSettings} from '../../shared/hooks/useSettings';
import {findMatchingSelfie} from '../../shared/utils/selfieMatcher';
import {AppMenuDrawer, AppMenuTarget} from '../../shared/components/AppMenuDrawer';
import {ThemePickerModal} from '../../shared/components/ThemePickerModal';

const USER_NAME = 'Ravi';

const EVENT_ICONS: Record<string, string> = {
  SCREEN_LOCK: '🔒',
  SCREEN_UNLOCK: '🔓',
  UNLOCK_FAILED: '⚠️',
  WRONG_UNLOCK_ATTEMPT: '⚠️',
  WRONG_PASSWORD: '🚨',
  WRONG_BIOMETRIC: '👆',
  SIM_REMOVED: '📵',
  SIM_INSERTED: '📱',
  SIM_CHANGE: '🔄',
  FACTORY_RESET: '💣',
  DEVICE_SHUTDOWN: '🔴',
  DEVICE_REBOOT: '🔄',
  AIRPLANE_MODE_TOGGLE: '✈️',
  WIFI_TOGGLE: '📶',
  WIFI_ENABLED: '📶',
  WIFI_DISABLED: '📶',
  MOBILE_DATA_TOGGLE: '📱',
  MOBILE_DATA_ENABLED: '📱',
  MOBILE_DATA_DISABLED: '📱',
  HOTSPOT_TOGGLE: '🔥',
  HOTSPOT_ENABLED: '🔥',
  HOTSPOT_DISABLED: '🔥',
  BLUETOOTH_TOGGLE: '🎧',
  USB_CONNECTED: '💻',
  USB_DISCONNECTED: '🚫',
  APP_INSTALLED: '📦',
  APP_UPDATED: '📦',
  APP_MISUSE: '📵',
  POSTURE_ALERT: '🛡️',
};

interface TimelineEntry {
  id: string;
  timestamp: string;
  event_type: string;
  status: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    detailed_address: string;
  };
  geofence_status: {inside_fence: boolean; fence_id: string | null};
  metadata: Record<string, any>;
}

interface PhotoItem {
  path: string;
  timestamp: number;
  name?: string;
}

interface GpsStatus {
  gpsActive: boolean;
  networkLocationActive: boolean;
  permissionGranted: boolean;
  isLocationAvailable: boolean;
}

interface NetworkInfo {
  carrierName: string;
  connectionType: string;
  isWifi: boolean;
  isMobile: boolean;
}

const formatEventType = (type: string | undefined): string => {
  if (!type) return 'Unknown Event';
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

const getGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const formatTime = (ts: string): string => {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
  } catch {
    return '';
  }
};

const relativeTime = (ts: string | number): string => {
  try {
    const t = typeof ts === 'string' ? Date.parse(ts) : ts;
    if (isNaN(t)) return 'never';
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return 'never';
  }
};

export function HomeScreen({
  navigation,
  onLogout,
}: {
  navigation: any;
  onLogout?: () => void;
}) {
  const {settings} = useSettings();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [liveLocation, setLiveLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    detailed_address: string;
  } | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [gps, setGps] = useState<GpsStatus | null>(null);
  const [permFlags, setPermFlags] = useState({
    camera: false,
    location: false,
    overlay: false,
    admin: false,
    usageStats: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const {colors} = useTheme();
  const styles = useMemo(() => createHomeStyles(colors), [colors]);

  const [recoveryContactOk, setRecoveryContactOk] = useState(false);
  const [postureGrade, setPostureGrade] = useState<string>('Unknown');
  const [postureIssueCount, setPostureIssueCount] = useState(0);
  const [highRiskCount, setHighRiskCount] = useState(0);

  const loadAll = useCallback(async () => {
    const bridge = mrpmModule as any;
    const [tRes, pRes, nRes, gRes, camRes, locRes, ovRes, adRes, usRes, liveRes, simRes, postureRes, riskRes] =
      await Promise.allSettled([
        mrpmModule.getTimeline(),
        mrpmModule.getPhotos(),
        mrpmModule.getNetworkInfo(),
        mrpmModule.getGpsStatus(),
        mrpmModule.checkCameraPermission(),
        mrpmModule.checkLocationPermission(),
        mrpmModule.checkOverlayPermission(),
        mrpmModule.isDeviceAdminEnabled(),
        mrpmModule.hasUsageStatsPermission(),
        mrpmModule.getCurrentLocationWithAddress?.() ?? Promise.resolve(null),
        bridge.getSimRecoveryStatus?.() ?? Promise.resolve(null),
        bridge.getBreachPostureSummary?.() ?? Promise.resolve(null),
        bridge.getAppRiskReport?.() ?? Promise.resolve([]),
      ]);

    if (tRes.status === 'fulfilled') setTimeline(Array.isArray(tRes.value) ? tRes.value : []);
    if (pRes.status === 'fulfilled') setPhotos(Array.isArray(pRes.value) ? pRes.value : []);
    if (nRes.status === 'fulfilled') setNetwork(nRes.value as NetworkInfo);
    if (gRes.status === 'fulfilled') setGps(gRes.value as GpsStatus);
    if (liveRes.status === 'fulfilled' && liveRes.value) {
      setLiveLocation(liveRes.value as typeof liveLocation);
    }
    if (simRes.status === 'fulfilled' && simRes.value) {
      const st = simRes.value as {enabled?: boolean; hasContacts?: boolean};
      setRecoveryContactOk(!!(st.enabled && st.hasContacts));
    }
    if (postureRes.status === 'fulfilled' && postureRes.value) {
      const summary = postureRes.value as {grade?: string; lastJson?: string};
      const g = summary.grade;
      setPostureGrade(g && g.length ? g : 'Unknown');
      let issues = 0;
      if (summary.lastJson) {
        try {
          const parsed = JSON.parse(summary.lastJson);
          const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
          issues = checks.filter((c: {ok?: boolean}) => c && c.ok === false).length;
        } catch {
          issues = 0;
        }
      }
      // Critical / Attention with no parsed checks still counts as at least 1
      if (issues === 0 && (g === 'Critical' || g === 'Attention')) {
        issues = 1;
      }
      setPostureIssueCount(issues);
    }
    if (riskRes.status === 'fulfilled') {
      const apps = Array.isArray(riskRes.value) ? riskRes.value : [];
      setHighRiskCount(
        apps.filter(
          (a: {riskLevel?: string}) =>
            a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL',
        ).length,
      );
    }
    setPermFlags({
      camera: camRes.status === 'fulfilled' ? !!camRes.value : false,
      location: locRes.status === 'fulfilled' ? !!locRes.value : false,
      overlay: ovRes.status === 'fulfilled' ? !!ovRes.value : false,
      admin: adRes.status === 'fulfilled' ? !!adRes.value : false,
      usageStats: usRes.status === 'fulfilled' ? !!usRes.value : false,
    });
  }, []);

  // Refresh only when Home is opened / focused — no continuous polling
  useFocusEffect(
    useCallback(() => {
      loadAll();
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') {
          loadAll();
        }
      });
      return () => sub.remove();
    }, [loadAll]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  // Match a selfie to an event (by event-type prefix + tight time window)
  const findMatchingPhoto = (entry: TimelineEntry): PhotoItem | null => {
    return findMatchingSelfie(entry.event_type, entry.timestamp, photos);
  };

  // --- Security score (real, computed) ---
  const computeScore = (): number => {
    let score = 100;
    if (!settings.isMonitoringEnabled) score -= 25;
    if (!permFlags.camera) score -= 10;
    if (!permFlags.location) score -= 10;
    if (!permFlags.overlay) score -= 10;
    if (!permFlags.admin) score -= 10;
    if (!permFlags.usageStats) score -= 5;
    const features = [
      settings.captureOnWrongUnlock,
      settings.captureOnUsb,
      settings.captureOnSimChange,
      settings.captureOnFactoryReset,
      settings.captureOnWifiToggle,
      settings.captureOnAirplaneMode,
      settings.captureOnMobileData,
      settings.captureOnHotspot,
    ];
    const enabledCount = features.filter(Boolean).length;
    if (enabledCount === 0) score -= 20;
    else if (enabledCount < 3) score -= 10;
    return Math.max(0, Math.min(100, score));
  };

  const securityScore = computeScore();
  const protectionGaps: string[] = [];
  if (!settings.isMonitoringEnabled) protectionGaps.push('Monitoring off');
  if (!permFlags.camera) protectionGaps.push('Camera');
  if (!permFlags.location) protectionGaps.push('Location');
  if (!permFlags.overlay) protectionGaps.push('Display over other apps');
  if (!permFlags.admin) protectionGaps.push('Device Admin');
  const isProtected = protectionGaps.length === 0;

  const latestEvent = timeline[0] ?? null;
  const latestPhoto = latestEvent ? findMatchingPhoto(latestEvent) : null;

  const isToday = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    } catch {
      return false;
    }
  };
  const todayEvents = timeline.filter(e => isToday(e.timestamp)).slice(0, 5);

  const lastSynced = latestEvent ? relativeTime(latestEvent.timestamp) : 'never';

  const overview = [
    {
      icon: '🛡️',
      label: 'Anti Theft',
      ok: settings.isMonitoringEnabled && (settings.captureOnWrongUnlock || settings.captureOnUsb),
      status: undefined as string | undefined,
      statusTone: undefined as 'ok' | 'warn' | 'bad' | 'muted' | undefined,
    },
    {
      icon: '🔄',
      label: 'SIM Monitoring',
      ok: settings.captureOnSimChange,
      status: undefined as string | undefined,
      statusTone: undefined as 'ok' | 'warn' | 'bad' | 'muted' | undefined,
    },
    {
      icon: '👤',
      label: 'Recovery Contact',
      ok: recoveryContactOk,
      status: undefined as string | undefined,
      statusTone: undefined as 'ok' | 'warn' | 'bad' | 'muted' | undefined,
    },
    {
      icon: '🔐',
      label: 'Security Health',
      ok: postureIssueCount === 0 && postureGrade !== 'Critical' && postureGrade !== 'Attention',
      // Number only (never "Critical" / "Attention") — red when issues > 0
      status:
        postureGrade === 'Unknown' && postureIssueCount === 0
          ? '—'
          : postureIssueCount === 0
            ? '✓'
            : String(postureIssueCount),
      statusTone:
        postureIssueCount > 0
          ? ('bad' as const)
          : postureGrade === 'Unknown'
            ? ('muted' as const)
            : ('ok' as const),
    },
    {
      icon: '📦',
      label: 'App Safety',
      ok: highRiskCount === 0,
      status: highRiskCount === 0 ? '✓' : String(highRiskCount),
      statusTone: (highRiskCount > 0 ? 'bad' : 'ok') as 'ok' | 'warn' | 'bad' | 'muted' | undefined,
    },
    {
      icon: '📍',
      label: 'Geofence',
      ok: permFlags.location,
      status: undefined as string | undefined,
      statusTone: undefined as 'ok' | 'warn' | 'bad' | 'muted' | undefined,
    },
    {
      icon: '📊',
      label: 'App Usage',
      ok: permFlags.usageStats,
      status: undefined as string | undefined,
      statusTone: undefined as 'ok' | 'warn' | 'bad' | 'muted' | undefined,
    },
  ];

  const openMaps = (lat: number, lng: number) => {
    if (!lat && !lng) return;
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() =>
      Alert.alert('Error', 'Could not open maps'),
    );
  };

  const goToSecurity = (tab?: string) => {
    if (!navigation?.navigate) return;
    const key =
      tab === 'Monitoring' || tab === 'MONITORING'
        ? 'MONITORING'
        : tab === 'Timeline' || tab === 'TIMELINE'
          ? 'TIMELINE'
          : tab === 'Photos' || tab === 'PHOTOS'
            ? 'PHOTOS'
            : tab === 'Permissions' || tab === 'PERMISSIONS'
              ? 'PERMISSIONS'
              : undefined;
    navigation.navigate('Security', key ? {initialTab: key} : undefined);
  };

  const onMenuNavigate = (target: AppMenuTarget) => {
    if (!navigation?.navigate) return;
    if (target.screen === 'Home') {
      navigation.navigate('Home');
      return;
    }
    if (target.screen === 'About') {
      navigation.navigate('About');
      return;
    }
    if (target.screen === 'Security') {
      navigation.navigate('Security', {initialTab: target.tab});
      return;
    }
    if (target.screen === 'App Usage') {
      navigation.navigate('App Usage', {initialTab: target.tab});
    }
  };

  const handleAvatarPress = () => {
    if (!onLogout) return;
    Alert.alert('MRP Account', 'Sign out of MRP?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign Out', style: 'destructive', onPress: onLogout},
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sky} />
      }>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="Open menu">
          <Text style={styles.headerMenuIcon}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.brandTitle}>MRP</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setThemePickerOpen(true)}
            accessibilityLabel="Color theme">
            <Text style={styles.headerIcon}>🎨</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} accessibilityLabel="Notifications">
            <Text style={styles.headerIcon}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatarBtn} onPress={handleAvatarPress}>
            <Text style={styles.avatarText}>{USER_NAME[0]}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AppMenuDrawer
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={onMenuNavigate}
      />
      <ThemePickerModal
        visible={themePickerOpen}
        onClose={() => setThemePickerOpen(false)}
      />

      {/* Greeting + protection status */}
      <View style={styles.greetingRow}>
        <View style={{flex: 1}}>
          <Text style={styles.greeting}>
            {getGreeting()}, {USER_NAME} 👋
          </Text>
          <Text
            style={[
              styles.protectionStatus,
              {color: isProtected ? colors.emerald : colors.amber},
            ]}>
            {isProtected ? '✓ Your device is protected' : '⚠ Protection incomplete'}
          </Text>
          {!isProtected ? (
            <Text style={styles.syncedText} numberOfLines={2}>
              Missing: {protectionGaps.join(', ')}
            </Text>
          ) : null}
          <Text style={styles.syncedText}>Last synced {lastSynced}</Text>
        </View>
      </View>

      {/* Stat cards: Security score, About, Network, GPS */}
      <View style={styles.statGrid}>
        <StatCard
          icon="🔒"
          label="Security Score"
          value={`${securityScore}%`}
          accent={securityScore >= 80 ? colors.emerald : securityScore >= 50 ? colors.amber : colors.red}
          styles={styles}
        />
        <StatCard
          icon="ℹ️"
          label="How to use →"
          value="MRP Guide"
          accent={colors.sky}
          styles={styles}
          onPress={() => navigation?.navigate?.('About')}
        />
        <StatCard
          icon="📶"
          label="Network"
          value={network ? network.connectionType : '--'}
          sub={network && network.carrierName && network.carrierName !== 'Unknown' ? network.carrierName : undefined}
          accent={network && network.connectionType !== 'Offline' ? colors.sky : colors.red}
          styles={styles}
        />
        <StatCard
          icon="📡"
          label="GPS"
          value={gps?.gpsActive ? 'Active' : gps?.isLocationAvailable ? 'Network' : 'Off'}
          accent={gps?.isLocationAvailable ? colors.emerald : colors.red}
          styles={styles}
        />
      </View>

      {/* Latest Event */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>LATEST EVENT</Text>
          <TouchableOpacity onPress={() => goToSecurity('Timeline')}>
            <Text style={styles.viewAllText}>View All →</Text>
          </TouchableOpacity>
        </View>
        {latestEvent ? (
          <View style={styles.latestEventBody}>
            <View style={styles.latestEventTop}>
              <View style={styles.latestEventIcon}>
                <Text style={{fontSize: 22}}>{EVENT_ICONS[latestEvent.event_type] || '📋'}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.latestEventTitle}>
                  {formatEventType(latestEvent.event_type)}
                </Text>
                <Text style={styles.latestEventTime}>
                  {relativeTime(latestEvent.timestamp)}
                </Text>
              </View>
              {latestPhoto ? (
                <Image
                  source={{uri: `file://${latestPhoto.path}`}}
                  style={styles.latestEventSelfie}
                />
              ) : null}
            </View>
            {latestEvent.location?.detailed_address &&
              latestEvent.location.detailed_address !== 'Address Unavailable (Offline)' && (
                <Text style={styles.latestEventAddress} numberOfLines={2}>
                  📍 {latestEvent.location.detailed_address}
                </Text>
              )}
            <View style={styles.geofenceRow}>
              <Text
                style={[
                  styles.geofencePill,
                  {
                    backgroundColor: latestEvent.geofence_status?.inside_fence
                      ? colors.emeraldSoft
                      : colors.amberSoft,
                    color: latestEvent.geofence_status?.inside_fence ? colors.emerald : colors.amber,
                  },
                ]}>
                {latestEvent.geofence_status?.inside_fence ? '🏠 Inside Geofence' : '📍 Outside Geofence'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>No security events recorded yet.</Text>
        )}
      </View>

      {/* Current Location */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>CURRENT LOCATION</Text>
          <TouchableOpacity
            onPress={() => {
              const loc = liveLocation ?? latestEvent?.location;
              if (loc && loc.latitude !== 0) openMaps(loc.latitude, loc.longitude);
            }}>
            <Text style={styles.viewAllText}>Open Maps →</Text>
          </TouchableOpacity>
        </View>
        {(() => {
          const loc = liveLocation ??
            (latestEvent?.location && latestEvent.location.latitude !== 0
              ? latestEvent.location
              : null);
          if (!loc) {
            return (
              <>
                <View style={styles.mapPlaceholder}>
                  <Text style={styles.mapLabel}>Waiting for GPS…</Text>
                </View>
                <Text style={styles.emptyText}>No location data available yet.</Text>
              </>
            );
          }
          const address =
            loc.detailed_address &&
            loc.detailed_address !== 'Address Unavailable (Offline)'
              ? loc.detailed_address
              : null;
          // Live map preview with provider fallbacks (OSM static endpoints are flaky)
          return (
            <>
              <LiveMapPreview
                latitude={loc.latitude}
                longitude={loc.longitude}
                hasNetwork={
                  network?.isWifi === true ||
                  network?.isMobile === true ||
                  network?.connectionType === 'Mobile' ||
                  network?.connectionType === 'WiFi'
                }
                styles={styles}
                onOpenMaps={() => openMaps(loc.latitude, loc.longitude)}
              />
              {address ? (
                <Text style={styles.locationAddress} numberOfLines={3}>
                  📍 {address}
                </Text>
              ) : null}
              <View style={styles.locationInfoRow}>
                <Text style={styles.locationCoord}>
                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                </Text>
                <Text style={styles.locationAccuracy}>
                  Accuracy ±{Math.round(loc.accuracy_meters || 0)}m
                </Text>
              </View>
            </>
          );
        })()}
      </View>

      {/* Today's Timeline */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>TODAY'S TIMELINE</Text>
          <TouchableOpacity onPress={() => goToSecurity('Timeline')}>
            <Text style={styles.viewAllText}>View Full Timeline →</Text>
          </TouchableOpacity>
        </View>
        {todayEvents.length > 0 ? (
          todayEvents.map((e, idx) => (
            <View key={e.id} style={[styles.todayRow, idx < todayEvents.length - 1 && styles.todayRowBorder]}>
              <Text style={styles.todayTime}>{formatTime(e.timestamp)}</Text>
              <View style={styles.todayIconWrap}>
                <Text style={styles.todayIcon}>{EVENT_ICONS[e.event_type] || '📋'}</Text>
              </View>
              <Text style={styles.todayLabel} numberOfLines={2}>
                {formatEventType(e.event_type)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No events today.</Text>
        )}
      </View>

      {/* Security Overview checklist */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>SECURITY OVERVIEW</Text>
        <View style={styles.overviewGrid}>
          {overview.map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.overviewItem}
              activeOpacity={0.7}
              onPress={() => {
                if (item.label === 'Security Health' || item.label === 'App Safety') {
                  navigation?.navigate?.('App Usage', {initialTab: 'SAFETY'});
                } else if (item.label === 'App Usage') {
                  navigation?.navigate?.('App Usage');
                } else {
                  goToSecurity('Monitoring');
                }
              }}>
              <View style={styles.overviewLeft}>
                <Text style={styles.overviewIcon}>{item.icon}</Text>
                <Text style={styles.overviewLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.overviewStatus,
                  {
                    color: (() => {
                      const tone = (item as {statusTone?: string}).statusTone;
                      if (tone === 'bad') return colors.red;
                      if (tone === 'ok') return colors.emerald;
                      if (tone === 'muted') return colors.textMuted;
                      if (item.ok) return colors.emerald;
                      if (item.status && item.status !== '—' && item.status !== '○') {
                        return colors.amber;
                      }
                      return colors.textMuted;
                    })(),
                  },
                ]}
                numberOfLines={1}>
                {item.status ?? (item.ok ? '✓' : '○')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.manageBtn} onPress={() => goToSecurity('Monitoring')}>
          <Text style={styles.manageBtnText}>Manage Security Features</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  styles,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  styles: ReturnType<typeof createHomeStyles>;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <View style={[styles.statIcon, {backgroundColor: accent + '22'}]}>
        <Text style={{fontSize: 16}}>{icon}</Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={styles.statSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.statCard}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value}`}>
        {inner}
      </TouchableOpacity>
    );
  }

  return <View style={styles.statCard}>{inner}</View>;
}

function buildMapUris(lat: number, lng: number): string[] {
  return [
    // Yandex static maps (usually reachable without API key)
    `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${lng},${lat}&z=15&l=map&size=600,320&pt=${lng},${lat},pm2rdm`,
    // OSM.de fallback
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=600x320&maptype=mapnik&markers=${lat},${lng},red-pushpin`,
  ];
}

const MAP_TILE_CACHE_MS = 10 * 60 * 1000;
const mapTileCache = new Map<string, {uri: string; at: number}>();

function roundCoord(n: number): string {
  return n.toFixed(3);
}

function LiveMapPreview({
  latitude,
  longitude,
  hasNetwork = true,
  styles,
  onOpenMaps,
}: {
  latitude: number;
  longitude: number;
  /** Wi‑Fi or mobile data — fetch static map tile (cached ~10 min). */
  hasNetwork?: boolean;
  styles: ReturnType<typeof createHomeStyles>;
  onOpenMaps: () => void;
}) {
  const uris = useMemo(() => buildMapUris(latitude, longitude), [latitude, longitude]);
  const cacheKey = `${roundCoord(latitude)},${roundCoord(longitude)}`;
  const [uriIndex, setUriIndex] = useState(0);
  const [failed, setFailed] = useState(!hasNetwork);

  useEffect(() => {
    setUriIndex(0);
    setFailed(!hasNetwork);
  }, [hasNetwork, latitude, longitude]);

  const onError = () => {
    if (uriIndex + 1 < uris.length) {
      setUriIndex(i => i + 1);
      return;
    }
    setFailed(true);
  };

  const showImage = hasNetwork && !failed;
  const activeUri = uris[uriIndex];
  useEffect(() => {
    if (showImage && activeUri) {
      mapTileCache.set(cacheKey, {uri: activeUri, at: Date.now()});
    }
  }, [showImage, activeUri, cacheKey]);

  const cached = mapTileCache.get(cacheKey);
  const useCached =
    !showImage &&
    cached &&
    Date.now() - cached.at < MAP_TILE_CACHE_MS &&
    hasNetwork;

  const displayImage = showImage || useCached;
  const imageUri = showImage ? activeUri : cached?.uri;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onOpenMaps}
      style={styles.mapPlaceholder}>
      {displayImage && imageUri ? (
        <Image
          key={imageUri}
          source={{uri: imageUri}}
          style={styles.mapImage}
          resizeMode="cover"
          onError={onError}
        />
      ) : (
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackPin}>📍</Text>
          <Text style={styles.mapFallbackTitle}>
            {hasNetwork ? 'Map preview unavailable' : 'Offline — open Google Maps'}
          </Text>
          <Text style={styles.mapFallbackCoords}>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Text>
        </View>
      )}
      {displayImage ? (
        <View style={styles.livePinWrap} pointerEvents="none">
          <Text style={styles.livePin}>📍</Text>
          <View style={styles.livePinDot} />
        </View>
      ) : null}
      <View style={styles.mapOverlay}>
        <Text style={styles.mapLabel}>
          {displayImage ? 'Live location · Tap for Google Maps' : 'Tap to open Google Maps'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function createHomeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  scrollContent: {padding: spacing.lg, paddingBottom: 40},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.sky,
  },
  headerMenuIcon: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.sky,
    lineHeight: 24,
  },
  headerIcon: {
    fontSize: 20,
    color: colors.textPrimary,
  },
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  brandTitle: {fontSize: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: 1},
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 18, fontWeight: '800', color: '#fff'},
  greetingRow: {marginBottom: spacing.lg},
  greeting: {fontSize: 22, fontWeight: '800', color: colors.textPrimary},
  protectionStatus: {fontSize: 14, fontWeight: '700', marginTop: 4},
  syncedText: {fontSize: 12, color: colors.textMuted, marginTop: 4},
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {fontSize: 18, fontWeight: '800', color: colors.textPrimary},
  statSub: {fontSize: 11, color: colors.sky, fontWeight: '600'},
  statLabel: {fontSize: 11, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  viewAllText: {fontSize: 13, color: colors.sky, fontWeight: '600'},
  latestEventBody: {},
  latestEventTop: {flexDirection: 'row', alignItems: 'center'},
  latestEventIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.skySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  latestEventTitle: {fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1},
  latestEventTime: {fontSize: 12, color: colors.textSecondary, marginTop: 2},
  latestEventSelfie: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.sky,
    marginLeft: spacing.sm,
  },
  latestEventAddress: {
    fontSize: 12,
    color: colors.emerald,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  geofenceRow: {flexDirection: 'row', marginTop: spacing.sm},
  geofencePill: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, fontSize: 11, fontWeight: '700'},
  emptyText: {fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md},
  mapPlaceholder: {
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  mapImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 16,
  },
  mapFallbackPin: {fontSize: 34, marginBottom: 6},
  mapFallbackTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  mapFallbackCoords: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
  },
  livePinWrap: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  livePin: {
    fontSize: 36,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  livePinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#fff',
    marginTop: -8,
  },
  mapGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 0,
  },
  mapPinWrap: {alignItems: 'center', justifyContent: 'center'},
  mapPin: {fontSize: 18},
  mapPinPulse: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    zIndex: -1,
  },
  mapLabel: {fontSize: 12, color: colors.textBody, fontWeight: '600'},
  locationInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  locationAddress: {
    fontSize: 13,
    color: colors.emerald,
    marginTop: spacing.md,
    lineHeight: 19,
  },
  locationCoord: {fontSize: 12, color: colors.textBody, fontFamily: 'monospace'},
  locationAccuracy: {fontSize: 12, color: colors.emerald, fontWeight: '600'},
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
  },
  todayRowBorder: {borderBottomWidth: 1, borderBottomColor: colors.borderSubtle},
  todayTime: {
    fontSize: 12,
    color: colors.sky,
    fontWeight: '700',
    width: 78,
    fontVariant: ['tabular-nums'],
    textAlign: 'left',
  },
  todayIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  todayIcon: {fontSize: 16},
  todayLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '600',
    lineHeight: 20,
  },
  overviewGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
  overviewItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  overviewLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
    minWidth: 0,
  },
  overviewIcon: {fontSize: 14, marginRight: 6},
  overviewLabel: {
    fontSize: 12,
    color: colors.textBody,
    fontWeight: '600',
    flexShrink: 1,
  },
  overviewStatus: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 0,
  },
  manageBtn: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  manageBtnText: {color: colors.sky, fontSize: 14, fontWeight: '700'},
});
}