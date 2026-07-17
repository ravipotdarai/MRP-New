import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import {MrpNative} from '../native/MrpNative.types';

interface PermissionDetail {
  name: string;
  icon: string;
  description: string;
  granted: boolean;
  grantSteps: string[];
}

export function PermissionsScreen() {
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [overlayPermission, setOverlayPermission] = useState<boolean | null>(null);
  const [deviceAdminPermission, setDeviceAdminPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      console.log('[PermissionsScreen] Checking permissions...');
      const cam = await MrpNative.checkCameraPermission();
      const loc = await MrpNative.checkLocationPermission();
      const overlay = await MrpNative.checkOverlayPermission();
      const admin = await MrpNative.isDeviceAdminEnabled();

      console.log('[PermissionsScreen] Permission results:', {
        camera: cam,
        location: loc,
        overlay: overlay,
        admin: admin
      });

      setCameraPermission(cam);
      setLocationPermission(loc);
      setOverlayPermission(overlay);
      setDeviceAdminPermission(admin);
    } catch (e) {
      console.error('[PermissionsScreen] Failed to check permissions:', e);
      Alert.alert('Error', 'Failed to check permissions: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const openAppSettings = () => {
    MrpNative.openAppSettings();
  };

  const requestDeviceAdmin = async () => {
    try {
      await MrpNative.requestDeviceAdminEnable();
    } catch (e) {
      console.error('[PermissionsScreen] Error requesting device admin:', e);
    }
  };

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
    },
    {
      name: 'Accessibility Service',
      icon: '♿',
      description: 'Required to detect screen lock/unlock events, app usage, and background activity. The service runs in the background to monitor security events.',
      granted: true, // We already check this in monitoring screen
      grantSteps: [
        'Go to: Settings → Accessibility',
        'Tap on "Manage accessibility services"',
        'Enable "MRP" in the list',
      ],
    },
    {
      name: 'Usage Stats Access',
      icon: '📊',
      description: 'Required to track which apps are open on your phone during security events. This helps identify which apps were in use when suspicious activity occurred.',
      granted: true, // Always granted in monitoring screen
      grantSteps: [
        'Go to: Settings → Apps → Special access → Usage access',
        'Find "MRP" in the list',
        'Enable "MRP"',
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Required Permissions</Text>
        <Text style={styles.headerSubtitle}>MRP Stay Sync.. Stay Connected</Text>
      </View>

      {/* Permissions List */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>All Permissions</Text>

        {permissions.map((perm, index) => (
          <View key={index} style={styles.permissionItem}>
            <View style={styles.permissionIconBox}>
              <Text style={styles.permissionIcon}>{perm.icon}</Text>
            </View>

            <View style={styles.permissionTextContainer}>
              <Text style={styles.permissionName}>{perm.name}</Text>
              <Text style={styles.permissionDescription} numberOfLines={3}>
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
                    onPress={openAppSettings}>
                    <Text style={styles.openSettingsButtonText}>Open Settings</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 12,
  },
  permissionItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  permissionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0f172a',
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
    color: '#f1f5f9',
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 8,
  },
  grantedStatus: {
    marginBottom: 8,
  },
  grantedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  grantedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  deniedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deniedText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  manualGrantSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  manualGrantTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
  },
  stepText: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 4,
  },
  openSettingsButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  openSettingsButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  instructionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  instructionDescription: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 8,
  },
  instructionSteps: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 8,
  },
  requestButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  requestButtonText: {
    color: '#ffffff',
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
    color: '#f8fafc',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
});
