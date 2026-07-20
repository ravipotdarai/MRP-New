import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
} from 'react-native';
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
  MOBILE_DATA_TOGGLE: '📱',
  MOBILE_DATA_ENABLED: '📱',
  MOBILE_DATA_DISABLED: '📱',
  HOTSPOT_TOGGLE: '🔥',
  HOTSPOT_ENABLED: '🔥',
  HOTSPOT_DISABLED: '🔥',
  BLUETOOTH_TOGGLE: '🎧',
  BLUETOOTH_ENABLED: '🎧',
  BLUETOOTH_DISABLED: '🎧',
  AIRPLANE_MODE_ENABLED: '✈️',
  AIRPLANE_MODE_DISABLED: '✈️',
  USB_CONNECTED: '💻',
  USB_DISCONNECTED: '🚫',
  APP_INSTALLED: '📦',
  APP_UPDATED: '📦',
  APP_MISUSE: '📵',
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
  const {height: windowHeight} = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.9);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

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

  // Refresh only when Timeline is opened / focused — no continuous polling
  useFocusEffect(
    useCallback(() => {
      loadTimeline();
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') {
          loadTimeline();
        }
      });
      return () => sub.remove();
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
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
          {item.location?.detailed_address && item.location.detailed_address !== 'Address Unavailable (Offline)' && (
            <Text style={styles.location} numberOfLines={1}>
              📍 {item.location.detailed_address}
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
              {item.geofence_status?.inside_fence ? '🏠 Home' : '📍 Away'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDetailModal = () => {
    const matchedPhoto = selectedEntry ? findMatchingPhoto(selectedEntry) : null;
    return (
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
                      <Image
                        source={{uri: `file://${matchedPhoto.path}`}}
                        style={styles.modalSelfieImage}
                        resizeMode="cover"
                      />
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
                        ? '🏠 Inside fence'
                        : '📍 Outside fence'}
                    </Text>
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
        <FlatList
          data={entries}
          renderItem={renderEntry}
          keyExtractor={item => item.id}
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
      height: 180,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
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
