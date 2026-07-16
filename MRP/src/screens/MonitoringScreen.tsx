import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {useMrpMonitoring} from '../hooks/useMrpMonitoring';
import MrpNative from '../native/MrpNative.types';

interface Props {
  onLogout: () => void;
}

export function MonitoringScreen({onLogout}: Props) {
  const {
    isMonitoring,
    photos,
    isLoading,
    error,
    startMonitoring,
    stopMonitoring,
    deletePhoto,
    takePhoto,
    refreshPhotos,
  } = useMrpMonitoring();

  const [isAccessibilityEnabled, setIsAccessibilityEnabled] = useState(false);

  const checkAccessibility = async () => {
    try {
      const enabled = await MrpNative.isAccessibilityEnabled();
      setIsAccessibilityEnabled(enabled);
    } catch (e) {
      setIsAccessibilityEnabled(false);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        // Use PermissionsAndroid.request() to show the dialog
        console.log('[PIN Screen] Requesting camera permission...');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Access Required',
            message: 'MRP requires camera access to capture intruder selfies during security events.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        console.log('[PIN Screen] Camera permission result:', granted);
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        console.log('[PIN Screen] Permission granted:', isGranted);
        return isGranted;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        // Use native module to show the dialog (this works in Bridgeless mode)
        console.log('[PIN Screen] Requesting location permission...');
        await MrpNative.requestLocationPermission();
        console.log('[PIN Screen] Location permission request initiated');
        // Return true as permission dialog was shown
        return true;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleEnableAccessibility = async () => {
    try {
      await MrpNative.requestAccessibilityEnable();
    } catch (e) {
      console.error('Failed to open accessibility settings:', e);
    }
  };

  const handleOpenSettings = () => {
    MrpNative.openAppSettings();
  };

  const handleStartMonitoring = async () => {
    // Note: Accessibility is not required - MrpMonitorService uses BroadcastReceivers
    console.log('[PIN Screen] Requesting both camera and location permissions...');
    const hasCameraPermission = await requestCameraPermission();
    const hasLocationPermission = await requestLocationPermission();

    if (!hasCameraPermission || !hasLocationPermission) {
      Alert.alert(
        'Permission Denied',
        'Camera and/or location permissions were denied.\n\n' +
        'Please go to Settings > Apps > MRP > Permissions and grant both permissions, ' +
        'then try starting monitoring again.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Let user navigate to settings
            }
          }
        ]
      );
      return;
    }

    console.log('[PIN Screen] Starting monitoring with both permissions granted...');
    await startMonitoring();
  };

  const handleDeletePhoto = (path: string, name: string) => {
    Alert.alert(
      'Delete Photo',
      `Are you sure you want to delete ${name}?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePhoto(path),
        },
      ],
    );
  };

  const handleTakePhoto = () => {
    takePhoto();
    Alert.alert('Capture Triggered', 'Front camera selfie capture has been triggered.');
  };

  useEffect(() => {
    checkAccessibility();
    const interval = setInterval(checkAccessibility, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refreshPhotos} />
      }>
      <View style={styles.header}>
        <Text style={styles.title}>MRP</Text>
        <Text style={styles.subtitle}>Mobile Relocation Provider</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Monitoring:</Text>
            <Text
              style={[
                styles.statusValue,
                isMonitoring ? styles.statusActive : styles.statusInactive,
              ]}>
              {isMonitoring ? 'Active' : 'Inactive'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Accessibility:</Text>
            <Text
              style={[
                styles.statusValue,
                isAccessibilityEnabled
                  ? styles.statusActive
                  : styles.statusInactive,
              ]}>
              {isAccessibilityEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Photos:</Text>
            <Text style={styles.statusValue}>{photos.length}</Text>
          </View>
        </View>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Controls</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.button,
              isMonitoring ? styles.buttonStop : styles.buttonStart,
            ]}
            onPress={isMonitoring ? stopMonitoring : handleStartMonitoring}>
            <Text style={styles.buttonText}>
              {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleEnableAccessibility}>
            <Text style={styles.buttonSecondaryText}>Enable Accessibility</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleTakePhoto}>
            <Text style={styles.buttonSecondaryText}>Test Photo Capture</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isAccessibilityEnabled && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            Please enable the Accessibility Service for MRP to detect lock/unlock
            events.
          </Text>
          <TouchableOpacity
            style={styles.warningButton}
            onPress={handleEnableAccessibility}>
            <Text style={styles.warningButtonText}>Enable Now</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Captured Photos</Text>
          <TouchableOpacity onPress={refreshPhotos}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {photos.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No photos captured yet</Text>
            <Text style={styles.emptySubtext}>
              Start monitoring and unlock your device to capture photos
            </Text>
          </View>
        ) : (
          photos.map(photo => (
            <View key={photo.path} style={styles.photoCard}>
              <Image
                source={{uri: `file://${photo.path}`}}
                style={styles.photoImage}
                resizeMode="cover"
              />
              <View style={styles.photoInfo}>
                <Text style={styles.photoName}>{photo.name}</Text>
                <Text style={styles.photoDate}>{formatDate(photo.timestamp)}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeletePhoto(photo.path, photo.name)}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutText}>Lock App</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4a90d9',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  statusCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#888',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusActive: {
    color: '#4ade80',
  },
  statusInactive: {
    color: '#888',
  },
  errorCard: {
    backgroundColor: '#ff6b6b20',
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
  },
  buttonRow: {
    marginBottom: 12,
  },
  button: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#4ade80',
  },
  buttonStop: {
    backgroundColor: '#ff6b6b',
  },
  buttonSecondary: {
    height: 48,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: '#4a90d9',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#f59e0b20',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 14,
    lineHeight: 20,
  },
  warningButton: {
    marginTop: 12,
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  warningButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  refreshText: {
    color: '#4a90d9',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  photoCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#444',
  },
  photoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  photoName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  photoDate: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ff6b6b30',
    borderRadius: 6,
  },
  deleteButtonText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    margin: 16,
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: '#888',
    fontSize: 16,
  },
});