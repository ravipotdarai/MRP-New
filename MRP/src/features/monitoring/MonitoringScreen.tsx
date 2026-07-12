import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, Switch, Alert, PermissionsAndroid, Platform} from 'react-native';
import {Card} from '../../shared/components/Card';
import {Button} from '../../shared/components/Button';
import {useSettings} from '../../shared/hooks/useSettings';
import mrpmModule from '../../shared/hooks/useNativeBridge';

const requestCameraPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Permission',
        message: 'MRP needs camera access to capture photos during security events.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Camera permission error:', err);
    return false;
  }
};

const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'MRP needs location access to log geo-coordinates and addresses for security timeline events.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Location permission error:', err);
    return false;
  }
};

export function MonitoringScreen() {
  const {settings, toggleMonitoring, updateSetting} = useSettings();
  const [isDeviceAdminEnabled, setIsDeviceAdminEnabled] = useState(false);
  const [isAccessibilityEnabled, setIsAccessibilityEnabled] = useState(false);
  const [hasCameraPerm, setHasCameraPerm] = useState(false);
  const [hasLocationPerm, setHasLocationPerm] = useState(false);

  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkPermissions = async () => {
    try {
      const [admin, accessibility, camGranted, locGranted] = await Promise.all([
        mrpmModule.isDeviceAdminEnabled(),
        mrpmModule.isAccessibilityEnabled(),
        Platform.OS === 'android' ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA) : Promise.resolve(true),
        Platform.OS === 'android' ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) : Promise.resolve(true),
      ]);
      setIsDeviceAdminEnabled(admin);
      setIsAccessibilityEnabled(accessibility);
      setHasCameraPerm(camGranted);
      setHasLocationPerm(locGranted);
    } catch (e) {
      console.error('Failed to check permissions:', e);
    }
  };

  const handleToggleMonitoring = async () => {
    if (!settings.isMonitoringEnabled) {
      // First ask for location permission for geo-location + address + geofence
      await requestLocationPermission();

      // Then ask for camera permission for intruder selfie capture
      const hasCameraPermission = await requestCameraPermission();
      if (!hasCameraPermission) {
        Alert.alert(
          'Camera Permission Optional',
          'Camera permission was not granted. MRP will continue monitoring and logging timeline events with location & address, but selfie capture will be disabled.',
          [{text: 'Continue', onPress: () => toggleMonitoring()}]
        );
        return;
      }
    }
    toggleMonitoring();
  };

  return (
    <ScrollView style={styles.container}>
      <Card title="Monitoring Control">
        <View style={styles.row}>
          <Text style={styles.label}>Enable Monitoring</Text>
          <Switch
            value={settings.isMonitoringEnabled}
            onValueChange={handleToggleMonitoring}
            trackColor={{false: '#767577', true: '#81C784'}}
            thumbColor={settings.isMonitoringEnabled ? '#4CAF50' : '#f4f3f4'}
          />
        </View>
        <Text style={styles.description}>
          {settings.isMonitoringEnabled
            ? 'MRP is actively monitoring your device'
            : 'Monitoring is paused'}
        </Text>
      </Card>

      <Card title="Permissions Status">
        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Camera Access:</Text>
          <Text style={[styles.permissionStatus, hasCameraPerm ? styles.enabled : styles.disabled]}>
            {hasCameraPerm ? '✓ Granted' : '✗ Optional / Not Granted'}
          </Text>
        </View>
        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Location Access:</Text>
          <Text style={[styles.permissionStatus, hasLocationPerm ? styles.enabled : styles.disabled]}>
            {hasLocationPerm ? '✓ Granted' : '✗ Not Granted'}
          </Text>
        </View>
        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Device Admin:</Text>
          <Text style={[styles.permissionStatus, isDeviceAdminEnabled ? styles.enabled : styles.disabled]}>
            {isDeviceAdminEnabled ? '✓ Enabled' : '✗ Not Enabled'}
          </Text>
        </View>
        <View style={styles.permissionRow}>
          <Text style={styles.permissionLabel}>Accessibility:</Text>
          <Text style={[styles.permissionStatus, isAccessibilityEnabled ? styles.enabled : styles.disabled]}>
            {isAccessibilityEnabled ? '✓ Enabled' : '✗ Not Enabled'}
          </Text>
        </View>
      </Card>

      <Card title="Security Events">
        <ToggleRow
          label="Wrong Unlock Attempt"
          value={settings.captureOnWrongUnlock}
          onValueChange={v => updateSetting('captureOnWrongUnlock', v)}
        />
        <ToggleRow
          label="Factory Reset Attempt"
          value={settings.captureOnFactoryReset}
          onValueChange={v => updateSetting('captureOnFactoryReset', v)}
        />
      </Card>

      <Card title="Network Events">
        <ToggleRow
          label="Airplane Mode Toggle"
          value={settings.captureOnAirplaneMode}
          onValueChange={v => updateSetting('captureOnAirplaneMode', v)}
        />
        <ToggleRow
          label="Wi-Fi Toggle"
          value={settings.captureOnWifiToggle}
          onValueChange={v => updateSetting('captureOnWifiToggle', v)}
        />
        <ToggleRow
          label="Mobile Data Toggle"
          value={settings.captureOnMobileData}
          onValueChange={v => updateSetting('captureOnMobileData', v)}
        />
        <ToggleRow
          label="Hotspot Toggle"
          value={settings.captureOnHotspot}
          onValueChange={v => updateSetting('captureOnHotspot', v)}
        />
      </Card>

      <Card title="SIM & USB Events">
        <ToggleRow
          label="SIM Card Changes"
          value={settings.captureOnSimChange}
          onValueChange={v => updateSetting('captureOnSimChange', v)}
        />
        <ToggleRow
          label="USB Connection"
          value={settings.captureOnUsb}
          onValueChange={v => updateSetting('captureOnUsb', v)}
        />
      </Card>

      <Card title="Device Admin">
        <Text style={styles.adminText}>
          Enable Device Admin for wrong password detection
        </Text>
        <Button
          title="Enable Device Admin"
          onPress={() => mrpmModule.requestDeviceAdminEnable()}
          variant="secondary"
        />
      </Card>

      <Card title="Accessibility Service">
        <Text style={styles.adminText}>
          Enable Accessibility Service for lock/unlock detection
        </Text>
        <Button
          title="Enable Accessibility"
          onPress={() => mrpmModule.requestAccessibilityEnable()}
          variant="secondary"
        />
      </Card>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{false: '#767577', true: '#81C784'}}
        thumbColor={value ? '#4CAF50' : '#f4f3f4'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  description: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  permissionLabel: {
    fontSize: 14,
    color: '#424242',
  },
  permissionStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  enabled: {
    color: '#4CAF50',
  },
  disabled: {
    color: '#F44336',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  toggleLabel: {
    fontSize: 16,
    color: '#424242',
  },
  adminText: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 12,
  },
  bottomPadding: {
    height: 40,
  },
});