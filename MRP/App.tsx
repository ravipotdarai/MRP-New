import React, {useState, useEffect} from 'react';
import {StatusBar, View, ActivityIndicator, StyleSheet, PermissionsAndroid, Platform} from 'react-native';
import mrpmModule from './src/shared/hooks/useNativeBridge';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {PinLockScreen} from './src/screens/PinLockScreen';
import {usePinLock} from './src/hooks/usePinLock';
import {HomeScreen} from './src/features/home/HomeScreen';
import {SecurityScreen} from './src/features/security/SecurityScreen';
import {AppUsageScreen} from './src/features/app-usage/AppUsageScreen';
import {AboutScreen} from './src/screens/AboutScreen';
import {Text} from 'react-native';
import {ThemeProvider, useTheme} from './src/shared/ThemeContext';

const Tab = createBottomTabNavigator();

function TabNavigator({onLogout}: {onLogout: () => void}) {
  const {colors} = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderSoft,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.sky,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {fontSize: 12, fontWeight: '600'},
      }}>
      <Tab.Screen
        name="Home"
        options={{
          tabBarIcon: ({color}) => <Text style={{fontSize: 20}}>🏠</Text>,
        }}>
        {({navigation}) => <HomeScreen navigation={navigation} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen
        name="Security"
        component={SecurityScreen}
        options={{
          tabBarIcon: ({color}) => <Text style={{fontSize: 20}}>🛡️</Text>,
        }}
      />
      <Tab.Screen
        name="App Usage"
        component={AppUsageScreen}
        options={{
          tabBarIcon: ({color}) => <Text style={{fontSize: 20}}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="About"
        component={AboutScreen}
        options={{
          tabBarIcon: ({color}) => <Text style={{fontSize: 20}}>ℹ️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent(): React.JSX.Element {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const {isPinSet, isVerifying, error, setPin, verifyPin} = usePinLock();
  const {colors, themeId} = useTheme();
  const isLight = themeId === 'light';

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

  const shellStyle = {flex: 1 as const, backgroundColor: colors.bg};

  // Loading state while checking PIN
  if (isPinSet === null) {
    return (
      <View style={[shellStyle, styles.centered]}>
        <StatusBar
          barStyle={isLight ? 'dark-content' : 'light-content'}
          backgroundColor={colors.bg}
        />
        <ActivityIndicator size="large" color={colors.sky} />
      </View>
    );
  }

  // If unlocked and PIN is set, show main app with tabs
  if (isUnlocked && isPinSet) {
    return (
      <View style={shellStyle}>
        <StatusBar
          barStyle={isLight ? 'dark-content' : 'light-content'}
          backgroundColor={colors.bg}
        />
        <NavigationContainer>
          <TabNavigator onLogout={handleLogout} />
        </NavigationContainer>
      </View>
    );
  }

  // Show PIN lock screen (either setup or verify mode)
  return (
    <View style={shellStyle}>
      <StatusBar
        barStyle={isLight ? 'dark-content' : 'light-content'}
        backgroundColor={colors.bg}
      />
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

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
