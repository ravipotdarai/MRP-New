import React, {useState, useEffect} from 'react';
import {StatusBar, View, ActivityIndicator, StyleSheet, Platform} from 'react-native';
import mrpmModule from './src/shared/hooks/useNativeBridge';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {PinLockScreen} from './src/screens/PinLockScreen';
import {usePinLock} from './src/hooks/usePinLock';
import {HomeScreen} from './src/features/home/HomeScreen';
import {SecurityScreen} from './src/features/security/SecurityScreen';
import {AppUsageScreen} from './src/features/app-usage/AppUsageScreen';
import {AboutScreen} from './src/screens/AboutScreen';
import {PermissionSetupWizard} from './src/features/setup/PermissionSetupWizard';
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
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const {isPinSet, isVerifying, error, setPin, verifyPin} = usePinLock();
  const {colors, themeId} = useTheme();
  const isLight = themeId === 'light';

  useEffect(() => {
    if (!isUnlocked || !isPinSet || Platform.OS !== 'android') return;
    (async () => {
      try {
        const bridge = mrpmModule as any;
        if (typeof bridge.getPermissionSetupStatus !== 'function') return;
        const st = await bridge.getPermissionSetupStatus();
        if (st?.coreComplete) {
          setShowSetupWizard(false);
          return;
        }
        // Do not spam on every launch if user already tapped Finish later
        let dismissed = false;
        if (typeof bridge.isPermissionWizardDismissed === 'function') {
          dismissed = !!(await bridge.isPermissionWizardDismissed());
        }
        if (!dismissed) setShowSetupWizard(true);
      } catch {
        // ignore
      }
    })();
  }, [isUnlocked, isPinSet]);

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
        <PermissionSetupWizard
          visible={showSetupWizard}
          onClose={() => setShowSetupWizard(false)}
          onComplete={() => setShowSetupWizard(false)}
        />
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
