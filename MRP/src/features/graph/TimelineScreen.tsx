import React, {useState, useEffect, useCallback} from 'react';
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
} from 'react-native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {findMatchingSelfie} from '../../shared/utils/selfieMatcher';

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

  useEffect(() => {
    loadTimeline();
    const interval = setInterval(loadTimeline, 2500);
    return () => clearInterval(interval);
  }, [loadTimeline]);

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
          ) : (
            <View style={[styles.geofenceBadge, {backgroundColor: item.geofence_status?.inside_fence ? '#4CAF50' : '#9E9E9E'}]}>
              <Text style={styles.geofenceText}>
                {item.geofence_status?.inside_fence ? '🏠 Home' : '📍 Away'}
              </Text>
            </View>
          )}
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
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedEntry && (
                <>
                  {matchedPhoto && (
                    <View style={styles.selfieEvidenceCard}>
                      <Text style={styles.selfieEvidenceTitle}>📸 SURVEILLANCE SELFIE EVIDENCE</Text>
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
                      {EVENT_ICONS[selectedEntry.event_type]} {formatEventType(selectedEntry.event_type)}
                    </Text>
                  </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={styles.detailValue}>{selectedEntry.status}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Timestamp</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(selectedEntry.timestamp)}</Text>
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
                        onPress={() => openLocation(selectedEntry.location.latitude, selectedEntry.location.longitude)}>
                        <Text style={styles.mapButtonText}>📍 Open in Maps</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Coordinates</Text>
                      <Text style={styles.detailValue}>
                        {selectedEntry.location.latitude.toFixed(6)}, {selectedEntry.location.longitude.toFixed(6)}
                      </Text>
                      <Text style={styles.detailSubvalue}>
                        Accuracy: ±1m
                      </Text>
                    </View>
                  </>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Geofence Status</Text>
                  <Text style={styles.detailValue}>
                    {selectedEntry.geofence_status?.inside_fence ? '🏠 Inside fence' : '📍 Outside fence'}
                  </Text>
                  {selectedEntry.geofence_status?.fence_id && (
                    <Text style={styles.detailSubvalue}>
                      Fence ID: {selectedEntry.geofence_status.fence_id}
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
        </View>
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
          <ActivityIndicator size="large" color="#4a90d9" />
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {renderDetailModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  clearAllButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearAllText: {
    color: '#ef4444',
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
    color: '#94a3b8',
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
    color: '#f8fafc',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  entryItem: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  entryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
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
    color: '#f8fafc',
  },
  timestamp: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  location: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 4,
  },
  description: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
  },
  entryRight: {
    justifyContent: 'center',
  },
  geofenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  geofenceText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '500',
  },
  detailSubvalue: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  mapButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  mapButtonText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 14,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  selfieBadgeRow: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selfieBadgeText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
  },
  rowSelfieThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
  },
  selfieEvidenceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
  },
  selfieEvidenceTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  modalSelfieImage: {
    width: '100%',
    height: 260,
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  selfiePathLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 10,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    alignSelf: 'flex-start',
  },
  selfiePathValue: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
    alignSelf: 'flex-start',
  },
});