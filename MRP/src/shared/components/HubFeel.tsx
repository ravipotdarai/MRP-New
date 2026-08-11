import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {ColorPalette, spacing, radius, brandColors} from '../theme';
import {pageBounceEnter} from '../animations/pageBounce';

/** Match Hub menu ScrollView physics. */
export const hubScrollProps: Partial<ScrollViewProps> = {
  showsVerticalScrollIndicator: false,
  bounces: true,
  alwaysBounceVertical: true,
  decelerationRate: 'normal',
  overScrollMode: 'always',
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
};

/** Staggered bounce-in like HubMenuCard. */
export function staggerEnter(index: number) {
  return FadeInDown.delay(Math.min(index, 12) * 40)
    .springify()
    .damping(14)
    .stiffness(180);
}

type HubFeelScrollProps = ScrollViewProps & {
  contentStyle?: StyleProp<ViewStyle>;
  /** Re-run enter animation when this key changes (e.g. tab id). */
  bounceKey?: string | number;
};

/** Hub-matching vertical scroller with soft bounce-in. */
export function HubFeelScrollView({
  children,
  style,
  contentContainerStyle,
  contentStyle,
  bounceKey,
  ...rest
}: HubFeelScrollProps) {
  return (
    <Animated.View
      key={bounceKey != null ? String(bounceKey) : undefined}
      style={{flex: 1}}
      entering={bounceKey != null ? pageBounceEnter : undefined}>
      <Animated.ScrollView
        style={[{flex: 1}, style]}
        contentContainerStyle={[
          {
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          },
          contentStyle,
          contentContainerStyle,
        ]}
        {...hubScrollProps}
        {...rest}>
        {children}
      </Animated.ScrollView>
    </Animated.View>
  );
}

type TabItem = {
  key: string;
  label: string;
  icon?: string;
};

type HubTabBarProps = {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  colors: ColorPalette;
};

/** Pill tab strip — same visual language as Hub cards. */
export function HubStyleTabBar({tabs, activeKey, onChange, colors}: HubTabBarProps) {
  const styles = createTabStyles(colors);
  return (
    <View style={styles.tabHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
        bounces
        decelerationRate="fast">
        {tabs.map((tab, index) => (
          <HubTabChip
            key={tab.key}
            label={tab.label}
            icon={tab.icon}
            active={activeKey === tab.key}
            colors={colors}
            index={index}
            onPress={() => onChange(tab.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function HubTabChip({
  label,
  icon,
  active,
  colors,
  index,
  onPress,
}: {
  label: string;
  icon?: string;
  active: boolean;
  colors: ColorPalette;
  index: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const styles = createTabStyles(colors);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  return (
    <Animated.View entering={staggerEnter(index)}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.94, {damping: 18, stiffness: 320});
        }}
        onPressOut={() => {
          scale.value = withSpring(1, {damping: 14, stiffness: 280});
        }}
        onPress={onPress}>
        <Animated.View style={[styles.tab, active && styles.activeTab, animStyle]}>
          {icon ? <Text style={styles.tabIcon}>{icon}</Text> : null}
          <Text style={[styles.tabText, active && styles.activeTabText]}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Bounce wrapper for tab page bodies (Security / App Usage). */
export function HubTabPage({
  pageKey,
  children,
  style,
}: {
  pageKey: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[{flex: 1}, style]} key={pageKey} entering={pageBounceEnter}>
      {children}
    </Animated.View>
  );
}

function createTabStyles(colors: ColorPalette) {
  return StyleSheet.create({
    tabHeader: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    tabBar: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'center',
      paddingRight: spacing.md,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    activeTab: {
      backgroundColor: brandColors.iconBg,
      borderColor: brandColors.googleBlue,
    },
    tabIcon: {fontSize: 14, marginRight: 6},
    tabText: {fontSize: 13, color: colors.textSecondary, fontWeight: '600'},
    activeTabText: {color: brandColors.googleBlue, fontWeight: '800'},
  });
}
