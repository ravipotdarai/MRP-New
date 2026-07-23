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
  Modal,
  TextInput,
  Linking,
  type Permission,
} from 'react-native';
import {useSettings} from '../../shared/hooks/useSettings';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {PermissionSetupWizard} from '../setup/PermissionSetupWizard';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

type PermOutcome = 'granted' | 'denied' | 'blocked';

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
        // RN typings omit this Android API; it exists at runtime.
        const showRationale = (
          PermissionsAndroid as unknown as {
            shouldShowRequestPermissionRationale?: (
              permission: Permission,
            ) => Promise<boolean>;
          }
        ).shouldShowRequestPermissionRationale;
        if (typeof showRationale === 'function') {
          const canAskAgain = await Promise.all(unique.map(p => showRationale(p)));
          // After Deny, rationale=true means OS will show the dialog again next time
          if (canAskAgain.some(Boolean)) {
            return 'denied';
          }
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
  const [softWipeVisible, setSoftWipeVisible] = useState(false);
  const [softWipeToken, setSoftWipeToken] = useState('');
  const [softWipeBusy, setSoftWipeBusy] = useState(false);

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

        {/* Phone/SMS for SIM Recovery are managed under Hub → SIM Recovery */}

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
          subtitle="Instant Lock + failed fingerprint/face detection"
          value={hasAccessibility}
          isLast={true}
          onValueChange={async val => {
            if (val) {
              await mrpmModule.requestAccessibilityEnable();
            } else {
              Alert.alert(
                'Disable in Settings',
                'Turn off MRP under Settings → Accessibility if you no longer need Instant Lock or biometric detection.',
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

      {/* Owner device care — no Device Admin wipe/force-lock */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DEVICE CARE (OWNER)</Text>
        </View>
        <TouchableOpacity
          style={styles.careBtn}
          onPress={async () => {
            try {
              const result = await mrpmModule.lockScreenNow();
              if (result?.ok) return;
              if (result?.reason === 'accessibility_required') {
                Alert.alert(
                  'Accessibility required',
                  'Enable MRP under Settings → Accessibility to lock the screen instantly (no Device Admin force-lock).',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Open Settings',
                      onPress: () => mrpmModule.requestAccessibilityEnable(),
                    },
                  ],
                );
              } else {
                Alert.alert('Could not lock', result?.message || 'Instant lock failed');
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Instant lock failed');
            }
          }}>
          <Text style={styles.careBtnTitle}>Lock screen now</Text>
          <Text style={styles.careBtnSub}>Uses Accessibility — not Device Admin force-lock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.careBtn, styles.careBtnDanger]}
          onPress={() => {
            setSoftWipeToken('');
            setSoftWipeVisible(true);
          }}>
          <Text style={styles.careBtnTitle}>Erase MRP data (soft wipe)</Text>
          <Text style={styles.careBtnSub}>Type WIPE — keeps device PIN & Google account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.careBtn}
          onPress={async () => {
            try {
              await mrpmModule.openFindMyDevice();
            } catch {
              Linking.openURL('https://www.google.com/android/find').catch(() => {});
            }
          }}>
          <Text style={styles.careBtnTitle}>Factory reset via Find My Device</Text>
          <Text style={styles.careBtnSub}>Google’s trusted wipe — banks do not flag MRP for this</Text>
        </TouchableOpacity>
        <Text style={styles.careHint}>
          MRP app PIN is unchanged by soft wipe. To reset it, use Forgot PIN on the lock screen
          (recovery code or Google). Soft wipe and Find My Device erase data / factory-reset the
          phone — they do not change your MRP PIN.
        </Text>
      </View>

      <Modal
        visible={softWipeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !softWipeBusy && setSoftWipeVisible(false)}>
        <View style={styles.wipeOverlay}>
          <View style={styles.wipeCard}>
            <Text style={styles.wipeTitle}>Erase MRP data</Text>
            <Text style={styles.wipeBody}>
              Stops monitoring and deletes timeline, selfies, SIM recovery, and local circles. Does
              not factory-reset the phone. Type WIPE to confirm.
            </Text>
            <TextInput
              style={styles.wipeInput}
              value={softWipeToken}
              onChangeText={setSoftWipeToken}
              placeholder="WIPE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              editable={!softWipeBusy}
            />
            <TouchableOpacity
              style={[styles.wipeConfirm, softWipeBusy && {opacity: 0.6}]}
              disabled={softWipeBusy}
              onPress={async () => {
                setSoftWipeBusy(true);
                try {
                  const result = await mrpmModule.performSoftWipe(softWipeToken);
                  setSoftWipeVisible(false);
                  Alert.alert(
                    result?.ok ? 'Soft wipe done' : 'Not erased',
                    result?.message || 'Soft wipe failed',
                  );
                  if (result?.ok) checkPermissions();
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'Soft wipe failed');
                } finally {
                  setSoftWipeBusy(false);
                }
              }}>
              <Text style={styles.wipeConfirmText}>Erase</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={softWipeBusy}
              onPress={() => setSoftWipeVisible(false)}
              style={styles.wipeCancel}>
              <Text style={styles.wipeCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
          isLast={false}
          onValueChange={v => updateSetting('captureOnFactoryReset', v)}
        />
        <SettingItem
          icon="📦"
          title="App install alerts"
          subtitle="Log new / updated apps on Timeline"
          value={settings.captureOnAppInstall ?? true}
          isLast={false}
          onValueChange={v => updateSetting('captureOnAppInstall', v)}
        />
        <SettingItem
          icon="⚠️"
          title="Selfie on risky installs"
          subtitle="Capture when a HIGH/CRITICAL risk app is installed"
          value={settings.captureOnRiskyAppInstall ?? true}
          isLast={false}
          onValueChange={v => updateSetting('captureOnRiskyAppInstall', v)}
        />
        <SettingItem
          icon="📵"
          title="App misuse alerts"
          subtitle="Timeline alerts when misuse rules match (App Usage → Safety)"
          value={settings.captureOnAppMisuse ?? true}
          isLast={true}
          onValueChange={v => updateSetting('captureOnAppMisuse', v)}
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
  careBtn: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  careBtnDanger: {
    borderColor: colors.red,
  },
  careBtnTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  careBtnSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  careHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  wipeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  wipeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wipeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  wipeBody: {
    fontSize: 14,
    color: colors.textBody,
    lineHeight: 20,
    marginBottom: 12,
  },
  wipeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    marginBottom: 12,
    fontSize: 16,
  },
  wipeConfirm: {
    backgroundColor: colors.redDark,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  wipeConfirmText: {color: '#fff', fontWeight: '800'},
  wipeCancel: {alignItems: 'center', paddingVertical: 12},
  wipeCancelText: {color: colors.textMuted, fontWeight: '700'},
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