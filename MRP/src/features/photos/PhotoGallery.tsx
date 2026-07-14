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
import {Button} from '../../shared/components/Button';
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

const EVENT_ICONS: Record<string, string> = {
  WRONG_UNLOCK_ATTEMPT: '⚠️',
  UNLOCK_FAILED: '⚠️',
  WIFI_DISABLED: '📶',
  WIFI_TOGGLE: '📶',
  AIRPLANE_MODE_ENABLED: '✈️',
  SIM_CHANGE: '🔄',
  USB_CONNECTED: '💻',
  DEFAULT: '📷',
};

export function PhotoGallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'WRONG_UNLOCK' | 'WRONG_PASSWORD' | 'TEST'>('ALL');
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

  const filteredPhotos = photos.filter(p => {
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
    return (
      <TouchableOpacity
        style={styles.photoContainer}
        activeOpacity={0.8}
        onPress={() => setSelectedPhoto(item)}
        onLongPress={() => deletePhoto(item)}>
        <Image source={{uri: `file://${item.path}`}} style={styles.photo} />
        <View style={styles.photoOverlay}>
          <Text style={styles.photoTitle} numberOfLines={1}>
            {eventTitle}
          </Text>
          <Text style={styles.photoTime}>
            {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const matchedEvent = selectedPhoto ? findMatchingEvent(selectedPhoto) : null;

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.header}>📷 Intruder Selfie Evidence</Text>
          <TouchableOpacity
            style={styles.testBtn}
            disabled={capturingTest}
            onPress={triggerTestSelfie}>
            <Text style={styles.testBtnText}>
              {capturingTest ? 'Taking...' : '📸 Test Capture'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subheader}>
          {photos.length} total security capture{photos.length !== 1 ? 's' : ''} logged. Select a category below or tap any selfie to inspect full evidence.
        </Text>

        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterChip, activeTab === 'ALL' && styles.filterChipActive]}
            onPress={() => setActiveTab('ALL')}>
            <Text style={[styles.filterChipText, activeTab === 'ALL' && styles.filterChipTextActive]}>
              All ({photos.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, activeTab === 'WRONG_UNLOCK' && styles.filterChipActive]}
            onPress={() => setActiveTab('WRONG_UNLOCK')}>
            <Text style={[styles.filterChipText, activeTab === 'WRONG_UNLOCK' && styles.filterChipTextActive]}>
              Unlock Attempts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, activeTab === 'WRONG_PASSWORD' && styles.filterChipActive]}
            onPress={() => setActiveTab('WRONG_PASSWORD')}>
            <Text style={[styles.filterChipText, activeTab === 'WRONG_PASSWORD' && styles.filterChipTextActive]}>
              Wrong Password
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, activeTab === 'TEST' && styles.filterChipActive]}
            onPress={() => setActiveTab('TEST')}>
            <Text style={[styles.filterChipText, activeTab === 'TEST' && styles.filterChipTextActive]}>
              Test / Network
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {filteredPhotos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No Intruder Selfies Found</Text>
          <Text style={styles.emptyText}>
            {activeTab === 'ALL'
              ? 'When an unauthorized unlock attempt or wrong password occurs, MRP captures front camera selfies automatically.'
              : `No selfies found for category "${activeTab === 'WRONG_UNLOCK' ? 'Unlock Attempts' : activeTab === 'WRONG_PASSWORD' ? 'Wrong Password' : 'Test Selfies'}".`}
          </Text>
          <TouchableOpacity
            style={styles.refreshEmptyBtn}
            onPress={() => loadData(true)}>
            <Text style={styles.refreshEmptyBtnText}>🔄 Refresh Photos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredPhotos}
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
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={styles.detailValue}>
                              {matchedEvent.location.detailed_address || 'Address lookup in progress'}
                            </Text>
                            <TouchableOpacity
                              style={styles.mapButton}
                              onPress={() => openLocation(matchedEvent.location!.latitude, matchedEvent.location!.longitude)}>
                              <Text style={styles.mapButtonText}>📍 Open in Maps</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>🌐 GPS Coordinates:</Text>
                          <Text style={styles.detailValue}>
                            {matchedEvent.location.latitude.toFixed(5)}, {matchedEvent.location.longitude.toFixed(5)} (±{Math.round(matchedEvent.location.accuracy_meters)}m)
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
    alignItems: 'center',
    marginBottom: 6,
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  testBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
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
    marginBottom: 12,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  filterChip: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  filterChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
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
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  badge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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