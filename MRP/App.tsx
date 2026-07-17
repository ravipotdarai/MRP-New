import React, {useState, useEffect} from 'react';
import {StatusBar, View, ActivityIndicator, StyleSheet, PermissionsAndroid, Platform} from 'react-native';
import mrpmModule from './src/shared/hooks/useNativeBridge';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {PinLockScreen} from './src/screens/PinLockScreen';
import {usePinLock} from './src/hooks/usePinLock';
import {MonitoringScreen} from './src/features/monitoring/MonitoringScreen';
import {TimelineScreen} from './src/features/graph/TimelineScreen';
import {PhotoGallery} from './src/features/photos/PhotoGallery';
import {AppUsageScreen} from './src/features/app-usage/AppUsageScreen';
import {PermissionsScreen} from './src/screens/PermissionsScreen';
import {AboutScreen} from './src/screens/AboutScreen';
import {Text} from 'react-native';

const Tab = createBottomTabNavigator();

function TabNavigator({onLogout}: {onLogout: () => void}) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: 'rgba(255, 255, 255, 0.08)',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: {fontSize: 12, fontWeight: '600'},
      }}>
      <Tab.Screen
        name="Monitoring"
        component={MonitoringScreen}
        options={{
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20}}>🛡️</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20}}>📋</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Photos"
        component={PhotoGallery}
        options={{
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20}}>📷</Text>
          ),
        }}
      />
      <Tab.Screen
        name="App Usage"
        component={AppUsageScreen}
        options={{
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20}}>📊</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Permissions"
        component={PermissionsScreen}
        options={{
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20}}>🔒</Text>
          ),
        }}
      />
      <Tab.Screen
        name="About"
        component={AboutScreen}
        options={{
          tabBarIcon: ({color}) => (
            <Text style={{fontSize: 20}}>ℹ️</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function App(): React.JSX.Element {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const {isPinSet, isVerifying, error, setPin, verifyPin} = usePinLock();

  useEffect(() => {
    const setupInitialPermissions = async () => {
      if (Platform.OS !== 'android') return;
      try {
        // 1. Request Location Permission
        const hasLocation = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (!hasLocation) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Access Required',
              message: 'MRP requires location access to log GPS coordinates and addresses for security events.',
              buttonPositive: 'Allow',
            }
          );
        }

        // 2. Request Camera Permission
        const hasCamera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (!hasCamera) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Access Required',
              message: 'MRP requires camera access to capture intruder selfies during unauthorized unlock attempts.',
              buttonPositive: 'Allow',
            }
          );
        }

        // 3. Request Notification Permission (Android 13+)
        if (Platform.Version >= 33) {
          const hasNotif = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          if (!hasNotif) {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              {
                title: 'Notification Permission',
                message: 'MRP requires notification access to run its background security service.',
                buttonPositive: 'Allow',
              }
            );
          }
        }

        // 4. Request Device Admin Access
        const isAdmin = await mrpmModule.isDeviceAdminEnabled();
        if (!isAdmin) {
          await mrpmModule.requestDeviceAdminEnable();
        }
      } catch (e) {
        console.warn('Error requesting initial permissions:', e);
      }
    };

    setupInitialPermissions();
  }, []);

  const handlePinSet = async (pin: string) => {
    const success = await setPin(pin);
    if (success) {
      setIsUnlocked(true);
    }
  };

  const handlePinVerify = async (pin: string) => {
    const isValid = await verifyPin(pin);
    if (isValid) {
      setIsUnlocked(true);
    }
  };

  const handleLogout = () => {
    setIsUnlocked(false);
  };

  // Loading state while checking PIN
  if (isPinSet === null) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  // If unlocked and PIN is set, show main app with tabs
  if (isUnlocked && isPinSet) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <NavigationContainer>
          <TabNavigator onLogout={handleLogout} />
        </NavigationContainer>
      </View>
    );
  }

  // Show PIN lock screen (either setup or verify mode)
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <PinLockScreen
        isSetup={!isPinSet}
        onPinSet={handlePinSet}
        onPinVerify={handlePinVerify}
        isLoading={isVerifying}
        error={error}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;