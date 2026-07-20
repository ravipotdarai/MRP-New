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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPermissions();
  }, []);

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

      console.log('[PermissionsScreen] Permission results:', {
        camera: cam,
        location: loc,
        overlay: overlay,
        admin: admin,
        usageStats: usageStats,
        sms: sms,
        phone: phone,
      });

      setCameraPermission(cam);
      setLocationPermission(loc);
      setOverlayPermission(overlay);
      setDeviceAdminPermission(admin);
      setUsageStatsPermission(usageStats);
      setSmsPermission(sms);
      setPhonePermission(phone);
      setAccessibilityPermission(a11y);
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
      description: 'Required to capture intruder selfies during security events. The app uses camera only when you actively trigger a capture (via wrong password, USB connection, etc.).',
      granted: cameraPermission === true,
      grantSteps: [
        'Go to: Settings → Apps → MRP',
        'Tap on "Permissions"',
        'Enable "Camera"',
      ],
      onOpen: openAppDetails,
      buttonLabel: 'Open App Settings',
    },
    {
      name: 'Location Access',
      icon: '📍',
      description: 'Required to log GPS coordinates and addresses for security events. Location is stored locally on your device and used only for security event logging.',
      granted: locationPermission === true,
      grantSteps: [
        'Go to: Settings → Apps → MRP',
        'Tap on "Permissions"',
        'Enable "Location"',
        'Select "Allow all the time"',
      ],
      onOpen: openAppDetails,
      buttonLabel: 'Open App Settings',
    },
    {
      name: 'Phone / SIM Number',
      icon: '📱',
      description:
        'Required to read the phone number on the inserted SIM so recovery SMS can include "New Number". Same class of permission as Camera / Location.',
      granted: phonePermission === true,
      grantSteps: [
        'Tap "Allow Phone" below to show the system dialog',
        'Or go to: Settings → Apps → MRP → Permissions',
        'Enable "Phone" / "Phone numbers"',
      ],
      onOpen: requestPhonePermission,
      buttonLabel: 'Allow Phone',
    },
    {
      name: 'SMS / Messages',
      icon: '💬',
      description:
        'SIM Change Recovery only. MRP sends an outbound SMS to your recovery contacts when the SIM changes — with location. MRP does not read or receive your SMS inbox.',
      granted: smsPermission === true,
      grantSteps: [
        'Tap "Allow SMS" below to show the system dialog',
        'Or go to: Settings → Apps → MRP → Permissions',
        'Enable "SMS" / "Messages"',
      ],
      onOpen: requestSmsPermission,
      buttonLabel: 'Allow SMS',
    },
    {
      name: 'Display Over Other Apps',
      icon: '🖥️',
      description: 'Required to take selfies while your phone is locked or app is in background. The overlay shows a camera preview that captures intruder selfies.',
      granted: overlayPermission === true,
      grantSteps: [
        'Go to: Settings → Apps → MRP',
        'Tap on the three dots (⋮) in the top right corner',
        'Select "Display over other apps"',
        'Toggle ON',
      ],
      onOpen: openOverlaySettings,
      buttonLabel: 'Open Overlay Settings',
    },
    {
      name: 'Device Admin Access',
      icon: '🔐',
      description: 'Required to detect wrong password attempts, biometric unlocks, and unlock attempts. The app can detect when someone tries to unlock your phone.',
      granted: deviceAdminPermission === true,
      grantSteps: [
        'Go to: Settings → Security → Device Admin',
        'Tap on "Add device admin"',
        'Select "MRP" from the list',
        'Enable the device admin',
      ],
      onOpen: requestDeviceAdmin,
      buttonLabel: 'Enable Device Admin',
    },
    {
      name: 'Accessibility Service (optional)',
      icon: '♿',
      description:
        'Optional enhanced protection: detect failed fingerprint or face unlock. Not required for basic monitoring (wrong PIN uses Device Admin).',
      granted: accessibilityPermission === true,
      grantSteps: [
        'Go to: Settings → Accessibility',
        'Tap on "Installed apps" or "Downloaded services"',
        'Enable "MRP"',
      ],
      onOpen: openAccessibilitySettings,
      buttonLabel: 'Open Accessibility Settings',
    },
    {
      name: 'Usage Stats Access',
      icon: '📊',
      description: 'Required to track which apps are open on your phone during security events. This helps identify which apps were in use when suspicious activity occurred.',
      granted: usageStatsPermission === true, // Check actual permission
      grantSteps: [
        'Go to: Settings → Apps → Special access → Usage access',
        'Find "MRP" in the list',
        'Enable "MRP"',
      ],
      onOpen: openUsageAccessSettings,
      buttonLabel: 'Open Usage Access Settings',
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
              <Text style={styles.permissionDescription} numberOfLines={3} ellipsizeMode="tail">
                {perm.description}
              </Text>

              <View style={styles.grantedStatus}>
                {perm.granted ? (
                  <View style={styles.grantedBadge}>
                    <Text style={styles.grantedText}>✓ Granted</Text>
                  </View>
                ) : (
                  <View style={styles.deniedBadge}>
                    <Text style={styles.deniedText}>✗ Denied</Text>
                  </View>
                )}
              </View>

              {!perm.granted && (
                <View style={styles.manualGrantSection}>
                  <Text style={styles.manualGrantTitle}>How to enable:</Text>
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
        <Text style={styles.sectionTitle}>Special Permissions</Text>

        {/* Display Over Other Apps */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🖥️ Display Over Other Apps</Text>
          <Text style={styles.instructionDescription}>
            This permission allows MRP to show a camera preview on your locked screen or while the app is in the background.
          </Text>
          <Text style={styles.instructionSteps}>
            Steps: Settings → Apps → MRP → ⋮ (three dots) → Display over other apps → Enable
          </Text>
        </View>

        {/* Device Admin */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>🔐 Device Admin Access</Text>
          <Text style={styles.instructionDescription}>
            This permission allows MRP to detect wrong password attempts and monitor unlock events.
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
