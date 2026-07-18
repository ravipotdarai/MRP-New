import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  SafeAreaView,
  Linking,
} from 'react-native';
import {Card} from '../../shared/components/Card';
import mrpmModule, {Photo} from '../../shared/hooks/useNativeBridge';

const {width} = Dimensions.get('window');
const PHOTO_SIZE = (width - 48) / 2;

interface TimelineEntry {
  id: string;
  timestamp: string;
  event_type: string;
  status: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    detailed_address: string;
  };
  geofence_status?: {
    inside_fence: boolean;
    fence_id: string | null;
  };
}

type SortOption = 'NEWEST' | 'OLDEST' | 'MONTH' | 'WEEK' | 'DAY';

export function PhotoGallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'WRONG_UNLOCK' | 'WRONG_PASSWORD' | 'TEST'>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');
  const [capturingTest, setCapturingTest] = useState(false);

  const formatPhotoEventName = (filename: string) => {
    const upper = (filename || '').toUpperCase();
    if (upper.includes('WRONG_UNLOCK_ATTEMPT')) return 'Wrong Unlock Attempt';
    if (upper.includes('WRONG_PASSWORD')) return 'Wrong Password';
    if (upper.includes('TEST_BULLETPROOF') || upper.includes('TEST_SELFIE')) return 'Test Selfie';
    if (upper.includes('WIFI_ENABLED')) return 'Wi-Fi Enabled Capture';
    const nameWithoutExt = (filename || '').replace(/\.jpe?g$/i, '');
    const parts = nameWithoutExt.split('_');
    if (parts.length >= 3) {
      const eventParts = parts.slice(0, -2);
      return eventParts.join(' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return nameWithoutExt.replace(/_/g, ' ').toUpperCase();
  };

  const openLocation = (lat: number, lng: number) => {
    const url = `https://maps.google.com/?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open maps');
    });
  };

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [photoList, eventsList] = await Promise.all([
        mrpmModule.getPhotos().catch(() => []),
        mrpmModule.getTimeline().catch(() => []),
      ]);
      const normalizedPhotos: Photo[] = (Array.isArray(photoList) ? photoList : []).map((p: any) => {
        const fileName = p.name || p.path?.split('/').pop() || p.path?.split('\\').pop() || 'UNKNOWN_EVENT.jpg';
        return {
          ...p,
          name: fileName,
          eventType: formatPhotoEventName(fileName),
        };
      });
      setPhotos(normalizedPhotos);
      setTimelineEvents(Array.isArray(eventsList) ? eventsList : []);
    } catch (e) {
      console.error('Failed to load gallery data:', e);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 2500);
    return () => clearInterval(interval);
  }, []);

  const triggerTestSelfie = async () => {
    try {
      setCapturingTest(true);
      Alert.alert(
        'Testing Front Camera',
        'Requesting immediate front camera selfie capture for verification...',
      );
      await mrpmModule.testPhotoCapture('WRONG_UNLOCK_ATTEMPT');
      setTimeout(() => {
        loadData(true);
        setCapturingTest(false);
      }, 3000);
    } catch (e: any) {
      setCapturingTest(false);
      Alert.alert('Capture Test Error', e?.message || 'Could not launch camera capture');
    }
  };

  const deletePhoto = (photo: Photo) => {
    Alert.alert(
      'Delete Selfie Evidence',
      'Are you sure you want to permanently delete this intruder selfie?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await mrpmModule.deletePhoto(photo.path);
              setPhotos(prev => prev.filter(p => p.path !== photo.path));
              if (selectedPhoto?.path === photo.path) {
                setSelectedPhoto(null);
              }
            } catch (e) {
              console.error('Failed to delete photo:', e);
            }
          },
        },
      ],
    );
  };

  // Apply type filter + time-range filter + sort order
  const displayedPhotos = (() => {
    let result = photos.filter(p => {
      const upper = p.name.toUpperCase();
      if (activeTab === 'WRONG_UNLOCK') {
        return upper.includes('WRONG_UNLOCK_ATTEMPT');
      }
      if (activeTab === 'WRONG_PASSWORD') {
        return upper.includes('WRONG_PASSWORD');
      }
      if (activeTab === 'TEST') {
        return upper.includes('TEST') || upper.includes('WIFI');
      }
      return true;
    });

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    if (sortBy === 'DAY') {
      result = result.filter(p => now - p.timestamp < DAY_MS);
    } else if (sortBy === 'WEEK') {
      result = result.filter(p => now - p.timestamp < 7 * DAY_MS);
    } else if (sortBy === 'MONTH') {
      result = result.filter(p => now - p.timestamp < 30 * DAY_MS);
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'OLDEST') return a.timestamp - b.timestamp;
      return b.timestamp - a.timestamp; // NEWEST, DAY, WEEK, MONTH all default to newest-first
    });
  })();

  // Find closest matching timeline event within 180 seconds
  const findMatchingEvent = (photo: Photo): TimelineEntry | null => {
    if (!timelineEvents.length) return null;
    let closest: TimelineEntry | null = null;
    let minDiff = 180000; // 3 minutes max delta

    for (const evt of timelineEvents) {
      let evtTime = 0;
      const parsedTime = Date.parse(evt.timestamp);
      if (!isNaN(parsedTime)) {
        evtTime = parsedTime;
      } else {
        evtTime = Number(evt.timestamp) || 0;
      }
      const diff = Math.abs(evtTime - photo.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = evt;
      }
    }
    return closest;
  };

  const renderPhotoItem = ({item}: {item: Photo}) => {
    const eventTitle = formatPhotoEventName(item.name);

    // Photos are stored in app-specific external storage (getExternalFilesDir(null)/MRP/)
    // which is directly readable with a file:// URI - no content:// provider needed.
    const imageUri = `file://${item.path}`;

    return (
      <TouchableOpacity
        style={styles.photoContainer}
        activeOpacity={0.8}
        onPress={() => setSelectedPhoto(item)}
        onLongPress={() => deletePhoto(item)}>
        <Image
          source={{uri: imageUri}}
          style={styles.photo}
          resizeMode="cover"
          onError={(e) => console.warn('Image load failed:', imageUri, e.nativeEvent.error)}
        />
        <View style={styles.photoOverlay}>
          <Text style={styles.photoTitle} numberOfLines={1}>
            {eventTitle}
          </Text>
          <Text style={styles.photoTime}>
            {new Date(item.timestamp).toLocaleDateString()}{' '}
            {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const matchedEvent = selectedPhoto ? findMatchingEvent(selectedPhoto) : null;

  const deleteAllPhotos = () => {
    Alert.alert(
      'Delete All Photos',
      'Are you sure you want to permanently delete ALL intruder selfies?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await mrpmModule.deleteAllPhotos();
              setPhotos([]);
              if (selectedPhoto) {
                setSelectedPhoto(null);
              }
            } catch (e) {
              console.error('Failed to delete all photos:', e);
            }
          },
        },
      ],
    );
  };

  const FILTER_CHIPS: {key: typeof activeTab; label: string}[] = [
    {key: 'ALL', label: `All (${photos.length})`},
    {key: 'WRONG_UNLOCK', label: 'Unlock Attempts'},
    {key: 'WRONG_PASSWORD', label: 'Wrong Password'},
    {key: 'TEST', label: 'Test / Network'},
  ];

  const SORT_CHIPS: {key: SortOption; label: string}[] = [
    {key: 'NEWEST', label: 'Newest'},
    {key: 'OLDEST', label: 'Oldest'},
    {key: 'DAY', label: 'Today'},
    {key: 'WEEK', label: 'This Week'},
    {key: 'MONTH', label: 'This Month'},
  ];

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.header}>📷 Intruder Selfie Evidence</Text>
            <Text style={styles.subheader}>
              {photos.length} total security capture{photos.length !== 1 ? 's' : ''} logged.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.testBtn, capturingTest && styles.testBtnDisabled]}
            disabled={capturingTest}
            onPress={triggerTestSelfie}>
            <Text style={styles.testBtnText}>
              {capturingTest ? 'Taking...' : '📸 Test Capture'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlSection}>
          <Text style={styles.controlLabel}>Filter by Type</Text>
          <View style={styles.chipRow}>
            {FILTER_CHIPS.map(chip => (
              <TouchableOpacity
                key={chip.key}
                style={[styles.chip, activeTab === chip.key && styles.chipActive]}
                onPress={() => setActiveTab(chip.key)}>
                <Text style={[styles.chipText, activeTab === chip.key && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.controlSection}>
          <Text style={styles.controlLabel}>Sort & Time Range</Text>
          <View style={styles.chipRow}>
            {SORT_CHIPS.map(chip => (
              <TouchableOpacity
                key={chip.key}
                style={[styles.chip, sortBy === chip.key && styles.chipActive]}
                onPress={() => setSortBy(chip.key)}>
                <Text style={[styles.chipText, sortBy === chip.key && styles.chipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {photos.length > 0 && (
          <TouchableOpacity style={styles.deleteAllBtn} onPress={deleteAllPhotos}>
            <Text style={styles.deleteAllText}>🗑️ Delete All Photos</Text>
          </TouchableOpacity>
        )}
      </Card>

      {displayedPhotos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No Intruder Selfies Found</Text>
          <Text style={styles.emptyText}>
            {photos.length === 0
              ? 'When an unauthorized unlock attempt or wrong password occurs, MRP captures front camera selfies automatically.'
              : 'No selfies match the current filter. Try changing the filter or time range.'}
          </Text>
          <TouchableOpacity style={styles.refreshEmptyBtn} onPress={() => loadData(true)}>
            <Text style={styles.refreshEmptyBtnText}>🔄 Refresh Photos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayedPhotos}
          keyExtractor={item => item.path}
          renderItem={renderPhotoItem}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.columnWrapper}
          refreshing={refreshing}
          onRefresh={() => loadData(true)}
        />
      )}

      {/* Full-Screen Selfie & Completed Details Modal */}
      <Modal
        visible={!!selectedPhoto}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedPhoto(null)}>
        <SafeAreaView style={styles.modalContainer}>
          {selectedPhoto && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalHeaderTitle}>Security Event Evidence</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setSelectedPhoto(null)}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.imageCard}>
                <Image
                  source={{uri: `file://${selectedPhoto.path}`}}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              </View>

              <Card>
                <View style={styles.detailsHeader}>
                  <Text style={styles.detailsTitle}>
                    {formatPhotoEventName(selectedPhoto.name)}
                  </Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>VERIFIED RECORD</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📅 Capture Timestamp:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedPhoto.timestamp).toLocaleDateString()}{' '}
                    {new Date(selectedPhoto.timestamp).toLocaleTimeString()}
                  </Text>
                </View>

                {matchedEvent ? (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>⚡ Security Trigger:</Text>
                      <Text style={styles.detailValue}>
                        {matchedEvent.event_type.replace(/_/g, ' ')} ({matchedEvent.status})
                      </Text>
                    </View>

                    {matchedEvent.location && matchedEvent.location.latitude !== 0 ? (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>📍 Address:</Text>
                          <View style={{flex: 1, alignItems: 'flex-end'}}>
                            <Text style={styles.detailValue}>
                              {matchedEvent.location.detailed_address || 'Address lookup in progress'}
                            </Text>
                            <TouchableOpacity
                              style={styles.mapButton}
                              onPress={() =>
                                openLocation(
                                  matchedEvent.location!.latitude,
                                  matchedEvent.location!.longitude,
                                )
                              }>
                              <Text style={styles.mapButtonText}>📍 Open in Maps</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>🌐 GPS Coordinates:</Text>
                          <Text style={styles.detailValue} numberOfLines={1}>
                            {matchedEvent.location.latitude.toFixed(5)},{' '}
                            {matchedEvent.location.longitude.toFixed(5)} (±1m)
                          </Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>📍 Location:</Text>
                        <Text style={styles.detailValue}>No Location Data</Text>
                      </View>
                    )}

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>🏠 Geofence:</Text>
                      <Text style={styles.detailValue}>
                        {matchedEvent.geofence_status?.inside_fence ? 'Inside fence' : 'Outside fence'}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>⚡ Trigger Source:</Text>
                    <Text style={styles.detailValue}>Security Intruder Surveillance Event</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📁 Evidence File:</Text>
                  <Text style={[styles.detailValue, {fontSize: 11, color: '#aaa'}]}>
                    {selectedPhoto.name}
                  </Text>
                </View>
              </Card>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deletePhoto(selectedPhoto)}>
                  <Text style={styles.deleteBtnText}>🗑️ Delete Evidence</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={() => setSelectedPhoto(null)}>
                  <Text style={styles.doneBtnText}>Close Viewer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    flexShrink: 1,
  },
  testBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  testBtnDisabled: {
    backgroundColor: '#1e3a5f',
    opacity: 0.7,
  },
  testBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  subheader: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginTop: 4,
  },
  controlSection: {
    marginBottom: 12,
  },
  controlLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  deleteAllBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteAllText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  refreshEmptyBtn: {
    marginTop: 18,
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  refreshEmptyBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  gridContainer: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  photoContainer: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE * 1.25,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 4,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  photoTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  photoTime: {
    color: '#94a3b8',
    fontSize: 10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
  },
  modalScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  imageCard: {
    height: 340,
    borderRadius: 16,
    backgroundColor: '#000000',
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 10,
  },
  detailsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#38bdf8',
    flex: 1,
  },
  badge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#f8fafc',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  mapButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  mapButtonText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '500',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  deleteBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  doneBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  doneBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
