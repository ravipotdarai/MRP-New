import React, {useState, useEffect} from 'react';
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
} from 'react-native';
import {useSettings} from '../../shared/hooks/useSettings';
import mrpmModule from '../../shared/hooks/useNativeBridge';

// Helper functions for permission requests
const requestCameraPermissionNative = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    console.log('[Permission] Requesting camera permission (always show dialog)...');
    // Request permission - this will ALWAYS show the native dialog in Bridgeless mode
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Access Required',
        message: 'MRP requires camera access to capture intruder selfies during security events.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    console.log('[Permission] Camera permission result:', granted);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.error('[Permission] Camera permission request error:', err);
    return false;
  }
};

const requestLocationPermissionNative = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    console.log('[Permission] Requesting location permission (always show dialog)...');
    // Request permission - this will ALWAYS show the native dialog in Bridgeless mode
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Access Required',
        message: 'MRP requires location access to log GPS coordinates and addresses for security events.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    console.log('[Permission] Location permission result:', granted);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.error('[Permission] Location permission request error:', err);
    return false;
  }
};

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
        trackColor={{false: '#334155', true: '#059669'}}
        thumbColor={value ? '#10b981' : '#94a3b8'}
      />
    </View>
  );
}

export function MonitoringScreen() {
  const {settings, loading, updateSetting} = useSettings();
  const [isDeviceAdminEnabled, setIsDeviceAdminEnabled] = useState(false);
  const [hasCameraPerm, setHasCameraPerm] = useState(false);
  const [hasLocationPerm, setHasLocationPerm] = useState(false);
  const [hasOverlayPerm, setHasOverlayPerm] = useState(false);

  const checkPermissions = async () => {
    try {
      console.log('[checkPermissions] Starting permission check...');
      const camCheck = await mrpmModule.checkCameraPermission();
      const locCheck = await mrpmModule.checkLocationPermission();
      const admin = await mrpmModule.isDeviceAdminEnabled();
      const overlayCheck = await mrpmModule.checkOverlayPermission();

      console.log('[checkPermissions] Permission results:', {
        admin,
        camGranted: camCheck,
        locGranted: locCheck,
        overlayGranted: overlayCheck
      });
      setIsDeviceAdminEnabled(admin);
      setHasCameraPerm(camCheck);
      setHasLocationPerm(locCheck);
      setHasOverlayPerm(overlayCheck);
      console.log('[checkPermissions] Permission states updated');
    } catch (e) {
      console.error('[checkPermissions] Failed to check permissions:', e);
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Security Shield...</Text>
      </View>
    );
  }

  const allPermsGranted = hasCameraPerm && hasLocationPerm && hasOverlayPerm && isDeviceAdminEnabled;

  return (
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
          trackColor={{false: '#334155', true: '#059669'}}
          thumbColor={settings.isMonitoringEnabled ? '#10b981' : '#94a3b8'}
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
          onPress={async () => {
            await mrpmModule.openAppSettings();
          }}>
          <Text style={styles.managePermissionsButtonText}>🔒 Manage All Permissions</Text>
          <Text style={styles.managePermissionsButtonSubtitle}>
            View full permissions details, app purpose, and grant instructions
          </Text>
        </TouchableOpacity>

        {!allPermsGranted && (
          <TouchableOpacity
            style={styles.grantAllButton}
            onPress={async () => {
              if (!hasCameraPerm) {
                const cam = await requestCameraPermissionNative();
                setHasCameraPerm(cam);
              }
              if (!hasLocationPerm) {
                const loc = await requestLocationPermissionNative();
                setHasLocationPerm(loc);
              }
              if (!hasOverlayPerm) {
                await mrpmModule.requestOverlayPermission();
              }
              const admin = await mrpmModule.isDeviceAdminEnabled();
              if (!admin) {
                await mrpmModule.requestDeviceAdminEnable();
              }
              setTimeout(checkPermissions, 1000);
            }}>
            <Text style={styles.grantAllButtonText}>⚠️ Grant Required Permissions</Text>
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
          <Switch
            value={hasCameraPerm}
            onValueChange={async (val) => {
              console.log('[Toggle] Camera toggle clicked:', val);

              if (val) {
                // User wants to turn ON - ALWAYS request permission dialog
                console.log('[Toggle] Requesting camera permission via PermissionsAndroid...');

                try {
                  console.log('[Toggle] Calling PermissionsAndroid.request...');
                  const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    {
                      title: 'Camera Access Required',
                      message: 'MRP requires camera access to capture intruder selfies during security events.',
                      buttonPositive: 'Allow',
                      buttonNegative: 'Deny',
                    }
                  );
                  console.log('[Toggle] Camera permission result:', granted);

                  // Check if permission was granted or denied
                  const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
                  console.log('[Toggle] Setting hasCameraPerm to:', isGranted);
                  setHasCameraPerm(isGranted);

                  if (!isGranted) {
                    console.log('[Toggle] Permission denied, showing alert with manual steps');
                    Alert.alert(
                      'Permission Denied - How to Enable',
                      `Camera permission is required to enable this feature.\n\nTo grant this permission:\n\n1. Go to: Settings → Apps → MRP\n2. Tap on "Permissions"\n3. Enable "Camera"\n\nOr click "Open Settings" below to go directly.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Open Settings',
                          onPress: async () => {
                            await mrpmModule.openAppSettings();
                          }
                        }
                      ]
                    );
                  } else {
                    console.log('[Toggle] Permission granted');
                  }
                } catch (err) {
                  console.error('[Toggle] Error requesting camera permission:', err);
                  Alert.alert(
                    'Error',
                    'Failed to request camera permission: ' + String(err)
                  );
                  // Set to false on error
                  setHasCameraPerm(false);
                }
              } else {
                // User wants to turn OFF - ask for confirmation
                console.log('[Toggle] Toggle turning OFF, asking confirmation...');
                Alert.alert(
                  'Disable Camera Access',
                  'Camera access will be disabled. Would you like to confirm?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disable',
                      style: 'destructive',
                      onPress: () => {
                        console.log('[Toggle] User confirmed disabling camera');
                        setHasCameraPerm(false);
                      }
                    }
                  ]
                );
              }
            }}
            trackColor={{false: '#334155', true: '#059669'}}
            thumbColor={hasCameraPerm ? '#10b981' : '#94a3b8'}
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
          <Switch
            value={hasLocationPerm}
            onValueChange={async (val) => {
              console.log('[Toggle] Location toggle clicked:', val);

              if (val) {
                // User wants to turn ON - ALWAYS request permission dialog
                console.log('[Toggle] Requesting location permission via PermissionsAndroid...');

                try {
                  console.log('[Toggle] Calling PermissionsAndroid.request...');
                  const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    {
                      title: 'Location Access Required',
                      message: 'MRP requires location access to log GPS coordinates and addresses for security events.',
                      buttonPositive: 'Allow',
                      buttonNegative: 'Deny',
                    }
                  );
                  console.log('[Toggle] Location permission result:', granted);

                  // Check if permission was granted or denied
                  const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
                  console.log('[Toggle] Setting hasLocationPerm to:', isGranted);
                  setHasLocationPerm(isGranted);

                  if (!isGranted) {
                    console.log('[Toggle] Permission denied, showing alert with manual steps');
                    Alert.alert(
                      'Permission Denied - How to Enable',
                      `Location permission is required to enable this feature.\n\nTo grant this permission:\n\n1. Go to: Settings → Apps → MRP\n2. Tap on "Permissions"\n3. Enable "Location"\n4. Select "Allow all the time"\n\nOr click "Open Settings" below to go directly.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Open Settings',
                          onPress: async () => {
                            await mrpmModule.openAppSettings();
                          }
                        }
                      ]
                    );
                  } else {
                    console.log('[Toggle] Permission granted');
                  }
                } catch (err) {
                  console.error('[Toggle] Error requesting location permission:', err);
                  Alert.alert(
                    'Error',
                    'Failed to request location permission: ' + String(err)
                  );
                  // Set to false on error
                  setHasLocationPerm(false);
                }
              } else {
                // User wants to turn OFF - ask for confirmation
                console.log('[Toggle] Toggle turning OFF, asking confirmation...');
                Alert.alert(
                  'Disable Location Access',
                  'Location access will be disabled. Would you like to confirm?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disable',
                      style: 'destructive',
                      onPress: () => {
                        console.log('[Toggle] User confirmed disabling location');
                        setHasLocationPerm(false);
                      }
                    }
                  ]
                );
              }
            }}
            trackColor={{false: '#334155', true: '#059669'}}
            thumbColor={hasLocationPerm ? '#10b981' : '#94a3b8'}
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

        <SettingItem
          icon="🔐"
          title="Device Admin Access"
          subtitle="Detect wrong password & biometric unlock"
          value={isDeviceAdminEnabled}
          isLast={true}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '600',
  },
  masterBanner: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
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
    color: '#f8fafc',
  },
  bannerStatus: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
  },
  grantAllButton: {
    backgroundColor: '#b91c1c',
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
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  managePermissionsButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  managePermissionsButtonSubtitle: {
    color: '#93c5fd',
    fontSize: 11,
    textAlign: 'center',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0f172a',
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
    color: '#f1f5f9',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
});
