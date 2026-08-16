import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {View, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useHorizontalTabSwipe} from '../../shared/hooks/useHorizontalTabSwipe';
import {HubStyleTabBar, HubTabPage} from '../../shared/components/HubFeel';
import {MonitoringScreen} from '../monitoring/MonitoringScreen';
import {TimelineScreen} from '../graph/TimelineScreen';
import {PhotoGallery} from '../photos/PhotoGallery';
import {PermissionsScreen} from '../../screens/PermissionsScreen';

type SecurityTab = 'MONITORING' | 'TIMELINE' | 'PHOTOS' | 'PERMISSIONS';

const TABS: {key: SecurityTab; label: string; icon: string}[] = [
  {key: 'MONITORING', label: 'Setup', icon: '🛡️'},
  {key: 'TIMELINE', label: 'Activity', icon: '📋'},
  {key: 'PERMISSIONS', label: 'Permission', icon: '🔒'},
  {key: 'PHOTOS', label: 'Photos', icon: '📷'},
];

export function SecurityScreen({route}: {route?: any}) {
  const [active, setActive] = useState<SecurityTab>('MONITORING');
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeIndex = TABS.findIndex(t => t.key === active);
  const onSwipeIndex = useCallback((i: number) => {
    const tab = TABS[i];
    if (tab) setActive(tab.key);
  }, []);
  const swipeHandlers = useHorizontalTabSwipe(
    Math.max(0, activeIndex),
    TABS.length,
    onSwipeIndex,
  );

  const applyInitialTab = useCallback(() => {
    const initial = route?.params?.initialTab as SecurityTab | undefined;
    if (initial && TABS.some(t => t.key === initial)) {
      setActive(initial);
    }
  }, [route?.params?.initialTab]);

  useEffect(() => {
    applyInitialTab();
  }, [applyInitialTab]);

  useFocusEffect(
    useCallback(() => {
      applyInitialTab();
    }, [applyInitialTab]),
  );

  return (
    <View style={styles.container}>
      <HubStyleTabBar
        tabs={TABS}
        activeKey={active}
        onChange={key => setActive(key as SecurityTab)}
        colors={colors}
      />

      <View style={styles.content} {...swipeHandlers}>
        <HubTabPage pageKey={active}>
          {active === 'MONITORING' && <MonitoringScreen />}
          {active === 'TIMELINE' && <TimelineScreen />}
          {active === 'PERMISSIONS' && <PermissionsScreen />}
          {active === 'PHOTOS' && <PhotoGallery />}
        </HubTabPage>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    content: {flex: 1},
  });
}
