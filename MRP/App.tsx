import React, {useState} from 'react';
import {StatusBar, View, ActivityIndicator, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {PinLockScreen} from './src/screens/PinLockScreen';
import {usePinLock} from './src/hooks/usePinLock';
import {MonitoringScreen} from './src/features/monitoring/MonitoringScreen';
import {TimelineScreen} from './src/features/graph/TimelineScreen';
import {PhotoGallery} from './src/features/photos/PhotoGallery';
import {Text} from 'react-native';

const Tab = createBottomTabNavigator();

function TabNavigator({onLogout}: {onLogout: () => void}) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {backgroundColor: '#1a1a2e', borderTopColor: '#2d2d44'},
        tabBarActiveTintColor: '#4a90d9',
        tabBarInactiveTintColor: '#888',
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
    </Tab.Navigator>
  );
}

function App(): React.JSX.Element {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const {isPinSet, isVerifying, error, setPin, verifyPin} = usePinLock();

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
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <ActivityIndicator size="large" color="#4a90d9" />
      </View>
    );
  }

  // If unlocked and PIN is set, show main app with tabs
  if (isUnlocked && isPinSet) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <NavigationContainer>
          <TabNavigator onLogout={handleLogout} />
        </NavigationContainer>
      </View>
    );
  }

  // Show PIN lock screen (either setup or verify mode)
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
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
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;