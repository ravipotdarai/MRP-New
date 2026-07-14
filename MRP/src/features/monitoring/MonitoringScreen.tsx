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

const requestCameraPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Permission Required',
        message: 'MRP needs camera access to capture front-facing photos during unauthorized unlock attempts.',
        buttonNeutral: 'Ask Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'Allow',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    return false;
  }
};

const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission Required',
        message: 'MRP needs GPS location access to record accurate coordinates and addresses for security alerts.',
        buttonNeutral: 'Ask Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'Allow',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
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
        onValueChange={onValueChange}
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
      const [admin, camGranted, locGranted, overlayGranted] = await Promise.all([
        mrpmModule.isDeviceAdminEnabled(),
        Platform.OS === 'android'
          ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
          : Promise.resolve(true),
        Platform.OS === 'android'
          ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
          : Promise.resolve(true),
        Platform.OS === 'android'
          ? mrpmModule.checkOverlayPermission()
          : Promise.resolve(true),
      ]);
      setIsDeviceAdminEnabled(admin);
      setHasCameraPerm(camGranted);
      setHasLocationPerm(locGranted);
      setHasOverlayPerm(overlayGranted);
    } catch (e) {
      console.warn('Failed to check permissions:', e);
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

        {!allPermsGranted && (
          <TouchableOpacity
            style={styles.grantAllButton}
            onPress={async () => {
              if (!hasCameraPerm) {
                const cam = await requestCameraPermission();
                setHasCameraPerm(cam);
              }
              if (!hasLocationPerm) {
                const loc = await requestLocationPermission();
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

        <SettingItem
          icon="📷"
          title="Camera Access"
          subtitle="Capture intruder selfie on security event"
          value={hasCameraPerm}
          onValueChange={async val => {
            if (val) {
              const granted = await requestCameraPermission();
              setHasCameraPerm(granted);
            } else {
              Alert.alert(
                'Manage Camera',
                'Disable Camera permission in Android App Settings.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {text: 'Open Settings', onPress: () => mrpmModule.openAppSettings()},
                ],
              );
            }
          }}
        />

        <SettingItem
          icon="📍"
          title="Location Access"
          subtitle="Record GPS coordinates & exact address"
          value={hasLocationPerm}
          onValueChange={async val => {
            if (val) {
              const granted = await requestLocationPermission();
              setHasLocationPerm(granted);
            } else {
              Alert.alert(
                'Manage Location',
                'Disable Location permission in Android App Settings.',
                [
                  {text: 'Cancel', style: 'cancel'},
                  {text: 'Open Settings', onPress: () => mrpmModule.openAppSettings()},
                ],
              );
            }
          }}
        />

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
                  {text: 'Open Settings', onPress: () => mrpmModule.openAppSettings()},
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
          <Text style={styles.sectionTitle}>SURVEILLANCE & EVENT TRIGGERS</Text>
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
