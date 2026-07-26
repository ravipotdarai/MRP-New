import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  BackHandler,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {AboutScreen} from '../../screens/AboutScreen';
import {SimRecoveryPanel} from '../sim-recovery/SimRecoveryPanel';
import {AccountScreen} from './AccountScreen';
import {SubscriptionScreen} from '../subscription/SubscriptionScreen';
import {CircleScreen} from '../circle/CircleScreen';
import {DriveSyncScreen} from '../drive/DriveSyncScreen';
import {GeofenceScreen} from '../geofence/GeofenceScreen';

export type HubSection =
  | 'menu'
  | 'account'
  | 'circle'
  | 'geofence'
  | 'drive-sync'
  | 'sim-recovery'
  | 'subscriptions'
  | 'promotions'
  | 'affiliates'
  | 'about';

type HubRouteParams = {openSection?: HubSection};

type MenuItem = {
  id: HubSection;
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'account',
    title: 'Account',
    subtitle: 'Google sign-in & device',
    icon: '👤',
  },
  {
    id: 'geofence',
    title: 'Geofence',
    subtitle: 'Zones, distance & address',
    icon: '🗺️',
    badge: 'Premium',
  },
  {
    id: 'circle',
    title: 'Circle',
    subtitle: 'Live Share — Enterprise',
    icon: '📍',
    badge: 'Enterprise',
  },
  {
    id: 'drive-sync',
    title: 'Drive Sync',
    subtitle: 'Encrypted backup — Premium+',
    icon: '☁️',
    badge: 'Premium',
  },
  {
    id: 'sim-recovery',
    title: 'SIM Recovery',
    subtitle: 'Contacts & SMS alerts',
    icon: '📱',
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    subtitle: 'Plans & billing',
    icon: '⭐',
  },
  {
    id: 'promotions',
    title: 'Promotions',
    subtitle: 'Offers & rewards',
    icon: '🎁',
  },
  {
    id: 'affiliates',
    title: 'Affiliates',
    subtitle: 'Share & earn',
    icon: '🔗',
  },
  {
    id: 'about',
    title: 'About MRP',
    subtitle: 'Guide, trust & version',
    icon: 'ℹ️',
  },
];

type HubNav = {
  setParams?: (params: {openSection?: HubSection | undefined}) => void;
};

/** Title only — system / gesture back returns to Hub menu (no ← Hub button). */
function HubTitleBar({title, styles}: {title: string; styles: ReturnType<typeof createStyles>}) {
  return (
    <View style={styles.subHeader}>
      <Text style={styles.subTitle}>{title}</Text>
    </View>
  );
}

function PlaceholderBody({
  title,
  body,
  styles,
  colors,
}: {
  title: string;
  body: string;
  styles: ReturnType<typeof createStyles>;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.placeholderCard}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={[styles.placeholderBody, {color: colors.textBody}]}>{body}</Text>
    </View>
  );
}

export function HubScreen({
  navigation,
  route,
}: {
  navigation?: HubNav;
  route?: {params?: HubRouteParams};
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<HubSection>('menu');

  const goMenu = useCallback(() => {
    setSection('menu');
    navigation?.setParams?.({openSection: undefined});
  }, [navigation]);

  const openSection = useCallback((id: HubSection) => setSection(id), []);

  useFocusEffect(
    useCallback(() => {
      const target = route?.params?.openSection;
      if (target && target !== 'menu') {
        setSection(target);
      }

      const onHardwareBack = () => {
        if (section !== 'menu') {
          goMenu();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => sub.remove();
    }, [route?.params?.openSection, section, goMenu]),
  );

  useEffect(() => {
    const target = route?.params?.openSection;
    if (target && target !== 'menu') {
      setSection(target);
    }
  }, [route?.params?.openSection]);

  if (section === 'about') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="About MRP" styles={styles} />
        <AboutScreen />
      </SafeAreaView>
    );
  }

  if (section === 'account') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="Account" styles={styles} />
        <AccountScreen onBack={goMenu} />
      </SafeAreaView>
    );
  }

  if (section === 'sim-recovery') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="SIM Recovery" styles={styles} />
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <SimRecoveryPanel onUpgrade={() => openSection('subscriptions')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (section === 'subscriptions') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="Subscriptions" styles={styles} />
        <SubscriptionScreen onBack={goMenu} />
      </SafeAreaView>
    );
  }

  if (section === 'circle') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="Circle" styles={styles} />
        <CircleScreen onUpgrade={() => openSection('subscriptions')} />
      </SafeAreaView>
    );
  }

  if (section === 'drive-sync') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="Drive Sync" styles={styles} />
        <DriveSyncScreen onUpgrade={() => openSection('subscriptions')} onBack={goMenu} />
      </SafeAreaView>
    );
  }

  if (section === 'geofence') {
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title="Geofence" styles={styles} />
        <GeofenceScreen onUpgrade={() => openSection('subscriptions')} />
      </SafeAreaView>
    );
  }

  if (section !== 'menu') {
    const item = MENU_ITEMS.find(m => m.id === section);
    const copy: Record<string, {title: string; body: string}> = {
      promotions: {
        title: 'Promotions',
        body: 'Seasonal offers and rewards will appear here. Check back after launch.',
      },
      affiliates: {
        title: 'Affiliates',
        body: 'Share MRP with your link and track referrals. Coming soon.',
      },
    };
    const content = copy[section] ?? {title: item?.title ?? 'Hub', body: ''};
    return (
      <SafeAreaView style={styles.safe}>
        <HubTitleBar title={item?.title ?? 'Hub'} styles={styles} />
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <PlaceholderBody
            title={content.title}
            body={content.body}
            styles={styles}
            colors={colors}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.menuScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Hub</Text>
          <Text style={styles.heroSub}>Services, billing & recovery</Text>
          <Text style={styles.hint}>Use system back to leave a section</Text>
        </View>
        {MENU_ITEMS.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuCard}
            activeOpacity={0.75}
            onPress={() => openSection(item.id)}>
            <View style={styles.menuIconWrap}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
            </View>
            <View style={styles.menuText}>
              <View style={styles.menuTitleRow}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                {item.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: {flex: 1, backgroundColor: colors.bg},
    menuScroll: {padding: spacing.lg, paddingBottom: spacing.xxl},
    scrollPad: {padding: spacing.lg, paddingBottom: spacing.xxl},
    hero: {marginBottom: spacing.lg},
    heroTitle: {fontSize: 28, fontWeight: '800', color: colors.textPrimary},
    heroSub: {fontSize: 14, color: colors.textMuted, marginTop: 4},
    hint: {fontSize: 12, color: colors.textMuted, marginTop: 6},
    menuCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.skySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    menuIcon: {fontSize: 22},
    menuText: {flex: 1},
    menuTitleRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
    menuTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
    menuSubtitle: {fontSize: 13, color: colors.textMuted, marginTop: 2},
    badge: {
      backgroundColor: colors.violet,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeText: {fontSize: 10, fontWeight: '800', color: '#fff'},
    chevron: {fontSize: 22, color: colors.textMuted, marginLeft: 8},
    subHeader: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.surface,
    },
    subTitle: {fontSize: 17, fontWeight: '800', color: colors.textPrimary},
    placeholderCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    placeholderTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    placeholderBody: {fontSize: 15, lineHeight: 22},
  });
}
