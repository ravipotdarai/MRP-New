import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  Platform,
  PermissionsAndroid,
  Alert,
  TouchableOpacity,
  AppState,
  type Permission,
} from 'react-native';
import {useSettings} from '../../shared/hooks/useSettings';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {SimRecoveryPanel} from '../sim-recovery/SimRecoveryPanel';
import {PermissionSetupWizard} from '../setup/PermissionSetupWizard';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type PermOutcome = 'granted' | 'denied' | 'blocked';

/** Surfaces SIM Recovery render failures instead of silently blanking the panel. */
class SimRecoveryErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {error: string | null}
> {
  state = {error: null as string | null};

  static getDerivedStateFromError(error: Error) {
    return {error: error?.message || String(error)};
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{padding: 12, backgroundColor: '#450a0a', borderRadius: 8}}>
          <Text style={{color: '#fecaca', fontWeight: '700'}}>SIM Recovery failed to load</Text>
          <Text style={{color: '#fca5a5', marginTop: 6}}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/**
 * Request Android runtime permission(s) via native PermissionAwareActivity
 * so the system dialog shows every time the OS still allows it.
 */
async function requestRuntimePermissions(
  permissions: Permission[],
): Promise<PermOutcome> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }

  const unique = [...new Set(permissions.filter(Boolean))];
  if (unique.length === 0) {
    return 'granted';
  }

  try {
    if (typeof mrpmModule.requestRuntimePermissions === 'function') {
      const granted = await mrpmModule.requestRuntimePermissions(unique);
      if (granted) {
        return 'granted';
      }
      try {
        const canAskAgain = await Promise.all(
          unique.map(p =>
            PermissionsAndroid.shouldShowRequestPermissionRationale(p),
          ),
        );
        // After Deny, rationale=true means OS will show the dialog again next time
        if (canAskAgain.some(Boolean)) {
          return 'denied';
        }
      } catch {
        /* ignore */
      }
      // Permanent deny (or OEM won't re-prompt) — open Settings
      return 'blocked';
    }

    // Fallback if native method missing
    const result =
      unique.length === 1
        ? ({[unique[0]]: await PermissionsAndroid.request(unique[0])} as Record<
            string,
            string
          >)
        : ((await PermissionsAndroid.requestMultiple(unique)) as Record<
            string,
            string
          >);

    const statuses = unique.map(p => result[p]);
    if (statuses.every(s => s === PermissionsAndroid.RESULTS.GRANTED)) {
      return 'granted';
    }
    if (statuses.some(s => s === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
      return 'blocked';
    }
    return 'denied';
  } catch (e) {
    console.error('[requestRuntimePermissions]', e);
    return 'denied';
  }
}

function locationPermissions(): Permission[] {
  return [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ];
}

function promptOpenSettings(title: string, message: string) {
  Alert.alert(title, message, [
    {text: 'Cancel', style: 'cancel'},
    {
      text: 'Open Settings',
      onPress: async () => {
        try {
          await mrpmModule.openAppSettings();
        } catch {
          /* ignore */
        }
      },
    },
  ]);
}

/**
 * Controlled Switch often stops firing onValueChange after Deny (value stays false).
 * Wrap in Pressable + remount key so every tap when OFF re-requests the system dialog.
 */
function PermissionSwitch({
  value,
  onRequestEnable,
  onRequestDisable,
}: {
  value: boolean;
  onRequestEnable: () => Promise<boolean>;
  onRequestDisable: () => void;
}) {
  const {colors} = useTheme();
  const [switchKey, setSwitchKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) {
      return;
    }
    if (value) {
      onRequestDisable();
      return;
    }
    setBusy(true);
    try {
      await onRequestEnable();
    } finally {
      setBusy(false);
      // Remount so the next tap always works after Deny
      setSwitchKey(k => k + 1);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={busy}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <View pointerEvents="none">
        <Switch
          key={switchKey}
          value={value}
          trackColor={{false: colors.border, true: colors.emeraldDark}}
          thumbColor={value ? colors.emerald : colors.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );
}

interface SettingItemProps {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  isLast?: boolean;
}

function SettingItem({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  isLast = false,
}: SettingItemProps) {
  const {colors} = useTheme();
  const styles = useMemo(() => createMonitoringStyles(colors), [colors]);

  const handleValueChange = async (val: boolean) => {
    if (onValueChange) {
      try {
        await onValueChange(val);
      } catch (err) {
        console.error('[SettingItem] Error in onValueChange:', err);
        Alert.alert('Error', 'Toggle click failed: ' + String(err));
      }
    }
  };

  return (
    <View style={[styles.itemContainer, !isLast && styles.itemBorder]}>
      <View style={styles.iconBox}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={handleValueChange}
        trackColor={{false: colors.border, true: colors.emeraldDark}}
        thumbColor={value ? colors.emerald : colors.textSecondary}
      />
    </View>
  );
}

export function MonitoringScreen() {
  const {settings, loading, updateSetting} = useSettings();
  const {colors} = useTheme();
  const styles = useMemo(() => createMonitoringStyles(colors), [colors]);
  const [isDeviceAdminEnabled, setIsDeviceAdminEnabled] = useState(false);
  const [hasCameraPerm, setHasCameraPerm] = useState(false);
  const [hasLocationPerm, setHasLocationPerm] = useState(false);
  const [hasOverlayPerm, setHasOverlayPerm] = useState(false);
  const [hasAccessibility, setHasAccessibility] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [coreSetupComplete, setCoreSetupComplete] = useState(true);

  const checkPermissions = useCallback(async () => {
    try {
      const camCheck = await mrpmModule.checkCameraPermission();
      const locCheck = await mrpmModule.checkLocationPermission();
      const admin = await mrpmModule.isDeviceAdminEnabled();
      const overlayCheck = await mrpmModule.checkOverlayPermission();

      setIsDeviceAdminEnabled(admin);
      setHasCameraPerm(camCheck);
      setHasLocationPerm(locCheck);
      setHasOverlayPerm(overlayCheck);
      const a11y = await mrpmModule.isAccessibilityEnabled?.().catch(() => false);
      setHasAccessibility(!!a11y);
      if (typeof (mrpmModule as any).getPermissionSetupStatus === 'function') {
        const st = await (mrpmModule as any).getPermissionSetupStatus();
        setCoreSetupComplete(!!st?.coreComplete);
      }
    } catch (e) {
      console.error('[checkPermissions] Failed to check permissions:', e);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  // Re-sync when returning from the system permission dialog / Settings
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        checkPermissions();
      }
    });
    return () => sub.remove();
  }, [checkPermissions]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Security Shield...</Text>
      </View>
    );
  }

  const allPermsGranted = hasCameraPerm && hasLocationPerm && hasOverlayPerm && isDeviceAdminEnabled;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Master Security Status Header */}
      <View style={styles.masterBanner}>
        <View style={styles.bannerLeft}>
          <View style={[styles.shieldIconBox, {backgroundColor: settings.isMonitoringEnabled ? '#065f46' : '#450a0a'}]}>
            <Text style={styles.shieldIcon}>🛡️</Text>
          </View>
          <View>
            <Text style={styles.bannerTitle}>MRP Protection</Text>
            <Text style={styles.bannerStatus}>
              {settings.isMonitoringEnabled ? 'Active & Surveillance Armed' : 'Monitoring Paused'}
            </Text>
          </View>
        </View>
        <Switch
          value={settings.isMonitoringEnabled}
          onValueChange={v => updateSetting('isMonitoringEnabled', v)}
          trackColor={{false: colors.border, true: colors.emeraldDark}}
          thumbColor={
            settings.isMonitoringEnabled ? colors.emerald : colors.textSecondary
          }
        />
      </View>

      {/* Required Permissions Hub */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SYSTEM ACCESS & PERMISSIONS</Text>
        </View>

        {/* Navigate to full permissions screen */}
        <TouchableOpacity
          style={styles.managePermissionsButton}
          onPress={() => setShowSetupWizard(true)}
          activeOpacity={0.75}>
          <Text style={styles.managePermissionsButtonText}>
            {coreSetupComplete ? '🔒 Review permissions setup' : '🔒 Grant All Access'}
          </Text>
          <Text style={styles.managePermissionsButtonSubtitle}>
            Guided one-time flow — camera, location, overlay, device admin, battery
          </Text>
        </TouchableOpacity>

        {!allPermsGranted && (
          <TouchableOpacity
            style={styles.grantAllButton}
            onPress={() => setShowSetupWizard(true)}>
            <Text style={styles.grantAllButtonText}>⚠️ Grant All Access (guided)</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.itemContainer, styles.itemBorder]}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>📷</Text>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.itemTitle}>Camera Access</Text>
            <Text style={styles.itemSubtitle}>Capture intruder selfie on security event</Text>
          </View>
          <PermissionSwitch
            value={hasCameraPerm}
            onRequestEnable={async () => {
              const outcome = await requestRuntimePermissions([
                PermissionsAndroid.PERMISSIONS.CAMERA,
              ]);
              const granted = outcome === 'granted';
              setHasCameraPerm(granted);
              if (outcome === 'blocked') {
                promptOpenSettings(
                  'Camera permission blocked',
                  'Android will no longer show the permission dialog. Enable Camera in App Settings.',
                );
              }
              return granted;
            }}
            onRequestDisable={() => {
              Alert.alert(
                'Disable Camera Access',
                'Turn off camera access in MRP?',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Disable',
                    style: 'destructive',
                    onPress: () => setHasCameraPerm(false),
                  },
                ],
              );
            }}
          />
        </View>

        <View style={[styles.itemContainer, styles.itemBorder]}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>📍</Text>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.itemTitle}>Location Access</Text>
            <Text style={styles.itemSubtitle}>Record GPS coordinates & exact address</Text>
          </View>
          <PermissionSwitch
            value={hasLocationPerm}
            onRequestEnable={async () => {
              const outcome = await requestRuntimePermissions(locationPermissions());
              const granted = outcome === 'granted';
              setHasLocationPerm(granted);
              if (outcome === 'blocked') {
                promptOpenSettings(
                  'Location permission blocked',
                  'Android will no longer show the permission dialog. Enable Location in App Settings.',
                );
              }
              return granted;
            }}
            onRequestDisable={() => {
              Alert.alert(
                'Disable Location Access',
                'Turn off location access in MRP?',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Disable',
                    style: 'destructive',
                    onPress: () => setHasLocationPerm(false),
                  },
                ],
              );
            }}
          />
        </View>

        <SettingItem
          icon="🖥️"
          title="Display Over Other Apps"
          subtitle="Required to take selfies while phone is locked or app is in background"
          value={hasOverlayPerm}
          onValueChange={async val => {
            if (val) {
              await mrpmModule.requestOverlayPermission();
            } else {
              Alert.alert(
                'Manage Overlay',
                'Disable Display Over Other Apps in Android Settings.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {text: 'Open Settings', onPress: async () => {
                    await mrpmModule.openAppSettings();
                    setTimeout(checkPermissions, 1000);
                  }},
                ],
              );
            }
            setTimeout(checkPermissions, 1000);
          }}
        />

        {/* Phone/SMS permissions are requested by SIM Recovery "Protection Enabled" — no separate toggle */}

        <SettingItem
          icon="🔐"
          title="Device Admin Access"
          subtitle="Detect wrong password unlock attempts"
          value={isDeviceAdminEnabled}
          isLast={false}
          onValueChange={async val => {
            if (val) {
              await mrpmModule.requestDeviceAdminEnable();
            } else {
              await mrpmModule.disableDeviceAdmin();
              setIsDeviceAdminEnabled(false);
            }
            setTimeout(checkPermissions, 1000);
          }}
        />

        <SettingItem
          icon="♿"
          title="Accessibility (optional)"
          subtitle="Enhanced: failed fingerprint/face unlock detection"
          value={hasAccessibility}
          isLast={true}
          onValueChange={async val => {
            if (val) {
              await mrpmModule.requestAccessibilityEnable();
            } else {
              Alert.alert(
                'Disable in Settings',
                'Turn off MRP under Settings → Accessibility if you no longer need biometric detection.',
                [
                  {text: 'OK'},
                  {text: 'Open Settings', onPress: () => mrpmModule.requestAccessibilityEnable()},
                ],
              );
            }
            setTimeout(checkPermissions, 1000);
          }}
        />
      </View>

      {/* SIM Change Recovery — placed here (right after permissions) so it stays visible */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SIM CHANGE RECOVERY ALERT</Text>
        </View>
        <Text style={styles.simRecoveryHint}>
          Alert trusted contacts by SMS when a different SIM is inserted. Add contacts and use Test
          SMS below.
        </Text>
        <SimRecoveryErrorBoundary>
          <SimRecoveryPanel />
        </SimRecoveryErrorBoundary>
      </View>

      {/* Security Surveillance Rules */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SECURITY FEATURES & TRIGGERS</Text>
        </View>

        <SettingItem
          icon="💻"
          title="USB Connection"
          subtitle="Take selfie & log event when USB cable is connected"
          value={settings.captureOnUsb}
          onValueChange={v => updateSetting('captureOnUsb', v)}
        />

        <SettingItem
          icon="🚨"
          title="Wrong Unlock Attempt"
          subtitle="Take selfie on incorrect PIN, password or fingerprint"
          value={settings.captureOnWrongUnlock}
          onValueChange={v => updateSetting('captureOnWrongUnlock', v)}
        />

        <SettingItem
          icon="📶"
          title="Wi-Fi Toggles"
          subtitle="Log event when Wi-Fi state is changed"
          value={settings.captureOnWifiToggle}
          onValueChange={v => updateSetting('captureOnWifiToggle', v)}
        />

        <SettingItem
          icon="✈️"
          title="Airplane Mode"
          subtitle="Log event when Airplane Mode is toggled"
          value={settings.captureOnAirplaneMode}
          onValueChange={v => updateSetting('captureOnAirplaneMode', v)}
        />

        <SettingItem
          icon="📱"
          title="Mobile Data State"
          subtitle="Log event when cellular data is toggled"
          value={settings.captureOnMobileData}
          onValueChange={v => updateSetting('captureOnMobileData', v)}
        />

        <SettingItem
          icon="🔥"
          title="Personal Hotspot"
          subtitle="Log event when tethering is toggled"
          value={settings.captureOnHotspot}
          onValueChange={v => updateSetting('captureOnHotspot', v)}
        />

        <SettingItem
          icon="🔄"
          title="SIM Card Tampering"
          subtitle="Trigger alert when SIM card is removed or changed"
          value={settings.captureOnSimChange}
          onValueChange={v => updateSetting('captureOnSimChange', v)}
        />

        <SettingItem
          icon="💣"
          title="Factory Reset Protection"
          subtitle="Log alert on unauthorized device wipe attempts"
          value={settings.captureOnFactoryReset}
          isLast={true}
          onValueChange={v => updateSetting('captureOnFactoryReset', v)}
        />
      </View>
    </ScrollView>
    <PermissionSetupWizard
      visible={showSetupWizard}
      onClose={() => {
        setShowSetupWizard(false);
        checkPermissions();
      }}
      onComplete={() => {
        setCoreSetupComplete(true);
        checkPermissions();
      }}
    />
    </>
  );
}

function createMonitoringStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.sky,
    fontSize: 15,
    fontWeight: '600',
  },
  simRecoveryHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  masterBanner: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shieldIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  shieldIcon: {
    fontSize: 22,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  bannerStatus: {
    fontSize: 12,
    color: colors.emerald,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  grantAllButton: {
    backgroundColor: colors.redDark,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  grantAllButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  managePermissionsButton: {
    backgroundColor: colors.skySoft,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'flex-start',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: colors.sky,
  },
  managePermissionsButtonText: {
    color: colors.sky,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  managePermissionsButtonSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
    paddingRight: 10,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
}