import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import mrpmModule from '../shared/hooks/useNativeBridge';
import {ColorPalette} from '../shared/theme';
import {useTheme} from '../shared/ThemeContext';

interface PermissionDetail {
  name: string;
  icon: string;
  description: string;
  granted: boolean;
  grantSteps: string[];
  onOpen: () => Promise<void>;
  buttonLabel: string;
  /** When true, show Configure even if already granted (e.g. App battery usage). */
  alwaysConfigurable?: boolean;
}

export function PermissionsScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [overlayPermission, setOverlayPermission] = useState<boolean | null>(null);
  const [deviceAdminPermission, setDeviceAdminPermission] = useState<boolean | null>(null);
  const [usageStatsPermission, setUsageStatsPermission] = useState<boolean | null>(null);
  const [smsPermission, setSmsPermission] = useState<boolean | null>(null);
  const [phonePermission, setPhonePermission] = useState<boolean | null>(null);
  const [accessibilityPermission, setAccessibilityPermission] = useState<boolean | null>(null);
  const [batteryUnrestricted, setBatteryUnrestricted] = useState<boolean | null>(null);
  const [notificationsPermission, setNotificationsPermission] = useState<boolean | null>(null);
  const [bluetoothPermission, setBluetoothPermission] = useState<boolean | null>(null);
  const [backgroundLocationPermission, setBackgroundLocationPermission] =
    useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPermissions();
  }, []);

  const bluetoothConnectPerm = (): string | null => {
    if (Platform.OS !== 'android' || Platform.Version < 31) {
      return null;
    }
    const perms = PermissionsAndroid.PERMISSIONS as Record<string, string | undefined>;
    return perms.BLUETOOTH_CONNECT ?? 'android.permission.BLUETOOTH_CONNECT';
  };

  const checkPermissions = async () => {
    try {
      console.log('[PermissionsScreen] Checking permissions...');
      console.log('[PermissionsScreen] mrpmModule available:', !!mrpmModule);
      if (!mrpmModule) {
        console.error('[PermissionsScreen] MrpNative module not available');
        Alert.alert('Error', 'Native module not available. Please restart the app.');
        setLoading(false);
        return;
      }
      const cam = await mrpmModule.checkCameraPermission();
      const loc = await mrpmModule.checkLocationPermission();
      const overlay = await mrpmModule.checkOverlayPermission();
      const admin = await mrpmModule.isDeviceAdminEnabled();
      const usageStats = await mrpmModule.hasUsageStatsPermission();
      let sms = false;
      try {
        sms = await (mrpmModule as any).checkSmsPermission?.() ?? false;
      } catch {
        sms = false;
      }
      let phone = false;
      try {
        phone = await (mrpmModule as any).checkPhonePermission?.() ?? false;
      } catch {
        phone = false;
      }
      let a11y = false;
      try {
        a11y = await mrpmModule.isAccessibilityEnabled?.() ?? false;
      } catch {
        a11y = false;
      }

      let batteryOk = false;
      let notificationsOk = Platform.Version < 33;
      let bluetoothOk = Platform.Version < 31;
      try {
        const status = await (mrpmModule as any).getPermissionSetupStatus?.();
        batteryOk = !!status?.batteryExempt;
        if (typeof status?.notifications === 'boolean') {
          notificationsOk = status.notifications;
        }
        if (typeof status?.bluetoothConnect === 'boolean') {
          bluetoothOk = status.bluetoothConnect;
        }
      } catch {
        batteryOk = false;
      }

      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          notificationsOk = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
        } catch {
          /* keep status from bridge */
        }
      }

      const bt = bluetoothConnectPerm();
      if (bt) {
        try {
          bluetoothOk = await PermissionsAndroid.check(bt as any);
        } catch {
          /* keep status from bridge */
        }
      }

      let bgLoc = loc;
      if (Platform.OS === 'android' && Platform.Version >= 29) {
        try {
          bgLoc = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          );
        } catch {
          bgLoc = false;
        }
      }

      console.log('[PermissionsScreen] Permission results:', {
        camera: cam,
        location: loc,
        backgroundLocation: bgLoc,
        overlay: overlay,
        admin: admin,
        usageStats: usageStats,
        sms: sms,
        phone: phone,
        battery: batteryOk,
        notifications: notificationsOk,
        bluetooth: bluetoothOk,
      });

      setCameraPermission(cam);
      setLocationPermission(loc);
      setBackgroundLocationPermission(bgLoc);
      setOverlayPermission(overlay);
      setDeviceAdminPermission(admin);
      setUsageStatsPermission(usageStats);
      setSmsPermission(sms);
      setPhonePermission(phone);
      setAccessibilityPermission(a11y);
      setBatteryUnrestricted(batteryOk);
      setNotificationsPermission(notificationsOk);
      setBluetoothPermission(bluetoothOk);
    } catch (e) {
      console.error('[PermissionsScreen] Failed to check permissions:', e);
      Alert.alert('Error', 'Failed to check permissions: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const openAppDetails = async () => {
    try {
      if (!mrpmModule) {
        Alert.alert('Error', 'Native module not available.');
        return;
      }
      await mrpmModule.openAppSettings();
    } catch (e) {
      console.error('[PermissionsScreen] Error opening app settings:', e);
      Alert.alert('Error', 'Could not open settings. Please open them manually.');
    }
  };

  const openOverlaySettings = async () => {
    try {
      if (!mrpmModule) {
        Alert.alert('Error', 'Native module not available.');
        return;
      }
      await mrpmModule.requestOverlayPermission();
    } catch (e) {
      console.error('[PermissionsScreen] Error opening overlay settings:', e);
      // Fallback to app details
      await openAppDetails();
    }
  };

  const openUsageAccessSettings = async () => {
    try {
      if (!mrpmModule) {
        Alert.alert('Error', 'Native module not available.');
        return;
      }
      await mrpmModule.requestUsageStatsPermission();
    } catch (e) {
      console.error('[PermissionsScreen] Error opening usage access settings:', e);
      await openAppDetails();
    }
  };

  const requestSmsPermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'SMS Access Required',
          message:
            'MRP needs SMS permission to alert your recovery contacts when a SIM change is detected — even when mobile data or Wi‑Fi is off.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setSmsPermission(ok);
      if (!ok) {
        Alert.alert(
          'Permission Denied',
          'To enable SMS:\n\n1. Settings → Apps → MRP\n2. Permissions\n3. Enable SMS / Messages',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: openAppDetails},
          ],
        );
      } else {
        await checkPermissions();
      }
    } catch (e) {
      console.error('[PermissionsScreen] SMS permission error:', e);
      await openAppDetails();
    }
  };

  const requestPhonePermission = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const perms: string[] = [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE];
      if (Platform.Version >= 33) {
        perms.push('android.permission.READ_PHONE_NUMBERS');
      }
      const result = await PermissionsAndroid.requestMultiple(perms as any);
      const stateOk =
        result[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const numbersOk =
        Platform.Version < 33 ||
        result['android.permission.READ_PHONE_NUMBERS'] ===
          PermissionsAndroid.RESULTS.GRANTED;
      const ok = stateOk && numbersOk;
      setPhonePermission(ok);
      if (!ok) {
        Alert.alert(
          'Permission Denied',
          'To read the SIM phone number:\n\n1. Settings → Apps → MRP\n2. Permissions\n3. Enable Phone / Phone numbers',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: openAppDetails},
          ],
        );
      } else {
        await checkPermissions();
      }
    } catch (e) {
      console.error('[PermissionsScreen] Phone permission error:', e);
      await openAppDetails();
    }
  };

  const requestNotificationsPermission = async () => {
    if (Platform.OS !== 'android') return;
    if (Platform.Version < 33) {
      setNotificationsPermission(true);
      return;
    }
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: 'Notifications',
          message:
            'MRP needs notifications to keep monitoring alive and alert you for security events.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setNotificationsPermission(ok);
      if (!ok) {
        Alert.alert(
          'Notifications denied',
          'Path:\n\n1. Settings → Apps → MRP → Notifications\n2. Allow notifications\n\nOr: Settings → Notifications → App notifications → MRP → Allow',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Open Settings',
              onPress: async () => {
                try {
                  const opened = await (mrpmModule as any).openAppNotificationSettings?.();
                  if (!opened) await openAppDetails();
                } catch {
                  await openAppDetails();
                }
              },
            },
          ],
        );
      } else {
        await checkPermissions();
      }
    } catch (e) {
      console.error('[PermissionsScreen] Notifications permission error:', e);
      try {
        await (mrpmModule as any).openAppNotificationSettings?.();
      } catch {
        await openAppDetails();
      }
    }
  };

  const requestBluetoothPermission = async () => {
    if (Platform.OS !== 'android') return;
    const bt = bluetoothConnectPerm();
    if (!bt) {
      setBluetoothPermission(true);
      return;
    }
    try {
      const granted = await PermissionsAndroid.request(bt as any, {
        title: 'Nearby devices',
        message:
          'MRP needs Nearby devices access to log Bluetooth connect and disconnect on the security timeline.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setBluetoothPermission(ok);
      if (!ok) {
        Alert.alert(
          'Nearby devices denied',
          'Path:\n\n1. Settings → Apps → MRP → Permissions\n2. Nearby devices (or Bluetooth)\n3. Allow',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: openAppDetails},
          ],
        );
      } else {
        await checkPermissions();
      }
    } catch (e) {
      console.error('[PermissionsScreen] Bluetooth permission error:', e);
      await openAppDetails();
    }
  };

  const requestBackgroundLocation = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const fine = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (fine !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Location required first',
          'Path:\n\n1. Settings → Apps → MRP → Permissions → Location\n2. Allow while using the app\n3. Then return here for “Allow all the time”',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: openAppDetails},
          ],
        );
        await checkPermissions();
        return;
      }
      if (Platform.Version >= 29) {
        const bg = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'Background location',
            message:
              'Allow all the time so geofence and SIM recovery can log location when MRP is not open.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        const ok = bg === PermissionsAndroid.RESULTS.GRANTED;
        setBackgroundLocationPermission(ok);
        if (!ok) {
          Alert.alert(
            'Background location',
            'Path:\n\n1. Settings → Apps → MRP → Permissions → Location\n2. Select “Allow all the time”\n\nOn some phones: Settings → Location → App location permissions → MRP → Allow all the time',
            [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Open Settings', onPress: openAppDetails},
            ],
          );
        }
      } else {
        setBackgroundLocationPermission(true);
      }
      await checkPermissions();
    } catch (e) {
      console.error('[PermissionsScreen] Background location error:', e);
      await openAppDetails();
    }
  };

  const openAppBatteryUsage = async () => {
    try {
      if (!mrpmModule) {
        Alert.alert('Error', 'Native module not available.');
        return;
      }
      const ok = await (mrpmModule as any).openAppBatteryUsageSettings?.();
      if (!ok) {
        Alert.alert(
          'Open Battery settings',
          'Go to Settings → Apps → MRP → App battery usage, then choose Unrestricted / Optimized / Restricted.',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'App settings', onPress: openAppDetails},
          ],
        );
      } else {
        setTimeout(checkPermissions, 1200);
      }
    } catch (e) {
      console.error('[PermissionsScreen] Error opening app battery usage:', e);
      await openAppDetails();
    }
  };

  const openAccessibilitySettings = async () => {
    try {
      if (!mrpmModule) {
        Alert.alert('Error', 'Native module not available.');
        return;
      }
      await mrpmModule.requestAccessibilityEnable();
    } catch (e) {
      console.error('[PermissionsScreen] Error opening accessibility settings:', e);
      await openAppDetails();
    }
  };

  const requestDeviceAdmin = async () => {
    try {
      if (!mrpmModule) {
        Alert.alert('Error', 'Native module not available.');
        return;
      }
      const isEnabled = await mrpmModule.isDeviceAdminEnabled();
      if (!isEnabled) {
        await mrpmModule.requestDeviceAdminEnable();
        // Refresh permissions after request
        setTimeout(checkPermissions, 1500);
      } else {
        Alert.alert('Device Admin', 'Device Admin is already enabled.');
      }
    } catch (e) {
      console.error('[PermissionsScreen] Error requesting device admin:', e);
      Alert.alert('Error', 'Could not enable Device Admin. Please try from Settings.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading permissions...</Text>
      </View>
    );
  }

  const permissions: PermissionDetail[] = [
    {
      name: 'Camera Access',
      icon: '📷',
      description:
        'Required to capture intruder selfies during security events. Camera is used only when a capture is triggered (wrong password, USB, panic, etc.).',
      granted: cameraPermission === true,
      grantSteps: [
        'Path: Settings → Apps → MRP → Permissions → Camera → Allow',
      ],
      onOpen: openAppDetails,
      buttonLabel: 'Open App Settings',
    },
    {
      name: 'Location (while using)',
      icon: '📍',
      description:
        'Required to attach GPS to security events and geofence checks while MRP is open or monitoring is active.',
      granted: locationPermission === true,
      grantSteps: [
        'Path: Settings → Apps → MRP → Permissions → Location',
        'Choose “Allow only while using the app” (then set “Allow all the time” below)',
      ],
      onOpen: openAppDetails,
      buttonLabel: 'Open App Settings',
    },
    {
      name: 'Background Location',
      icon: '🌐',
      description:
        'Required for geofence enter/exit and SIM recovery location when MRP is not on screen. Android shows this as “Allow all the time”.',
      granted: backgroundLocationPermission === true,
      grantSteps: [
        'Grant Location (while using) first',
        'Path: Settings → Apps → MRP → Permissions → Location → Allow all the time',
        'Alt: Settings → Location → App location permissions → MRP → Allow all the time',
      ],
      onOpen: requestBackgroundLocation,
      buttonLabel: 'Allow all the time',
    },
    {
      name: 'Notifications',
      icon: '🔔',
      description:
        'Required on Android 13+ so the monitoring foreground service can stay alive and show security alerts.',
      granted: notificationsPermission === true,
      grantSteps: [
        'Tap Allow Notifications below for the system dialog',
        'Path: Settings → Apps → MRP → Notifications → Allow',
        'Alt: Settings → Notifications → App notifications → MRP → Allow',
      ],
      onOpen: requestNotificationsPermission,
      buttonLabel: 'Allow Notifications',
    },
    {
      name: 'Nearby devices (Bluetooth)',
      icon: '🎧',
      description:
        'Required on Android 12+ to log BLUETOOTH_CONNECTED / DISCONNECTED timeline events when headphones or other devices link.',
      granted: bluetoothPermission === true,
      grantSteps: [
        'Tap Allow Nearby devices below for the system dialog',
        'Path: Settings → Apps → MRP → Permissions → Nearby devices → Allow',
        'Some OEMs label this “Bluetooth” or “Nearby devices / Bluetooth”',
      ],
      onOpen: requestBluetoothPermission,
      buttonLabel: 'Allow Nearby devices',
    },
    {
      name: 'Phone / SIM Number',
      icon: '📱',
      description:
        'Required to read the phone number on the inserted SIM so recovery SMS can include "New Number".',
      granted: phonePermission === true,
      grantSteps: [
        'Tap "Allow Phone" below to show the system dialog',
        'Path: Settings → Apps → MRP → Permissions → Phone / Phone numbers → Allow',
      ],
      onOpen: requestPhonePermission,
      buttonLabel: 'Allow Phone',
    },
    {
      name: 'SMS / Messages',
      icon: '💬',
      description:
        'SIM Change Recovery only. MRP sends an outbound SMS to your recovery contacts when the SIM changes — with location. MRP does not read your SMS inbox.',
      granted: smsPermission === true,
      grantSteps: [
        'Tap "Allow SMS" below to show the system dialog',
        'Path: Settings → Apps → MRP → Permissions → SMS / Messages → Allow',
      ],
      onOpen: requestSmsPermission,
      buttonLabel: 'Allow SMS',
    },
    {
      name: 'Display Over Other Apps',
      icon: '🖥️',
      description:
        'Required to show the camera overlay and capture selfies while the screen is locked or MRP is in the background.',
      granted: overlayPermission === true,
      grantSteps: [
        'Path: Settings → Apps → MRP → ⋮ → Display over other apps → Allow',
        'Alt: Settings → Apps → Special access → Display over other apps → MRP → Allow',
      ],
      onOpen: openOverlaySettings,
      buttonLabel: 'Open Overlay Settings',
    },
    {
      name: 'Device Admin Access',
      icon: '🔐',
      description:
        'Required to detect wrong PIN/password unlock attempts and related lock-screen security events.',
      granted: deviceAdminPermission === true,
      grantSteps: [
        'Path: Settings → Security → Device admin apps → MRP → Activate',
        'Some OEMs: Settings → Security & privacy → More security settings → Device admin apps',
      ],
      onOpen: requestDeviceAdmin,
      buttonLabel: 'Enable Device Admin',
    },
    {
      name: 'Accessibility Service (optional)',
      icon: '♿',
      description:
        'Optional: detect failed fingerprint or face unlock. Not required for wrong-PIN monitoring (Device Admin covers that).',
      granted: accessibilityPermission === true,
      grantSteps: [
        'Path: Settings → Accessibility → Installed apps / Downloaded services → MRP → On',
      ],
      onOpen: openAccessibilitySettings,
      buttonLabel: 'Open Accessibility Settings',
    },
    {
      name: 'Usage Stats Access',
      icon: '📊',
      description:
        'Required for App Usage screen time and to see which apps were foreground during security events.',
      granted: usageStatsPermission === true,
      grantSteps: [
        'Path: Settings → Apps → Special access → Usage access → MRP → Allow',
        'Some OEMs: Settings → Security → Special app access → Usage access',
      ],
      onOpen: openUsageAccessSettings,
      buttonLabel: 'Open Usage Access Settings',
    },
    {
      name: 'App Battery Usage',
      icon: '🔋',
      description:
        'Controls how MRP runs in the background: Unrestricted, Optimized, or Restricted. Recommended: Unrestricted so monitoring is not killed.',
      granted: batteryUnrestricted === true,
      grantSteps: [
        'Path: Settings → Apps → MRP → App battery usage',
        'Choose Unrestricted (recommended), Optimized, or Restricted',
        'Return here and re-open this screen to refresh status',
      ],
      onOpen: openAppBatteryUsage,
      buttonLabel: 'Configure App Battery Usage',
      alwaysConfigurable: true,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Required Permissions</Text>
        <Text style={styles.headerSubtitle}>MRP Stay Sync - Stay Connected</Text>
      </View>

      {/* Permissions List */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>All Permissions</Text>

        {permissions.map((perm) => (
          <View key={perm.name} style={styles.permissionItem}>
            <View style={styles.permissionIconBox}>
              <Text style={styles.permissionIcon}>{perm.icon}</Text>
            </View>

            <View style={styles.permissionTextContainer}>
              <Text style={styles.permissionName}>{perm.name}</Text>
              <Text style={styles.permissionDescription} numberOfLines={5} ellipsizeMode="tail">
                {perm.description}
              </Text>

              <View style={styles.grantedStatus}>
                {perm.granted ? (
                  <View style={styles.grantedBadge}>
                    <Text style={styles.grantedText}>
                      {perm.alwaysConfigurable ? '✓ Unrestricted' : '✓ Granted'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.deniedBadge}>
                    <Text style={styles.deniedText}>
                      {perm.alwaysConfigurable ? '○ Optimized / Restricted' : '✗ Denied'}
                    </Text>
                  </View>
                )}
              </View>

              {(!perm.granted || perm.alwaysConfigurable) && (
                <View style={styles.manualGrantSection}>
                  <Text style={styles.manualGrantTitle}>
                    {perm.alwaysConfigurable ? 'Change in Android settings:' : 'How to enable:'}
                  </Text>
                  {perm.grantSteps.map((step, i) => (
                    <Text key={i} style={styles.stepText}>
                      {step}
                    </Text>
                  ))}
                  <TouchableOpacity
                    style={styles.openSettingsButton}
                    onPress={perm.onOpen}>
                    <Text style={styles.openSettingsButtonText}>{perm.buttonLabel}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Special Instructions */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Quick paths</Text>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🔔 Notifications (Android 13+)</Text>
          <Text style={styles.instructionDescription}>
            Keeps the monitoring service visible and delivers security alerts.
          </Text>
          <Text style={styles.instructionSteps}>
            Settings → Apps → MRP → Notifications → Allow
          </Text>
        </View>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🎧 Nearby devices</Text>
          <Text style={styles.instructionDescription}>
            Needed for Bluetooth connect/disconnect timeline events.
          </Text>
          <Text style={styles.instructionSteps}>
            Settings → Apps → MRP → Permissions → Nearby devices → Allow
          </Text>
        </View>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🌐 Background location</Text>
          <Text style={styles.instructionDescription}>
            Needed for geofence and SIM recovery when MRP is not open.
          </Text>
          <Text style={styles.instructionSteps}>
            Settings → Apps → MRP → Permissions → Location → Allow all the time
          </Text>
        </View>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🖥️ Display over other apps</Text>
          <Text style={styles.instructionDescription}>
            Camera overlay for locked-screen / background selfie capture.
          </Text>
          <Text style={styles.instructionSteps}>
            Settings → Apps → MRP → ⋮ → Display over other apps → Enable
          </Text>
        </View>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🔐 Device Admin</Text>
          <Text style={styles.instructionDescription}>
            Detects wrong PIN/password unlock attempts.
          </Text>
          <TouchableOpacity
            style={styles.requestButton}
            onPress={requestDeviceAdmin}>
            <Text style={styles.requestButtonText}>Enable Device Admin</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>MRP Stay Sync.. Stay Connected</Text>
        <Text style={styles.footerSubtext}>
          Your phone, your security, your peace of mind
        </Text>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 80, // Extra padding for footer
    },
    header: {
      marginBottom: 20,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1,
      marginBottom: 12,
    },
    permissionItem: {
      flexDirection: 'row',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    permissionIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    permissionIcon: {
      fontSize: 22,
    },
    permissionTextContainer: {
      flex: 1,
    },
    permissionName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    permissionDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 8,
    },
    grantedStatus: {
      marginBottom: 8,
    },
    grantedBadge: {
      backgroundColor: colors.emeraldSoft,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 6,
    },
    grantedText: {
      color: colors.emerald,
      fontSize: 12,
      fontWeight: '600',
    },
    deniedBadge: {
      backgroundColor: colors.redSoft,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 6,
    },
    deniedText: {
      color: colors.red,
      fontSize: 12,
      fontWeight: '600',
    },
    manualGrantSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    manualGrantTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 8,
    },
    stepText: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 4,
    },
    openSettingsButton: {
      backgroundColor: colors.sky,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
      width: '100%',
    },
    openSettingsButtonText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    instructionCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    instructionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    instructionDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 8,
    },
    instructionSteps: {
      fontSize: 11,
      color: colors.textMuted,
      lineHeight: 16,
      backgroundColor: colors.bg,
      padding: 12,
      borderRadius: 8,
    },
    requestButton: {
      backgroundColor: colors.violet,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
    },
    requestButtonText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
      paddingTop: 20,
      paddingBottom: 20,
    },
    footerText: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    footerSubtext: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 4,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });
}
