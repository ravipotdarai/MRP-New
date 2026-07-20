import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  AppState,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
} from 'react-native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {useTheme} from '../../shared/ThemeContext';
import {ColorPalette, spacing, radius} from '../../shared/theme';

export type PermissionSetupStatus = {
  camera: boolean;
  location: boolean;
  notifications: boolean;
  overlay: boolean;
  deviceAdmin: boolean;
  batteryExempt: boolean;
  accessibility: boolean;
  usageStats: boolean;
  coreComplete: boolean;
  manufacturer: string;
  missingCore: string[];
};

type StepId = 'runtime' | 'overlay' | 'device_admin' | 'battery' | 'done';

const STEPS: {id: StepId; label: string; why: string}[] = [
  {
    id: 'runtime',
    label: 'Camera, Location & Notifications',
    why: 'Capture intruder selfies and log GPS on security events. Notifications keep monitoring alive.',
  },
  {
    id: 'overlay',
    label: 'Display over other apps',
    why: 'Show the camera preview when the screen is locked.',
  },
  {
    id: 'device_admin',
    label: 'Device Admin',
    why: 'Detect wrong PIN/password unlock attempts.',
  },
  {
    id: 'battery',
    label: 'Battery & background (recommended)',
    why: 'Keep monitoring alive after reboot. You can skip and set this later.',
  },
];

function firstIncompleteStep(
  status: PermissionSetupStatus | null,
  batterySkipped: boolean,
): StepId {
  if (!status) return 'runtime';
  if (!status.camera || !status.location || !status.notifications) return 'runtime';
  if (!status.overlay) return 'overlay';
  if (!status.deviceAdmin) return 'device_admin';
  // Battery is recommended, not required — skippable
  if (!status.batteryExempt && !batterySkipped) return 'battery';
  return 'done';
}

export function PermissionSetupWizard({
  visible,
  onClose,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<PermissionSetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [batterySkipped, setBatterySkipped] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const bridge = mrpmModule as any;

  const refresh = useCallback(async () => {
    if (typeof bridge.getPermissionSetupStatus !== 'function') return;
    const s = await bridge.getPermissionSetupStatus();
    setStatus(s);
    // Clear dismiss flag when core is fully granted so future gaps can re-prompt
    if (s?.coreComplete && typeof bridge.setPermissionWizardDismissed === 'function') {
      await bridge.setPermissionWizardDismissed(false);
    }
  }, [bridge]);

  useEffect(() => {
    if (visible) {
      setBatterySkipped(false);
      setHint(null);
      refresh();
    }
  }, [visible, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && visible) refresh();
    });
    return () => sub.remove();
  }, [visible, refresh]);

  const currentStep = firstIncompleteStep(status, batterySkipped);
  const stepIndex = Math.max(0, STEPS.findIndex(s => s.id === currentStep));
  const stepMeta = STEPS[Math.min(stepIndex, STEPS.length - 1)];

  const dismissAndClose = async (completed: boolean) => {
    try {
      if (typeof bridge.setPermissionWizardDismissed === 'function') {
        // Persist so we do not auto-popup on every app open
        await bridge.setPermissionWizardDismissed(true);
      }
    } catch {
      // ignore
    }
    if (completed) {
      onComplete?.();
    }
    onClose();
  };

  const runStep = async () => {
    if (Platform.OS !== 'android') return;
    if (currentStep === 'done') {
      await dismissAndClose(true);
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      switch (currentStep) {
        case 'runtime': {
          const perms = [
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ];
          if (Platform.Version >= 33) {
            perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          }
          if (typeof bridge.requestRuntimePermissions === 'function') {
            await bridge.requestRuntimePermissions(perms);
          } else {
            await PermissionsAndroid.requestMultiple(perms as any);
          }
          // Re-check; if still missing (USER_FIXED), open the right Settings screen
          const after = await bridge.getPermissionSetupStatus?.();
          setStatus(after);
          if (after && (!after.camera || !after.location)) {
            setHint('Permission blocked. Opening App Settings — enable Camera and Location.');
            await bridge.openAppSettings?.();
          } else if (after && !after.notifications) {
            setHint('Notifications blocked. Opening Notification Settings — allow MRP.');
            if (typeof bridge.openAppNotificationSettings === 'function') {
              await bridge.openAppNotificationSettings();
            } else {
              await bridge.openAppSettings?.();
            }
          }
          break;
        }
        case 'overlay':
          await bridge.requestOverlayPermission?.();
          setTimeout(async () => {
            const after = await bridge.getPermissionSetupStatus?.();
            setStatus(after);
            if (after && !after.overlay) {
              setHint('Turn ON “Display over other apps” for MRP, then return here.');
            }
          }, 600);
          break;
        case 'device_admin':
          await bridge.requestDeviceAdminEnable?.();
          break;
        case 'battery':
          if (typeof bridge.requestIgnoreBatteryOptimizations === 'function') {
            await bridge.requestIgnoreBatteryOptimizations();
          }
          break;
        default:
          break;
      }
      setTimeout(refresh, 900);
    } finally {
      setBusy(false);
    }
  };

  const checklist = status
    ? [
        {
          ok: status.camera && status.location && status.notifications,
          label: 'Camera, Location, Notifications',
        },
        {ok: status.overlay, label: 'Display over other apps'},
        {ok: status.deviceAdmin, label: 'Device Admin'},
        {
          ok: status.batteryExempt || batterySkipped,
          label: status.batteryExempt
            ? 'Battery unrestricted'
            : 'Battery (optional — skipped OK)',
        },
      ]
    : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => dismissAndClose(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Grant All Access</Text>
          <Text style={styles.subtitle}>
            One guided flow for core protection
            {status?.manufacturer ? ` (${status.manufacturer})` : ''}. Return here after each system
            screen.
          </Text>

          {currentStep === 'done' ? (
            <View style={styles.doneBox}>
              <Text style={styles.doneTitle}>Core setup complete</Text>
              <Text style={styles.doneText}>
                Monitoring can run. Optional: Accessibility for fingerprint/face failures, or SIM
                Recovery for SMS alerts.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => dismissAndClose(true)}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.stepLabel}>
                Step {Math.min(stepIndex + 1, STEPS.length)} of {STEPS.length}: {stepMeta.label}
              </Text>
              <Text style={styles.stepWhy}>{stepMeta.why}</Text>
              {hint ? <Text style={styles.hint}>{hint}</Text> : null}

              <ScrollView style={styles.checklist}>
                {checklist.map(item => (
                  <Text key={item.label} style={styles.checkItem}>
                    {item.ok ? '✓' : '○'} {item.label}
                  </Text>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.primaryBtn, busy && styles.disabledBtn]}
                disabled={busy}
                onPress={runStep}>
                {busy ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {currentStep === 'battery'
                      ? 'Allow unrestricted battery'
                      : currentStep === 'overlay'
                        ? 'Open overlay settings'
                        : currentStep === 'device_admin'
                          ? 'Enable Device Admin'
                          : 'Allow permissions'}
                  </Text>
                )}
              </TouchableOpacity>

              {currentStep === 'battery' ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setBatterySkipped(true)}>
                  <Text style={styles.secondaryBtnText}>Skip for now</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => dismissAndClose(false)}>
                <Text style={styles.secondaryBtnText}>Finish later</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      maxHeight: '85%',
    },
    title: {fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.sm},
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.md,
      lineHeight: 20,
    },
    stepLabel: {fontSize: 16, fontWeight: '700', color: colors.sky, marginBottom: 6},
    stepWhy: {fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md},
    hint: {
      fontSize: 13,
      color: colors.amber,
      marginBottom: spacing.sm,
      lineHeight: 18,
    },
    checklist: {maxHeight: 140, marginBottom: spacing.md},
    checkItem: {fontSize: 14, color: colors.text, marginBottom: 6},
    primaryBtn: {
      backgroundColor: colors.emerald,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    primaryBtnText: {color: colors.bg, fontWeight: '700', fontSize: 16},
    secondaryBtn: {paddingVertical: 10, alignItems: 'center'},
    secondaryBtnText: {color: colors.textMuted, fontSize: 14},
    disabledBtn: {opacity: 0.7},
    doneBox: {paddingVertical: spacing.md},
    doneTitle: {fontSize: 18, fontWeight: '700', color: colors.emerald, marginBottom: 8},
    doneText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
  });
}
