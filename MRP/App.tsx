import React, {useState} from 'react';
import {StatusBar, View, ActivityIndicator, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {PinLockScreen} from './src/screens/PinLockScreen';
import {usePinLock} from './src/hooks/usePinLock';
import {HomeScreen} from './src/features/home/HomeScreen';
import {SecurityScreen} from './src/features/security/SecurityScreen';
import {AppUsageScreen} from './src/features/app-usage/AppUsageScreen';
import {HubScreen} from './src/features/hub/HubScreen';
import {RecoveryCodeSetupModal} from './src/features/auth/RecoveryCodeSetupModal';
import {ForgotPinScreen} from './src/features/auth/ForgotPinScreen';
import {AuthProvider} from './src/services/auth/AuthContext';
import {EntitlementProvider} from './src/services/entitlements/EntitlementProvider';
import PinLock from './src/native/PinLock.types';
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
        name="Hub"
        options={{
          tabBarIcon: ({color}) => <Text style={{fontSize: 20}}>⚙️</Text>,
        }}>
        {({navigation, route}) => <HubScreen navigation={navigation} route={route} />}
      </Tab.Screen>
      <Tab.Screen
        name="App Usage"
        component={AppUsageScreen}
        options={{
          tabBarIcon: ({color}) => <Text style={{fontSize: 20}}>📊</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent(): React.JSX.Element {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const {isPinSet, isVerifying, error, setPin, verifyPin, recheckPin} = usePinLock();
  const {colors, themeId} = useTheme();
  const isLight = themeId === 'light';

  // Auto permission wizard on launch disabled — users grant from Security → Monitoring.
  // To restore: set AUTO_SHOW_PERMISSION_WIZARD_ON_LAUNCH=true in permissionUxFlags.ts
  // and re-add the previous useEffect + <PermissionSetupWizard /> here.

  const handlePinSet = async (pin: string) => {
    const success = await setPin(pin);
    if (!success) return;

    try {
      const acknowledged = await PinLock.hasRecoveryCodeAcknowledged();
      if (acknowledged) {
        setIsUnlocked(true);
        return;
      }
      const phrase = await PinLock.generateRecoveryCode();
      await PinLock.saveRecoveryCode(phrase);
      setRecoveryCode(phrase);
      setShowRecoveryModal(true);
    } catch (e) {
      console.warn('[PIN] recovery setup failed', e);
      setIsUnlocked(true);
    }
  };

  const handleRecoveryConfirmed = async () => {
    try {
      await PinLock.setRecoveryCodeAcknowledged(true);
    } catch (e) {
      console.warn('[PIN] recovery ack failed', e);
    }
    setShowRecoveryModal(false);
    setRecoveryCode(null);
    setIsUnlocked(true);
  };

  const handlePinReset = async () => {
    setShowForgotPin(false);
    await recheckPin();
    setIsUnlocked(false);
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

  if (showForgotPin) {
    return (
      <View style={shellStyle}>
        <StatusBar
          barStyle={isLight ? 'dark-content' : 'light-content'}
          backgroundColor={colors.bg}
        />
        <ForgotPinScreen onBack={() => setShowForgotPin(false)} onPinReset={handlePinReset} />
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
        onForgotPin={() => setShowForgotPin(true)}
        isLoading={isVerifying}
        error={error}
      />
      {recoveryCode ? (
        <RecoveryCodeSetupModal
          visible={showRecoveryModal}
          recoveryCode={recoveryCode}
          onConfirm={handleRecoveryConfirmed}
        />
      ) : null}
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <EntitlementProvider>
          <AppContent />
        </EntitlementProvider>
      </AuthProvider>
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
