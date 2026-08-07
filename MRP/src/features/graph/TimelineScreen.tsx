import React, {useState, useCallback, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
  AppState,
  useWindowDimensions,
  SafeAreaView,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import {useFocusEffect} from '@react-navigation/native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {findMatchingSelfie} from '../../shared/utils/selfieMatcher';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

const EVENT_ICONS: Record<string, string> = {
  SCREEN_LOCK: '🔒',
  SCREEN_UNLOCK: '🔓',
  UNLOCK_FAILED: '⚠️',
  WRONG_UNLOCK_ATTEMPT: '⚠️',
  WRONG_PASSWORD: '🚨',
  WRONG_BIOMETRIC: '👆',
  SIM_REMOVED: '📵',
  SIM_INSERTED: '📱',
  SIM_CHANGE: '🔄',
  FACTORY_RESET: '💣',
  DEVICE_SHUTDOWN: '🔴',
  DEVICE_REBOOT: '🔄',
  AIRPLANE_MODE_TOGGLE: '✈️',
  WIFI_TOGGLE: '📶',
  WIFI_ENABLED: '📶',
  WIFI_DISABLED: '📶',
  WIFI_CONNECTED: '📶',
  WIFI_DISCONNECTED: '📶',
  MOBILE_DATA_TOGGLE: '📱',
  MOBILE_DATA_ENABLED: '📱',
  MOBILE_DATA_DISABLED: '📱',
  HOTSPOT_TOGGLE: '🔥',
  HOTSPOT_ENABLED: '🔥',
  HOTSPOT_DISABLED: '🔥',
  BLUETOOTH_TOGGLE: '🎧',
  BLUETOOTH_ENABLED: '🎧',
  BLUETOOTH_DISABLED: '🎧',
  BLUETOOTH_CONNECTED: '🎧',
  BLUETOOTH_DISCONNECTED: '🎧',
  GEOFENCE_ENTER: '🏠',
  GEOFENCE_EXIT: '🚪',
  AIRPLANE_MODE_ENABLED: '✈️',
  AIRPLANE_MODE_DISABLED: '✈️',
  USB_CONNECTED: '💻',
  USB_DISCONNECTED: '🚫',
  APP_INSTALLED: '📦',
  APP_UPDATED: '📦',
  APP_MISUSE: '📵',
  DATA_RISK_APP: '⚠️',
  POSTURE_ALERT: '🛡️',
};

interface TimelineEntry {
  id: string;
  timestamp: string;
  event_type: string;
  status: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    detailed_address: string;
  };
  geofence_status: {
    inside_fence: boolean;
    fence_id: string | null;
  };
  metadata: Record<string, any>;
}

interface PhotoItem {
  path: string;
  timestamp: number;
  name?: string;
}

export function TimelineScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.9);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selfieZoom, setSelfieZoom] = useState(1);
  const [selfiePage, setSelfiePage] = useState(0);
  const [fullSelfieVisible, setFullSelfieVisible] = useState(false);

  const loadTimeline = useCallback(async () => {
    try {
      const [result, photoList] = await Promise.all([
        mrpmModule.getTimeline().catch(() => []),
        mrpmModule.getPhotos().catch(() => []),
      ]);
      setEntries(Array.isArray(result) ? result : []);
      setPhotos(Array.isArray(photoList) ? photoList : []);
    } catch (e) {
      console.error('Failed to load timeline:', e);
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Poll while Timeline is open so new events appear without manual pull
  useFocusEffect(
    useCallback(() => {
      loadTimeline();
      const poll = setInterval(() => {
        loadTimeline();
      }, 20000);
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') {
          loadTimeline();
        }
      });
      return () => {
        clearInterval(poll);
        sub.remove();
      };
    }, [loadTimeline]),
  );
  const findMatchingPhoto = (entry: TimelineEntry): PhotoItem | null => {
    return findMatchingSelfie(entry.event_type, entry.timestamp, photos);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTimeline();
  }, [loadTimeline]);

  const formatEventType = (type: string | undefined): string => {
    if (!type) return 'Unknown Event';
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  const openLocation = (lat: number, lng: number) => {
    const url = `https://maps.google.com/?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open maps');
    });
  };

  const deleteEntry = (entry: TimelineEntry) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await mrpmModule.deleteTimelineEntry(entry.id);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
              setDetailModalVisible(false);
            } catch (e) {
              console.error('Failed to delete entry:', e);
            }
          },
        },
      ],
    );
  };

  const clearAllTimeline = () => {
    Alert.alert(
      'Clear All Timeline',
      'This will delete ALL events. Are you sure?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await mrpmModule.clearTimeline();
              setEntries([]);
              setDetailModalVisible(false);
            } catch (e) {
              console.error('Failed to clear timeline:', e);
            }
          },
        },
      ],
    );
  };

  const renderEntry = ({item}: {item: TimelineEntry}) => {
    const matchedPhoto = findMatchingPhoto(item);
    return (
      <TouchableOpacity
        style={styles.entryItem}
        onPress={() => {
          setSelectedEntry(item);
          setDetailModalVisible(true);
        }}>
        <View style={styles.entryIcon}>
          <Text style={styles.iconText}>{EVENT_ICONS[item.event_type] || '📋'}</Text>
        </View>

        <View style={styles.entryContent}>
          <Text style={styles.eventType}>{formatEventType(item.event_type)}</Text>
          {item.event_type === 'APP_MISUSE' || item.event_type === 'DATA_RISK_APP' ? (
            <Text style={styles.description} numberOfLines={1}>
              {item.metadata?.app_name ||
                item.metadata?.application_name ||
                item.metadata?.package_name ||
                item.metadata?.package ||
                'Unknown app'}
            </Text>
          ) : null}
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
          {item.location?.detailed_address && item.location.detailed_address !== 'Address Unavailable (Offline)' && (
            <Text style={styles.location} numberOfLines={2}>
              📍 {item.location.detailed_address}
              {item.location?.accuracy_meters
                ? ` (±${Math.round(Number(item.location.accuracy_meters))}m)`
                : ''}
            </Text>
          )}
          <Text style={styles.description}>Status: {item.status || 'N/A'}</Text>
          {matchedPhoto && (
            <View style={styles.selfieBadgeRow}>
              <Text style={styles.selfieBadgeText}>📸 Selfie Captured</Text>
            </View>
          )}
        </View>

        <View style={styles.entryRight}>
          {matchedPhoto ? (
            <Image
              source={{uri: `file://${matchedPhoto.path}`}}
              style={styles.rowSelfieThumb}
              resizeMode="contain"
            />
          ) : null}
          <View
            style={[
              styles.geofenceBadge,
              {
                backgroundColor: item.geofence_status?.inside_fence
                  ? colors.emeraldSoft
                  : colors.amberSoft,
                borderColor: item.geofence_status?.inside_fence
                  ? colors.emerald
                  : colors.amber,
              },
            ]}>
            <Text
              style={[
                styles.geofenceText,
                {
                  color: item.geofence_status?.inside_fence
                    ? colors.emerald
                    : colors.amber,
                },
              ]}>
              {item.geofence_status?.inside_fence
                ? `🏠 Inside ${item.metadata?.geofence_name || 'zone'}`
                : item.metadata?.geofence_distance_m != null &&
                    Number.isFinite(Number(item.metadata.geofence_distance_m))
                  ? `📍 Away · ${Math.round(Number(item.metadata.geofence_distance_m))}m`
                  : '📍 Away'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDetailModal = () => {
    const matchedPhoto = selectedEntry ? findMatchingPhoto(selectedEntry) : null;
    return (
      <>
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={[styles.modalSheet, {height: sheetHeight}]}>
            <View style={styles.modalGrabRow}>
              <View style={styles.modalGrab} />
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled>
              {selectedEntry && (
                <>
                  {matchedPhoto && (
                    <View style={styles.selfieEvidenceCard}>
                      <Text style={styles.selfieEvidenceTitle}>
                        📸 SURVEILLANCE SELFIE EVIDENCE
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.95}
                        onPress={() => {
                          setSelfieZoom(1);
                          setSelfiePage(0);
                          setFullSelfieVisible(true);
                        }}
                        style={styles.selfiePreviewTap}>
                        <View style={styles.selfiePreviewFrame}>
                          <Image
                            source={{
                              uri: matchedPhoto.path.startsWith('file://')
                                ? matchedPhoto.path
                                : `file://${matchedPhoto.path}`,
                            }}
                            style={{
                              width: Math.max(windowWidth - 72, 200),
                              height: 280 * Math.min(Math.max(selfieZoom, 1), 2),
                              alignSelf: 'center',
                            }}
                            resizeMode="contain"
                            onError={e =>
                              console.warn(
                                'Selfie preview failed',
                                matchedPhoto.path,
                                e.nativeEvent.error,
                              )
                            }
                          />
                        </View>
                      </TouchableOpacity>
                      <View style={styles.selfieZoomRow}>
                        <TouchableOpacity
                          style={styles.zoomBtn}
                          onPress={() => setSelfieZoom(z => Math.max(1, +(z - 0.5).toFixed(1)))}>
                          <Text style={styles.zoomBtnText}>−</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.zoomBtn}
                          onPress={() => setFullSelfieVisible(true)}>
                          <Text style={styles.zoomBtnText}>Full screen / swipe</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.zoomBtn}
                          onPress={() => setSelfieZoom(z => Math.min(4, +(z + 0.5).toFixed(1)))}>
                          <Text style={styles.zoomBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.selfiePathLabel}>File Path:</Text>
                      <Text style={styles.selfiePathValue} selectable>
                        {matchedPhoto.path}
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Event</Text>
                    <Text style={styles.detailValue}>
                      {EVENT_ICONS[selectedEntry.event_type]}{' '}
                      {formatEventType(selectedEntry.event_type)}
                    </Text>
                  </View>

                  {(selectedEntry.event_type === 'APP_MISUSE' ||
                    selectedEntry.event_type === 'DATA_RISK_APP') && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Application</Text>
                      <Text style={styles.detailValue}>
                        {selectedEntry.metadata?.app_name ||
                          selectedEntry.metadata?.application_name ||
                          'Unknown app'}
                      </Text>
                      <Text style={styles.detailSubvalue}>
                        Package:{' '}
                        {selectedEntry.metadata?.package_name ||
                          selectedEntry.metadata?.package ||
                          '—'}
                      </Text>
                      {selectedEntry.metadata?.permissions ? (
                        <Text style={styles.detailSubvalue}>
                          Permissions: {String(selectedEntry.metadata.permissions)}
                        </Text>
                      ) : null}
                      {selectedEntry.metadata?.foreground_status ? (
                        <Text style={styles.detailSubvalue}>
                          Foreground:{' '}
                          {String(
                            selectedEntry.metadata?.foreground_status ||
                              selectedEntry.metadata?.foreground ||
                              '—',
                          )}
                        </Text>
                      ) : null}
                      {selectedEntry.metadata?.rule_title ? (
                        <Text style={styles.detailSubvalue}>
                          Rule: {String(selectedEntry.metadata.rule_title)}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={styles.detailValue}>{selectedEntry.status}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Timestamp</Text>
                    <Text style={styles.detailValue}>
                      {formatTimestamp(selectedEntry.timestamp)}
                    </Text>
                  </View>

                  {selectedEntry.location && selectedEntry.location.latitude !== 0 && (
                    <>
                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Location</Text>
                        <Text style={styles.detailValue}>
                          {selectedEntry.location.detailed_address}
                        </Text>
                        <TouchableOpacity
                          style={styles.mapButton}
                          onPress={() =>
                            openLocation(
                              selectedEntry.location.latitude,
                              selectedEntry.location.longitude,
                            )
                          }>
                          <Text style={styles.mapButtonText}>📍 Open in Maps</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Coordinates</Text>
                        <Text style={styles.detailValue}>
                          {selectedEntry.location.latitude.toFixed(6)},{' '}
                          {selectedEntry.location.longitude.toFixed(6)}
                        </Text>
                      </View>
                    </>
                  )}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Geofence Status</Text>
                    <Text style={styles.detailValue}>
                      {selectedEntry.geofence_status?.inside_fence
                        ? `🏠 Inside ${selectedEntry.metadata?.geofence_name || 'zone'}`
                        : selectedEntry.metadata?.geofence_distance_m != null &&
                            Number.isFinite(Number(selectedEntry.metadata.geofence_distance_m))
                          ? `📍 Away · ${Math.round(Number(selectedEntry.metadata.geofence_distance_m))}m`
                          : '📍 Away'}
                    </Text>
                    {selectedEntry.geofence_status?.inside_fence &&
                    selectedEntry.metadata?.geofence_distance_m != null &&
                    Number.isFinite(Number(selectedEntry.metadata.geofence_distance_m)) ? (
                      <Text style={styles.detailSubvalue}>
                        Distance to zone center:{' '}
                        {Math.round(Number(selectedEntry.metadata.geofence_distance_m))} m
                      </Text>
                    ) : !selectedEntry.geofence_status?.inside_fence &&
                      selectedEntry.metadata?.geofence_distance_m != null &&
                      Number.isFinite(Number(selectedEntry.metadata.geofence_distance_m)) ? (
                      <Text style={styles.detailSubvalue}>
                        Distance past nearest zone edge:{' '}
                        {Math.round(Number(selectedEntry.metadata.geofence_distance_m))} m
                      </Text>
                    ) : null}
                    {selectedEntry.location?.accuracy_meters ? (
                      <Text style={styles.detailSubvalue}>
                        Location accuracy: ±{Math.round(Number(selectedEntry.location.accuracy_meters))} m
                      </Text>
                    ) : null}
                    {(selectedEntry.metadata?.address_city ||
                      selectedEntry.metadata?.address_state ||
                      selectedEntry.metadata?.address_country) && (
                      <Text style={styles.detailSubvalue}>
                        {[
                          selectedEntry.metadata.address_city,
                          selectedEntry.metadata.address_state,
                          selectedEntry.metadata.address_country,
                          selectedEntry.metadata.address_postal,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    )}
                  </View>

                  {Object.keys(selectedEntry.metadata || {}).length > 0 && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Metadata</Text>
                      {Object.entries(selectedEntry.metadata).map(([key, value]) => (
                        <Text key={key} style={styles.detailSubvalue}>
                          {key}: {String(value)}
                        </Text>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => selectedEntry && deleteEntry(selectedEntry)}>
                <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
      {fullSelfieVisible && selectedEntry ? (
        <Modal
          visible={fullSelfieVisible}
          animationType="fade"
          onRequestClose={() => setFullSelfieVisible(false)}>
          <SafeAreaView style={styles.fullSelfieRoot}>
            <View style={styles.fullSelfieHeader}>
              <TouchableOpacity onPress={() => setFullSelfieVisible(false)} hitSlop={12}>
                <Text style={styles.fullSelfieClose}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.fullSelfieTitle}>Surveillance selfie</Text>
              <View style={{width: 48}} />
            </View>
            <FlatList
              data={(() => {
                const matched = findMatchingPhoto(selectedEntry);
                if (!matched) return [] as PhotoItem[];
                const nearby = photos
                  .filter(p => Math.abs(p.timestamp - matched.timestamp) <= 120_000)
                  .sort((a, b) => a.timestamp - b.timestamp);
                return nearby.length ? nearby : [matched];
              })()}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, idx) => `${item.path}-${idx}`}
              onMomentumScrollEnd={e => {
                const page = Math.round(
                  e.nativeEvent.contentOffset.x / Math.max(windowWidth, 1),
                );
                setSelfiePage(page);
              }}
              renderItem={({item}) => (
                <ScrollView
                  style={{width: windowWidth, backgroundColor: '#000'}}
                  contentContainerStyle={styles.fullSelfiePage}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  centerContent
                  showsVerticalScrollIndicator={false}>
                  <Image
                    source={{uri: `file://${item.path}`}}
                    style={{width: windowWidth, height: windowHeight * 0.82}}
                    resizeMode="contain"
                  />
                </ScrollView>
              )}
            />
            <Text style={styles.fullSelfieFooter}>
              Pinch or use +/− on detail · swipe for nearby · {selfiePage + 1}
            </Text>
          </SafeAreaView>
        </Modal>
      ) : null}
    </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>
            {entries.length} event{entries.length !== 1 ? 's' : ''} recorded
          </Text>
        </View>
        {entries.length > 0 && (
          <TouchableOpacity onPress={clearAllTimeline} style={styles.clearAllButton}>
            <Text style={styles.clearAllText}>Delete All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.sky} />
          <Text style={styles.loadingText}>Loading timeline...</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No events recorded yet</Text>
          <Text style={styles.emptySubtext}>
            Events will appear here when monitoring detects activity
          </Text>
        </View>
      ) : (
        <FlashList
          data={entries}
          renderItem={renderEntry}
          keyExtractor={item => item.id}
          estimatedItemSize={96}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.sky}
              colors={[colors.sky]}
            />
          }
        />
      )}

      {renderDetailModal()}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    headerSubtitle: {
      fontSize: 15,
      color: colors.textBody,
      fontWeight: '600',
    },
    clearAllButton: {
      backgroundColor: colors.redSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    clearAllText: {
      color: colors.red,
      fontWeight: '600',
      fontSize: 12,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
    },
    listContent: {
      padding: 16,
    },
    entryItem: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    entryIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.skySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    iconText: {
      fontSize: 22,
    },
    entryContent: {
      flex: 1,
    },
    eventType: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    timestamp: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    location: {
      fontSize: 12,
      color: colors.emerald,
      marginTop: 4,
    },
    description: {
      fontSize: 12,
      color: colors.textBody,
      marginTop: 4,
    },
    entryRight: {
      justifyContent: 'center',
      alignItems: 'flex-end',
      gap: 8,
      marginLeft: 8,
      maxWidth: 88,
    },
    geofenceBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
    },
    geofenceText: {
      fontSize: 12,
      fontWeight: '700',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      overflow: 'hidden',
    },
    modalGrabRow: {
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 4,
    },
    modalGrab: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    modalScroll: {
      flex: 1,
    },
    modalScrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 20,
    },
    detailSection: {
      marginBottom: 18,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 4,
      textTransform: 'uppercase',
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    detailValue: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '600',
      lineHeight: 22,
    },
    detailSubvalue: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    mapButton: {
      backgroundColor: colors.skySoft,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      marginTop: 10,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.sky,
    },
    mapButtonText: {
      color: colors.sky,
      fontSize: 14,
      fontWeight: '700',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.surface,
      gap: 10,
    },
    closeButton: {
      flex: 1,
      backgroundColor: colors.border,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    closeButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    deleteButton: {
      flex: 1,
      backgroundColor: colors.redSoft,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.red,
    },
    deleteButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.red,
    },
    selfieBadgeRow: {
      marginTop: 4,
      alignSelf: 'flex-start',
      backgroundColor: colors.skySoft,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    selfieBadgeText: {
      fontSize: 11,
      color: colors.sky,
      fontWeight: '700',
    },
    rowSelfieThumb: {
      width: 48,
      height: 48,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.sky,
      backgroundColor: colors.bg,
    },
    selfieEvidenceCard: {
      backgroundColor: colors.bg,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.sky,
      alignItems: 'center',
    },
    selfieEvidenceTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.sky,
      marginBottom: 8,
      letterSpacing: 0.5,
      alignSelf: 'flex-start',
    },
    modalSelfieImage: {
      width: '100%',
      height: 280,
      borderRadius: 10,
      backgroundColor: '#000',
    },
    selfiePreviewTap: {
      width: '100%',
      alignItems: 'center',
    },
    selfiePreviewFrame: {
      width: '100%',
      minHeight: 280,
      borderRadius: 10,
      backgroundColor: '#000',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    selfieZoomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 10,
    },
    zoomBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.skySoft,
      borderWidth: 1,
      borderColor: colors.sky,
    },
    zoomBtnText: {color: colors.sky, fontWeight: '800', fontSize: 13},
    fullSelfieRoot: {flex: 1, backgroundColor: '#000'},
    fullSelfieHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    fullSelfieClose: {color: '#fff', fontWeight: '700', fontSize: 16},
    fullSelfieTitle: {color: '#fff', fontWeight: '700', fontSize: 14},
    fullSelfiePage: {flexGrow: 1, justifyContent: 'center', alignItems: 'center'},
    fullSelfieFooter: {
      color: '#94a3b8',
      textAlign: 'center',
      paddingBottom: 16,
      fontSize: 12,
    },
    selfiePathLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 10,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      alignSelf: 'flex-start',
      fontWeight: '700',
    },
    selfiePathValue: {
      fontSize: 12,
      color: colors.textPrimary,
      fontFamily: 'monospace',
      alignSelf: 'flex-start',
    },
  });
}
