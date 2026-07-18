import {useState, useEffect, useCallback, useRef} from 'react';
import mrpmModule, {MonitoringSettings} from './useNativeBridge';

const defaultSettings: MonitoringSettings = {
  isMonitoringEnabled: true,
  captureOnWrongUnlock: true,
  captureOnAirplaneMode: true,
  captureOnWifiToggle: true,
  captureOnMobileData: true,
  captureOnHotspot: true,
  captureOnSimChange: true,
  captureOnFactoryReset: true,
  captureOnUsb: true,
  maxFailedAttempts: 3,
  lockAfterFailedAttempts: true,
  autoDeleteAfterDays: 30,
};

export function useSettings() {
  const [settings, setSettings] = useState<MonitoringSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const isTogglingRef = useRef(false);

  const loadSettings = useCallback(async () => {
    // Don't reload if we're in the middle of toggling
    if (isTogglingRef.current) {
      setLoading(false);
      return;
    }
    try {
      const saved = await mrpmModule.getSettings();
      setSettings(saved);
      if (saved && saved.isMonitoringEnabled) {
        mrpmModule.startMonitoring().catch(err => console.log('startMonitoring error:', err));
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSetting = useCallback(
    async (key: keyof MonitoringSettings, value: boolean | number) => {
      const updated = {...settings, [key]: value};
      setSettings(updated);
      try {
        await mrpmModule.saveSettings(updated);
        // Master Monitoring switch must actually start/stop the native service
        if (key === 'isMonitoringEnabled' && typeof value === 'boolean') {
          if (value) {
            await mrpmModule.startMonitoring();
          } else {
            await mrpmModule.stopMonitoring();
          }
        }
      } catch (e) {
        console.error('Failed to save settings:', e);
        setSettings(settings); // Revert on error
      }
    },
    [settings],
  );

  const toggleMonitoring = useCallback(async () => {
    // Prevent multiple simultaneous toggles
    if (isTogglingRef.current) return;

    isTogglingRef.current = true;
    const newValue = !settings.isMonitoringEnabled;

    try {
      // Update settings first
      const updated = {...settings, isMonitoringEnabled: newValue};
      setSettings(updated);
      console.log('toggleMonitoring: Saving settings with isMonitoringEnabled =', newValue);
      await mrpmModule.saveSettings(updated);
      console.log('toggleMonitoring: Settings saved');

      // Then start/stop service
      if (newValue) {
        console.log('toggleMonitoring: Calling startMonitoring');
        await mrpmModule.startMonitoring();
        console.log('toggleMonitoring: startMonitoring completed');
      } else {
        await mrpmModule.stopMonitoring();
      }
    } catch (e) {
      console.error('Failed to toggle monitoring:', e);
      // Revert on error
      setSettings(settings);
    } finally {
      isTogglingRef.current = false;
    }
  }, [settings]);

  return {
    settings,
    loading,
    updateSetting,
    toggleMonitoring,
    refresh: loadSettings,
  };
}