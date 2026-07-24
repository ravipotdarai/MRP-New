import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useAuth} from '../../services/auth/AuthContext';

type Props = {
  onBack: () => void;
};

export function AccountScreen({onBack}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {auth, device, loading, googleConfigured, signInWithGoogle, signOut, refresh} = useAuth();
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message || 'Could not sign in with Google');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out of Google?', 'Cloud features will be disabled until you sign in again.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await signOut();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.sub}>Google account links subscription, backup, and Circle (when enabled).</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Google account</Text>
        {auth.signedIn ? (
          <>
            <Text style={styles.value}>{auth.emailMasked || auth.email}</Text>
            {auth.displayName ? (
              <Text style={styles.meta}>{auth.displayName}</Text>
            ) : null}
            <Text style={styles.meta}>Google UID: {auth.uid}</Text>
            <Text style={styles.meta}>
              Firebase UID: {auth.firebaseUid || 'not linked — Circle invites will fail'}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>Not signed in</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>This device</Text>
        <Text style={styles.value}>{device?.label || 'Unknown device'}</Text>
        <Text style={styles.meta}>ID: {device?.deviceId || '—'}</Text>
        {auth.deviceRegisteredAt ? (
          <Text style={styles.meta}>
            Registered {new Date(auth.deviceRegisteredAt).toLocaleString()}
          </Text>
        ) : null}
      </View>

      {!googleConfigured ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Google Sign-In not configured</Text>
          <Text style={styles.warnBody}>
            Add your Firebase Web client ID to android/app/src/main/res/values/strings.xml as
            google_web_client_id. See ENV_SETUP.md in the repo root.
          </Text>
        </View>
      ) : null}

      {auth.signedIn ? (
        <TouchableOpacity style={styles.outlineBtn} onPress={handleSignOut} disabled={busy}>
          <Text style={styles.outlineBtnText}>Sign out</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSignIn}
          disabled={busy || !googleConfigured}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Sign in with Google</Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.linkBtn} onPress={() => refresh()}>
        <Text style={styles.linkText}>Refresh status</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    scroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    centered: {justifyContent: 'center', alignItems: 'center'},
    title: {fontSize: 24, fontWeight: '800', color: colors.textPrimary},
    sub: {fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
    },
    value: {fontSize: 16, fontWeight: '700', color: colors.textPrimary},
    meta: {fontSize: 12, color: colors.textMuted, marginTop: 4},
    muted: {fontSize: 14, color: colors.textMuted},
    warnCard: {
      backgroundColor: colors.amberSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.amber,
    },
    warnTitle: {fontSize: 14, fontWeight: '800', color: colors.amber, marginBottom: 4},
    warnBody: {fontSize: 13, color: colors.textBody, lineHeight: 19},
    primaryBtn: {
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: {color: '#fff', fontWeight: '800', fontSize: 15},
    outlineBtn: {
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: colors.red,
    },
    outlineBtnText: {color: colors.red, fontWeight: '800', fontSize: 15},
    linkBtn: {marginTop: spacing.md, alignItems: 'center'},
    linkText: {color: colors.sky, fontWeight: '700', fontSize: 14},
  });
}
