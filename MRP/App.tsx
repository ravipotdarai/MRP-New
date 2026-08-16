import React, {useEffect, useState} from 'react';
import {StatusBar, View, ActivityIndicator, StyleSheet, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {PinLockScreen} from './src/screens/PinLockScreen';
import {usePinLock} from './src/hooks/usePinLock';
import {HomeScreen} from './src/features/home/HomeScreen';
import {SecurityScreen} from './src/features/security/SecurityScreen';
import {AppUsageScreen} from './src/features/app-usage/AppUsageScreen';
import {HubScreen} from './src/features/hub/HubScreen';
import {DigitalSafetyTabScreen} from './src/features/digital-safety/DigitalSafetyTabScreen';
import {RecoveryCodeSetupModal} from './src/features/auth/RecoveryCodeSetupModal';
import {ForgotPinScreen} from './src/features/auth/ForgotPinScreen';
import {AuthProvider} from './src/services/auth/AuthContext';
import {EntitlementProvider} from './src/services/entitlements/EntitlementProvider';
import PinLock from './src/native/PinLock.types';
import {ThemeProvider, useTheme} from './src/shared/ThemeContext';
import {brandColors} from './src/shared/theme';
import {BrandLockup, BrandWave} from './src/shared/components/BrandLockup';
import {
  pullRemoteTrackingConfig,
  startDevicePresence,
} from './src/native/DeviceTracking.types';
import {registerFcmForCircleInvites} from './src/native/MrpFcm.types';
import {useCircleInviteDeepLink} from './src/features/circle/useCircleInviteDeepLink';
import {useSafeLinkShareDeepLink} from './src/features/digital-safety/useSafeLinkShareDeepLink';
import {useClipboardUrlScan} from './src/features/digital-safety/useClipboardUrlScan';
import {useBreachEmailMonitor} from './src/features/digital-safety/useBreachEmailMonitor';
import {useEntitlements} from './src/services/entitlements/EntitlementProvider';
import {subscribeCircleInvite} from './src/features/circle/circleInvitePending';
import {createNavigationContainerRef} from '@react-navigation/native';
import {CIRCLE_ENABLED} from './src/config/featureFlags';
import {AppErrorBoundary} from './src/shared/AppErrorBoundary';

const navigationRef = createNavigationContainerRef();

function navigateToCircleJoin() {
  if (!CIRCLE_ENABLED) return;
  if (!navigationRef.isReady()) return;
  // @ts-expect-error tab + params
  navigationRef.navigate('Hub', {openSection: 'circle'});
}

function navigateToSafeLink(text: string) {
  if (!navigationRef.isReady()) return;
  // @ts-expect-error tab + params
  navigationRef.navigate('Digital Safety', {openSection: 'safe-link', safeLinkText: text});
}

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
          tabBarIcon: () => <Text style={{fontSize: 20}}>🛡️</Text>,
        }}
      />
      <Tab.Screen
        name="Hub"
        options={{
          tabBarIcon: () => <Text style={{fontSize: 20}}>⚙️</Text>,
          tabBarLabel: 'Hub',
        }}>
        {({navigation, route}) => <HubScreen navigation={navigation} route={route} />}
      </Tab.Screen>
      <Tab.Screen
        name="Digital Safety"
        options={{
          tabBarIcon: () => <Text style={{fontSize: 20}}>🔗</Text>,
          tabBarLabel: 'Safety',
        }}>
        {({navigation, route}) => (
          <DigitalSafetyTabScreen navigation={navigation} route={route} />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="App Usage"
        component={AppUsageScreen}
        options={{
          tabBarIcon: () => <Text style={{fontSize: 20}}>📊</Text>,
          tabBarLabel: 'Usage',
        }}
      />
    </Tab.Navigator>
  );
}

function AppContent(): React.JSX.Element {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const [pendingSafeLinkText, setPendingSafeLinkText] = useState('');
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const {isPinSet, isVerifying, error, setPin, verifyPin, recheckPin} = usePinLock();
  const {colors, themeId} = useTheme();
  const {canUseFeature} = useEntitlements();
  const isLight = themeId === 'light';
  const sessionReady = !!(isUnlocked && isPinSet);
  const clipboardAutomationAllowed =
    sessionReady && canUseFeature('digitalsafe.clipboard_scan');
  const breachAutomationAllowed =
    sessionReady && canUseFeature('digitalsafe.breach_monitor');

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

  // After unlock: pull web/admin tracking knobs + start lightweight presence (battery-safe).
  useEffect(() => {
    if (!isUnlocked || !isPinSet) return;
    let cancelled = false;
    (async () => {
      try {
        await pullRemoteTrackingConfig();
        if (!cancelled) await startDevicePresence();
        if (!cancelled && CIRCLE_ENABLED) {
          const fcm = await registerFcmForCircleInvites();
          if (!fcm.ok) {
            console.warn('[fcm] register skipped', fcm.reason);
          }
        }
      } catch (e) {
        console.warn('[tracking] presence start skipped', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isUnlocked, isPinSet]);

  useCircleInviteDeepLink(!!(isUnlocked && isPinSet && CIRCLE_ENABLED));

  // Share-to-MRP Safe Link: free tier, always on when unlocked (capability: safeLinkShare).
  useSafeLinkShareDeepLink(sessionReady, text => {
    setPendingSafeLinkText(text);
  });

  // Clipboard URL scan: Basic+, explicit opt-in stored natively, foreground only.
  useClipboardUrlScan(clipboardAutomationAllowed, url => {
    setPendingSafeLinkText(url);
  });

  // Breach email re-check: Basic+, enrolled emails only, while app foreground.
  useBreachEmailMonitor(breachAutomationAllowed);

  useEffect(() => {
    if (!pendingSafeLinkText || !navReady || !sessionReady) return;
    navigateToSafeLink(pendingSafeLinkText);
    setPendingSafeLinkText('');
  }, [pendingSafeLinkText, navReady, sessionReady]);

  useEffect(() => {
    if (!isUnlocked || !isPinSet || !CIRCLE_ENABLED) return;
    return subscribeCircleInvite(() => {
      navigateToCircleJoin();
    });
  }, [isUnlocked, isPinSet]);

  const shellStyle = {flex: 1 as const, backgroundColor: colors.bg};

  // Loading state while checking PIN
  if (isPinSet === null) {
    return (
      <View style={[styles.splash, styles.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={brandColors.surface} />
        <BrandLockup size="splash" light showPillars />
        <ActivityIndicator size="large" color={brandColors.googleBlue} style={{marginTop: 28}} />
        <BrandWave />
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
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            setNavReady(true);
          }}>
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
    <View style={[shellStyle, {backgroundColor: brandColors.surface}]}>
      <StatusBar barStyle="dark-content" backgroundColor={brandColors.surface} />
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
          <AppErrorBoundary>
            <AppContent />
          </AppErrorBoundary>
        </EntitlementProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  splash: {
    flex: 1,
    backgroundColor: brandColors.surface,
  },
});

export default App;
