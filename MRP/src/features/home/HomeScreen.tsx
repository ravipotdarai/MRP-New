import React, {useState, useCallback, useMemo, useEffect, useRef} from 'react';
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
  Pressable,
  PermissionsAndroid,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {pageBounceEnter} from '../../shared/animations/pageBounce';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {showSmsPermissionHelp} from '../../shared/utils/permissionFixGuides';
import {useSettings} from '../../shared/hooks/useSettings';
import {findMatchingSelfie} from '../../shared/utils/selfieMatcher';
import {AppMenuDrawer, AppMenuTarget} from '../../shared/components/AppMenuDrawer';
import {ThemePickerModal} from '../../shared/components/ThemePickerModal';
import {useSubscriptionTier} from '../../shared/hooks/useSubscriptionTier';
import {ActivityStatusBanner} from './ActivityStatusBanner';
import {loadLocalCircles} from '../circle/circleLocalStore';
import {CIRCLE_ENABLED} from '../../config/featureFlags';
import {formatDigitalSafetyEventType} from '../digital-safety/formatDigitalSafetyEvent';
import {getTrackingConfig} from '../../native/DeviceTracking.types';
import {setSecurityCenterTab} from '../security-center/securityCenterNav';
import {brandImages, brandCopy} from '../../assets/brand';
import {useOpsCatalog} from '../ops/useOpsCatalog';

const USER_NAME = 'Ravi';
const PANIC_MAX_BURST = 3;
const PANIC_WINDOW_MS = 15 * 60 * 1000;
const PANIC_BANNER_MS = 60 * 1000;

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
  DATA_RISK_APP: '⚠️',
  POSTURE_ALERT: '🛡️',
  PANIC_ALERT: '🆘',
  SAFE_LINK_SCANNED: '🔗',
  SAFE_LINK_ALLOWED: '✅',
  SAFE_LINK_WARNED: '⚠️',
  SAFE_LINK_BLOCKED: '🚫',
  NETWORK_GUARDIAN_ENABLED: '🛡️',
  NETWORK_GUARDIAN_DISABLED: '🛡️',
  AD_BLOCKED: '🚫',
  TRACKER_BLOCKED: '👁️',
  MALICIOUS_DOMAIN_BLOCKED: '☣️',
  SCAM_DETECTED: '⚠️',
  QR_SCANNED: '📷',
  QR_BLOCKED: '🚫',
  CELLULAR_ANOMALY_DETECTED: '📶',
  BREACH_EMAIL_FOUND: '📧',
  BREACH_EMAIL_CLEAN: '📧',
  EMERGENCY_CARD_UPDATED: '🆘',
  VAULT_ITEM_CREATED: '🔐',
  VAULT_ITEM_VIEWED: '🔐',
  VAULT_ITEM_UPDATED: '🔐',
  VAULT_ITEM_DELETED: '🔐',
  VAULT_BACKUP_CREATED: '☁️',
  VAULT_BACKUP_RESTORED: '☁️',
  VAULT_BACKUP_FAILED: '☁️',
  VAULT_AUTH_FAILED: '🔐',
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
  provider?: string;
  accuracyMeters?: number;
}

interface NetworkInfo {
  carrierName: string;
  connectionType: string;
  isWifi: boolean;
  isMobile: boolean;
  wifiSsid?: string;
  simCarrier?: string;
}

const WEB_CONSOLE_URL = 'https://mobileresilienceplatform.web.app';

const formatEventType = (type: string | undefined): string => {
  if (!type) return 'Unknown Event';
  return formatDigitalSafetyEventType(type);
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
  const {ops} = useOpsCatalog();
  const inboxUnread = ops.unread > 0;
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [liveLocation, setLiveLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    detailed_address: string;
    provider?: string;
    location_tier?: string;
    cache_hit?: boolean;
    fix_ms?: number;
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
  const [locRefreshing, setLocRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [bounceKey, setBounceKey] = useState(0);
  const homeFocusOnce = useRef(false);
  const {colors} = useTheme();
  const styles = useMemo(() => createHomeStyles(colors), [colors]);
  const {isPaid} = useSubscriptionTier();
  const panicTimestamps = useRef<number[]>([]);
  const [panicBusy, setPanicBusy] = useState(false);
  const [panicHoldProgress, setPanicHoldProgress] = useState(0);
  const [panicBannerUntil, setPanicBannerUntil] = useState(0);
  const [circleSharingName, setCircleSharingName] = useState<string | null>(null);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const panicHoldTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recoveryContactOk, setRecoveryContactOk] = useState(false);
  const [postureGrade, setPostureGrade] = useState<string>('Unknown');
  const [postureIssueCount, setPostureIssueCount] = useState(0);
  const [highRiskCount, setHighRiskCount] = useState(0);
  const [wifiGrade, setWifiGrade] = useState<string>('—');

  const loadAll = useCallback(async () => {
    const bridge = mrpmModule as any;
    // Critical path only — keep Home first paint light.
    const [tRes, pRes, nRes, gRes, camRes, locRes, ovRes, adRes, usRes, liveRes] =
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
        mrpmModule.getCurrentLocationWithAddress?.(false) ?? Promise.resolve(null),
      ]);

    if (tRes.status === 'fulfilled') setTimeline(Array.isArray(tRes.value) ? tRes.value : []);
    if (pRes.status === 'fulfilled') setPhotos(Array.isArray(pRes.value) ? pRes.value : []);
    if (nRes.status === 'fulfilled') setNetwork(nRes.value as NetworkInfo);
    if (gRes.status === 'fulfilled') setGps(gRes.value as GpsStatus);
    if (liveRes.status === 'fulfilled' && liveRes.value) {
      setLiveLocation(liveRes.value as typeof liveLocation);
    }
    setPermFlags({
      camera: camRes.status === 'fulfilled' ? !!camRes.value : false,
      location: locRes.status === 'fulfilled' ? !!locRes.value : false,
      overlay: ovRes.status === 'fulfilled' ? !!ovRes.value : false,
      admin: adRes.status === 'fulfilled' ? !!adRes.value : false,
      usageStats: usRes.status === 'fulfilled' ? !!usRes.value : false,
    });

    // Deferred: SIM / posture / risk / setup — after first paint.
    void (async () => {
      try {
        const [simRes, postureRes] = await Promise.allSettled([
          bridge.getSimRecoveryStatus?.() ?? Promise.resolve(null),
          bridge.getBreachPostureSummary?.() ?? Promise.resolve(null),
        ]);
        if (simRes.status === 'fulfilled' && simRes.value) {
          const st = simRes.value as {enabled?: boolean; hasContacts?: boolean};
          setRecoveryContactOk(!!(st.enabled && st.hasContacts));
        }
        if (postureRes.status === 'fulfilled' && postureRes.value) {
          const summary = postureRes.value as {grade?: string; lastJson?: string};
          const g = summary.grade;
          setPostureGrade(g && g.length ? g : 'Unknown');
          let issues = 0;
          let wifiLabel = '—';
          if (summary.lastJson) {
            try {
              const parsed = JSON.parse(summary.lastJson);
              const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
              issues = checks.filter((c: {ok?: boolean}) => c && c.ok === false).length;
              const wifi = checks.find((c: {id?: string}) => c?.id === 'wifi_crypto') as
                | {detail?: string; ok?: boolean}
                | undefined;
              if (wifi?.detail) {
                if (wifi.detail.includes('·')) {
                  wifiLabel = wifi.detail.split('·').pop()?.trim() || wifi.detail;
                } else if (/not connected/i.test(wifi.detail)) {
                  wifiLabel = 'Off';
                } else {
                  wifiLabel = wifi.ok === false ? 'Weak' : 'OK';
                }
              }
            } catch {
              issues = 0;
            }
          }
          setWifiGrade(wifiLabel);
          if (issues === 0 && (g === 'Critical' || g === 'Attention')) {
            issues = 1;
          }
          setPostureIssueCount(issues);
        }
      } catch {
        /* ignore deferred errors */
      }
      void (bridge.getAppRiskReport?.() ?? Promise.resolve([]))
        .then((riskRes: unknown) => {
          const apps = Array.isArray(riskRes) ? riskRes : [];
          setHighRiskCount(
            apps.filter(
              (a: {riskLevel?: string}) =>
                a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL',
            ).length,
          );
        })
        .catch(() => {});
      try {
        const setup = await bridge.getPermissionSetupStatus?.();
        if (setup && typeof setup === 'object') {
          setPermFlags(prev => ({
            camera: setup.camera ?? prev.camera,
            location: setup.location ?? prev.location,
            overlay: setup.overlay ?? prev.overlay,
            admin: setup.deviceAdmin ?? prev.admin,
            usageStats: setup.usageStats ?? prev.usageStats,
          }));
        }
      } catch {
        /* keep flags */
      }
      try {
        const cfg = await getTrackingConfig();
        setEmergencyActive(!!cfg.emergencyTracking);
      } catch {
        setEmergencyActive(false);
      }
    })();
  }, []);

  // Refresh only when Home is opened / focused — no continuous polling
  useFocusEffect(
    useCallback(() => {
      if (homeFocusOnce.current) {
        setBounceKey(k => k + 1);
      } else {
        homeFocusOnce.current = true;
      }
      loadAll();
      void (CIRCLE_ENABLED
        ? loadLocalCircles().then(circles => {
            const sharing = circles.find(c => c.shareEnabled);
            setCircleSharingName(sharing ? sharing.name : null);
          })
        : Promise.resolve().then(() => setCircleSharingName(null)));
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') {
          loadAll();
          if (CIRCLE_ENABLED) {
            void loadLocalCircles().then(circles => {
              const sharing = circles.find(c => c.shareEnabled);
              setCircleSharingName(sharing ? sharing.name : null);
            });
          }
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
  // "Protected" = core permissions OK (matches Grant All Access core). Monitoring tip is separate.
  const permissionGaps: string[] = [];
  if (!permFlags.camera) permissionGaps.push('Camera');
  if (!permFlags.location) permissionGaps.push('Location');
  if (!permFlags.overlay) permissionGaps.push('Display over other apps');
  if (!permFlags.admin) permissionGaps.push('Device Admin');
  const isProtected = permissionGaps.length === 0;
  const protectionGaps: string[] = [...permissionGaps];
  if (!settings.isMonitoringEnabled) protectionGaps.push('Monitoring off');

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
      icon: '☁️',
      label: 'Drive Sync',
      ok: true,
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
    if (target.screen === 'Hub') {
      if (target.securityCenterTab) {
        setSecurityCenterTab(target.securityCenterTab);
      }
      navigation.navigate(
        'Hub',
        target.section ? {openSection: target.section} : undefined,
      );
      return;
    }
    if (target.screen === 'Digital Safety') {
      navigation.navigate(
        'Digital Safety',
        target.openSection ? {openSection: target.openSection} : undefined,
      );
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

  const goDigitalSafety = (tab?: 'ADVISOR' | 'ANALYZER' | 'FRAUD' | 'TOOLS') => {
    if (tab) setSecurityCenterTab(tab);
    navigation?.navigate?.('Digital Safety', tab ? {openSection: 'security-center'} : undefined);
  };

  const handleAvatarPress = () => {
    if (!onLogout) return;
    Alert.alert('MRP Account', 'Sign out of MRP?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign Out', style: 'destructive', onPress: onLogout},
    ]);
  };

  const canSendPanic = (): boolean => {
    const now = Date.now();
    panicTimestamps.current = panicTimestamps.current.filter(t => now - t < PANIC_WINDOW_MS);
    return panicTimestamps.current.length < PANIC_MAX_BURST;
  };

  const triggerPanic = useCallback(async () => {
    if (panicBusy) return;
    if (!canSendPanic()) {
      Alert.alert(
        'Please wait',
        `You can send up to ${PANIC_MAX_BURST} panic alerts every 15 minutes.`,
      );
      return;
    }
    const bridge = mrpmModule as any;
    if (typeof bridge.sendPanicAlert !== 'function') {
      Alert.alert('Unavailable', 'Panic alert is not available on this build.');
      return;
    }
    setPanicBusy(true);
    try {
      // Instant lock first when Accessibility is connected (no Device Admin force-lock).
      try {
        await bridge.lockScreenNow?.();
      } catch {
        /* lock is best-effort during panic */
      }
      const smsOk = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
      );
      if (smsOk !== PermissionsAndroid.RESULTS.GRANTED) {
        showSmsPermissionHelp(() => bridge.openAppSettings?.());
        return;
      }
      const result = await bridge.sendPanicAlert();
      const ok = !!result?.success;
      const detail =
        result?.message ||
        (ok ? 'Recovery contacts notified.' : 'Could not send panic SMS.');
      panicTimestamps.current.push(Date.now());
      Alert.alert(ok ? 'Panic alert sent' : 'Panic failed', detail);
      if (ok) {
        setPanicBannerUntil(Date.now() + PANIC_BANNER_MS);
        loadAll();
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Panic alert failed');
    } finally {
      setPanicBusy(false);
      setPanicHoldProgress(0);
    }
  }, [panicBusy, loadAll]);

  const startPanicHold = () => {
    if (panicBusy) return;
    setPanicHoldProgress(0);
    let step = 0;
    panicHoldTimer.current = setInterval(() => {
      step += 1;
      setPanicHoldProgress(step / 20);
      if (step >= 20) {
        if (panicHoldTimer.current) clearInterval(panicHoldTimer.current);
        panicHoldTimer.current = null;
        triggerPanic();
      }
    }, 100);
  };

  const cancelPanicHold = () => {
    if (panicHoldTimer.current) {
      clearInterval(panicHoldTimer.current);
      panicHoldTimer.current = null;
    }
    setPanicHoldProgress(0);
  };

  useEffect(() => {
    return () => {
      if (panicHoldTimer.current) clearInterval(panicHoldTimer.current);
    };
  }, []);

  const goSubscribe = () => {
    navigation?.navigate?.('Hub', {openSection: 'subscriptions'});
  };

  const goMrpGuide = () => {
    navigation?.navigate?.('Hub', {openSection: 'about'});
  };

  const goPromotions = () => {
    navigation?.navigate?.('Hub', {openSection: 'promotions'});
  };

  const openWebConsole = () => {
    Linking.openURL(WEB_CONSOLE_URL).catch(() =>
      Alert.alert('Web console', 'Could not open the web console.'),
    );
  };

  const refreshLiveLocation = useCallback(async () => {
    if (!mrpmModule?.getCurrentLocationWithAddress) return;
    setLocRefreshing(true);
    try {
      // Force GPS path — skip stale process cache / last-known ghosts
      const loc = await mrpmModule.getCurrentLocationWithAddress(true);
      if (loc) {
        setLiveLocation(loc as typeof liveLocation);
      }
    } catch {
      /* keep previous */
    } finally {
      setLocRefreshing(false);
    }
  }, []);

  const wifiName = network?.isWifi
    ? network.wifiSsid || 'Connected'
    : network?.isMobile
      ? network.connectionType || 'Mobile'
      : network
        ? 'Offline'
        : '--';

  const carrierName =
    (network?.simCarrier || network?.carrierName || '').trim() &&
    (network?.simCarrier || network?.carrierName) !== 'Unknown'
      ? network?.simCarrier || network?.carrierName
      : network?.isMobile
        ? network.connectionType || 'Mobile'
        : '--';

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
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setThemePickerOpen(true)}
            accessibilityLabel="Color theme">
            <Text style={styles.headerIcon}>🎨</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation?.navigate?.('Hub', {openSection: 'inbox'})}
            accessibilityLabel="Notifications">
            <Text style={styles.headerIcon}>🔔</Text>
            {inboxUnread ? <View style={styles.badgeDot} /> : null}
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

      <Animated.View key={bounceKey} entering={pageBounceEnter}>
      {/* Brand hero + greeting */}
      <View style={styles.brandHero}>
        <TouchableOpacity
          onPress={() =>
            inboxUnread
              ? navigation?.navigate?.('Hub', {openSection: 'inbox'})
              : undefined
          }
          activeOpacity={inboxUnread ? 0.7 : 1}>
          <View>
            <Image source={brandImages.logoMark} style={styles.brandLogo} resizeMode="contain" />
            {inboxUnread ? <View style={styles.logoBadge} /> : null}
          </View>
        </TouchableOpacity>
        <Text style={styles.brandName}>{brandCopy.name}</Text>
        <Text style={styles.brandTagline}>{brandCopy.tagline}</Text>
      </View>

      <View style={styles.greetingRow}>
        <View style={{flex: 1}}>
          <Text style={styles.greeting}>
            {getGreeting()}, {USER_NAME}
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
              Missing: {permissionGaps.join(', ')}
            </Text>
          ) : !settings.isMonitoringEnabled ? (
            <Text style={styles.syncedText}>Tip: turn Monitoring on in Security</Text>
          ) : null}
          <Text style={styles.syncedText}>Last synced {lastSynced}</Text>
        </View>
      </View>

      <ActivityStatusBanner
        panicActive={panicBannerUntil > Date.now()}
        emergencyActive={emergencyActive}
        circleSharing={CIRCLE_ENABLED && !!circleSharingName}
        circleName={CIRCLE_ENABLED ? circleSharingName || undefined : undefined}
      />

      {/* Quick actions: Subscribe + Panic */}
      <View style={styles.quickActionRow}>
        {!isPaid ? (
          <TouchableOpacity style={styles.subscribeBtn} onPress={goSubscribe} activeOpacity={0.85}>
            <Text style={styles.subscribeBtnText}>⭐ Subscribe</Text>
          </TouchableOpacity>
        ) : null}
        <Pressable
          style={({pressed}) => [
            styles.panicBtn,
            !isPaid ? styles.panicBtnHalf : styles.panicBtnFull,
            pressed && styles.panicBtnPressed,
          ]}
          onPressIn={startPanicHold}
          onPressOut={cancelPanicHold}
          disabled={panicBusy}>
          <Text style={styles.panicBtnText}>
            {panicBusy ? 'Sending…' : panicHoldProgress > 0 ? 'Hold…' : '🆘 Panic'}
          </Text>
          {panicHoldProgress > 0 ? (
            <View style={styles.panicProgressTrack}>
              <View style={[styles.panicProgressFill, {width: `${panicHoldProgress * 100}%`}]} />
            </View>
          ) : (
            <Text style={styles.panicHint}>Hold 2s — SMS recovery contacts</Text>
          )}
        </Pressable>
      </View>

      {/* Quick tiles: status + short purpose */}
      <View style={styles.statGrid}>
        <StatCard
          icon="📶"
          label="Wifi"
          value={wifiName}
          purpose="Network name — Wi‑Fi tools"
          accent={network && network.connectionType !== 'Offline' ? colors.sky : colors.red}
          styles={styles}
          onPress={() => goDigitalSafety('TOOLS')}
        />
        <StatCard
          icon="🔐"
          label="Wi‑Fi grade"
          value={wifiGrade}
          purpose="Open / WEP / WPA of this network"
          accent={
            /open|wep|weak/i.test(wifiGrade)
              ? colors.red
              : wifiGrade === '—' || wifiGrade === 'Off'
                ? colors.amber
                : colors.emerald
          }
          styles={styles}
          onPress={() => goDigitalSafety('TOOLS')}
        />
        <StatCard
          icon="🔒"
          label="Security"
          value={`${securityScore}%`}
          purpose="Posture score — open Advisor"
          accent={securityScore >= 80 ? colors.emerald : securityScore >= 50 ? colors.amber : colors.red}
          styles={styles}
          onPress={() => goDigitalSafety('ADVISOR')}
        />
        <StatCard
          icon="📡"
          label="GPS"
          value={carrierName || '--'}
          purpose="Location & carrier for events"
          accent={gps?.isLocationAvailable || liveLocation ? colors.emerald : colors.red}
          styles={styles}
        />
        <StatCard
          icon="🧭"
          label="Advisor"
          value="Scan"
          purpose="USB debug, battery, and more"
          accent={colors.sky}
          styles={styles}
          onPress={() => goDigitalSafety('ADVISOR')}
        />
        <StatCard
          icon="📊"
          label="Threats"
          value="Analyze"
          purpose="Risky / sideloaded apps"
          accent={colors.amber}
          styles={styles}
          onPress={() => goDigitalSafety('ANALYZER')}
        />
        <StatCard
          icon="🆘"
          label="Fraud"
          value="Report"
          purpose="Cybercrime & lost-phone links"
          accent={colors.red}
          styles={styles}
          onPress={() => goDigitalSafety('FRAUD')}
        />
        <StatCard
          icon="🔗"
          label="Scan URL"
          value="Paste"
          purpose="Check a link before opening"
          accent={colors.violet}
          styles={styles}
          onPress={() => goDigitalSafety('TOOLS')}
        />
        <StatCard
          icon="📷"
          label="Scan QR"
          value="Paste"
          purpose="Check QR / WIFI: payload"
          accent={colors.sky}
          styles={styles}
          onPress={() => goDigitalSafety('TOOLS')}
        />
        <StatCard
          icon="📧"
          label="Breach"
          value="Email"
          purpose="Check if an email is in leaks"
          accent={colors.violet}
          styles={styles}
          onPress={() => goDigitalSafety('TOOLS')}
        />
        <StatCard
          icon="💬"
          label="OTP check"
          value="Paste"
          purpose="Paste SMS to spot OTP scams"
          accent={colors.amber}
          styles={styles}
          onPress={() => goDigitalSafety('TOOLS')}
        />
        <StatCard
          icon="🎁"
          label="Hub"
          value="Offers"
          purpose="Promotions & affiliates"
          accent={colors.amber}
          styles={styles}
          onPress={goPromotions}
        />
        <StatCard
          icon="ℹ️"
          label="How to Use"
          value="Guide"
          purpose="Setup & how MRP protects you"
          accent={colors.sky}
          styles={styles}
          onPress={goMrpGuide}
        />
        <StatCard
          icon="🌐"
          label="Portal"
          value="MRP Web"
          purpose="Open PathSync in the browser"
          accent={colors.violet}
          styles={styles}
          onPress={openWebConsole}
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
                {latestEvent.geofence_status?.inside_fence
                  ? `🏠 Inside ${latestEvent.metadata?.geofence_name || 'zone'}`
                  : latestEvent.metadata?.geofence_distance_m != null &&
                      Number.isFinite(Number(latestEvent.metadata.geofence_distance_m))
                    ? `📍 Away · ${Math.round(Number(latestEvent.metadata.geofence_distance_m))}m`
                    : '📍 Away'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>No security events recorded yet.</Text>
        )}
      </View>

      {/* Current Location — address + coords + refresh (no map tile) */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>CURRENT LOCATION</Text>
          <View style={styles.locHeaderActions}>
            {liveLocation ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>
                  {locRefreshing
                    ? '…'
                    : liveLocation.cache_hit ||
                        (liveLocation.location_tier || '').toLowerCase().includes('cache') ||
                        (liveLocation.location_tier || '').toLowerCase().includes('last')
                      ? 'Cached'
                      : 'Live'}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.refreshLocBtn}
              onPress={refreshLiveLocation}
              disabled={locRefreshing}
              accessibilityLabel="Refresh location">
              <Text style={styles.refreshLocBtnText}>
                {locRefreshing ? '…' : '↻'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {(() => {
          // Never fall back to a Timeline event location — those stamp historical
          // places (e.g. Magarpatta) and look like a wrong "current" fix.
          const loc = liveLocation;
          if (!loc) {
            return (
              <View style={styles.locTextBlock}>
                <Text style={styles.emptyText}>
                  {locRefreshing
                    ? 'Getting GPS fix…'
                    : 'No fresh location yet. Tap ↻ to refresh.'}
                </Text>
              </View>
            );
          }
          const address =
            loc.detailed_address &&
            loc.detailed_address !== 'Address Unavailable (Offline)'
              ? loc.detailed_address
              : null;
          const tier = (loc.location_tier || loc.provider || '').toLowerCase();
          const isLiveGps = tier.includes('gps') || tier === 'fused';
          const tierLabel = locRefreshing
            ? 'Updating…'
            : isLiveGps && !loc.cache_hit
              ? 'GPS'
              : tier.includes('cache') || loc.cache_hit
                ? 'Cached'
                : tier.includes('wifi')
                  ? 'Wi‑Fi'
                  : tier.includes('cell')
                    ? 'Cell'
                    : tier.includes('last')
                      ? 'Last known'
                      : 'Fix';
          return (
            <View style={styles.locTextBlock}>
              <View style={styles.locAddressRow}>
                <Text style={styles.locPinIcon}>📍</Text>
                <Text style={styles.locationAddress} numberOfLines={4}>
                  {address || 'Coordinates only'}
                </Text>
              </View>
              <View style={styles.locationInfoRow}>
                <Text style={styles.locationCoord}>
                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                </Text>
                <Text style={styles.locationAccuracy}>
                  ±{Math.round(loc.accuracy_meters || 0)}m · {tierLabel}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.mapsLinkBtn}
                onPress={() => openMaps(loc.latitude, loc.longitude)}
                activeOpacity={0.8}>
                <Text style={styles.mapsLinkBtnText}>Open in Google Maps →</Text>
              </TouchableOpacity>
            </View>
          );
        })()}
      </View>

      {/* Today's Timeline */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>TODAY'S ACTIVITY</Text>
          <TouchableOpacity onPress={() => goToSecurity('Timeline')}>
            <Text style={styles.viewAllText}>View Full Activity →</Text>
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
                {e.event_type === 'APP_MISUSE'
                  ? `App Misuse · ${
                      e.metadata?.app_name ||
                      e.metadata?.application_name ||
                      e.metadata?.package_name ||
                      'Unknown app'
                    }`
                  : formatEventType(e.event_type)}
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
                } else if (item.label === 'Geofence') {
                  navigation?.navigate?.('Hub', {openSection: 'geofence'});
                } else if (item.label === 'Drive Sync') {
                  navigation?.navigate?.('Hub', {openSection: 'drive-sync'});
                } else if (item.label === 'SIM Monitoring' || item.label === 'Recovery Contact') {
                  navigation?.navigate?.('Hub', {openSection: 'sim-recovery'});
                } else {
                  goToSecurity('MONITORING');
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
        <TouchableOpacity style={styles.manageBtn} onPress={() => goToSecurity('MONITORING')}>
          <Text style={styles.manageBtnText}>Open Security Setup</Text>
        </TouchableOpacity>
      </View>
      </Animated.View>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  purpose,
  accent,
  styles,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  purpose?: string;
  accent: string;
  styles: ReturnType<typeof createHomeStyles>;
  onPress?: () => void;
}) {
  const a11y = purpose ? `${label}. ${value}. ${purpose}` : `${label}. ${value}`;
  const inner = (
    <>
      <View style={styles.statTopRow}>
        <View style={styles.statLabelLeft}>
          <View style={[styles.statIcon, {backgroundColor: accent + '22'}]}>
            <Text style={{fontSize: 12}}>{icon}</Text>
          </View>
          <Text style={styles.statTitle} numberOfLines={1}>
            {label}
          </Text>
        </View>
        {onPress ? <Text style={[styles.statChevron, {color: accent}]}>›</Text> : null}
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      {purpose ? (
        <Text style={styles.statPurpose} numberOfLines={2}>
          {purpose}
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.statCard, {borderColor: accent + '55'}]}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={a11y}>
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.statCard, {borderColor: accent + '40'}]}
      accessibilityLabel={a11y}>
      {inner}
    </View>
  );
}

function createHomeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  scrollContent: {padding: spacing.md, paddingBottom: 40},
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
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.red,
  },
  logoBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.bg,
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
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 18, fontWeight: '800', color: '#fff'},
  brandHero: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  brandLogo: {width: 128, height: 104, marginBottom: spacing.xs},
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  brandTagline: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.sky,
    marginTop: 4,
    textAlign: 'center',
  },
  greetingRow: {marginBottom: spacing.lg},
  greeting: {fontSize: 22, fontWeight: '800', color: colors.textPrimary},
  protectionStatus: {fontSize: 14, fontWeight: '700', marginTop: 4},
  syncedText: {fontSize: 12, color: colors.textMuted, marginTop: 4},
  quickActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  subscribeBtn: {
    flex: 1,
    backgroundColor: colors.skySoft,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeBtnText: {color: colors.sky, fontSize: 15, fontWeight: '800'},
  panicBtn: {
    backgroundColor: colors.redSoft,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panicBtnHalf: {flex: 1},
  panicBtnFull: {flex: 1},
  panicBtnPressed: {opacity: 0.9},
  panicBtnText: {color: colors.red, fontSize: 16, fontWeight: '800'},
  panicHint: {fontSize: 10, color: colors.textMuted, marginTop: 4, fontWeight: '600'},
  panicProgressTrack: {
    height: 4,
    width: '100%',
    backgroundColor: colors.borderSubtle,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  panicProgressFill: {height: '100%', backgroundColor: colors.red},
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  statLabelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  statInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  statInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statTextCol: {flex: 1, minWidth: 0},
  statIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statChevron: {fontSize: 16, fontWeight: '700', lineHeight: 18},
  statTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  statValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'left',
  },
  statPurpose: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  statSub: {fontSize: 11, fontWeight: '700', marginTop: 4},
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  locHeaderActions: {flexDirection: 'row', alignItems: 'center', gap: 8},
  refreshLocBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.sky,
    backgroundColor: colors.skySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshLocBtnText: {fontSize: 16, color: colors.sky, fontWeight: '800'},
  locTextBlock: {gap: 8},
  locAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  locPinIcon: {fontSize: 18, lineHeight: 22, marginTop: 1},
  mapsLinkBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.skySoft,
    borderWidth: 1,
    borderColor: colors.sky + '44',
  },
  mapsLinkBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.sky,
  },
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.emerald,
    marginRight: 6,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.emerald,
  },
  lastKnownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  locationInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  locationAddress: {
    flex: 1,
    fontSize: 14,
    color: colors.emerald,
    lineHeight: 20,
    fontWeight: '600',
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