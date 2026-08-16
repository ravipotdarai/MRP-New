import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  SafeAreaView,
  Linking,
  AppState,
  RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {FlashList} from '@shopify/flash-list';
import {Card} from '../../shared/components/Card';
import mrpmModule, {Photo} from '../../shared/hooks/useNativeBridge';
import {findMatchingEventForPhoto} from '../../shared/utils/selfieMatcher';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

const {width, height: WINDOW_HEIGHT} = Dimensions.get('window');
const COLS = 3;
const GRID_PAD = 12;
const GRID_GAP = 6;
const PHOTO_SIZE = (width - 32 - GRID_PAD * 2 - GRID_GAP * (COLS - 1)) / COLS;
const CONTROLS_MAX = Math.round(WINDOW_HEIGHT * 0.32);
const MODAL_ACTIONS_HEIGHT = 76;

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
  metadata?: Record<string, any>;
}

type SortOption = 'NEWEST' | 'OLDEST' | 'MONTH' | 'WEEK' | 'DAY';
type PhotoTypeFilter =
  | 'ALL'
  | 'WRONG_UNLOCK'
  | 'WRONG_PASSWORD'
  | 'WRONG_BIOMETRIC'
  | 'WIFI'
  | 'SIM'
  | 'SCREEN'
  | 'TEST'
  | 'OTHER';
type GroupBy = 'NONE' | 'WEEK' | 'MONTH';

const DAY_MS = 24 * 60 * 60 * 1000;

function classifyPhotoType(filename: string): Exclude<PhotoTypeFilter, 'ALL'> {
  const upper = (filename || '').toUpperCase();
  if (
    upper.includes('TEST_PHOTO') ||
    upper.includes('TEST_CAPTURE') ||
    upper.includes('TEST_SELFIE') ||
    upper.includes('TEST_BULLETPROOF')
  ) {
    return 'TEST';
  }
  if (upper.includes('WRONG_UNLOCK')) return 'WRONG_UNLOCK';
  if (upper.includes('WRONG_PASSWORD')) return 'WRONG_PASSWORD';
  if (upper.includes('WRONG_BIOMETRIC') || upper.includes('BIOMETRIC')) {
    return 'WRONG_BIOMETRIC';
  }
  if (upper.includes('WIFI')) return 'WIFI';
  if (upper.includes('SIM')) return 'SIM';
  if (
    upper.includes('SCREEN_LOCK') ||
    upper.includes('SCREEN_UNLOCK') ||
    upper.includes('UNLOCK_FAILED')
  ) {
    return 'SCREEN';
  }
  return 'OTHER';
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMonday(ts: number): number {
  const d = new Date(startOfLocalDay(ts));
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.getTime();
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatWeekLabel(weekStart: number): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = {month: 'short', day: 'numeric'};
  return `Week of ${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(
    undefined,
    opts,
  )}`;
}

function formatMonthLabel(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

const TYPE_FILTER_DEFS: {key: PhotoTypeFilter; label: string}[] = [
  {key: 'ALL', label: 'All'},
  {key: 'WRONG_UNLOCK', label: 'Unlock Attempts'},
  {key: 'WRONG_PASSWORD', label: 'Wrong Password'},
  {key: 'WRONG_BIOMETRIC', label: 'Biometric'},
  {key: 'WIFI', label: 'Wi-Fi'},
  {key: 'SIM', label: 'SIM'},
  {key: 'SCREEN', label: 'Screen'},
  {key: 'TEST', label: 'Test'},
  {key: 'OTHER', label: 'Other'},
];

function formatPhotoEventName(filename: string) {
  const upper = (filename || '').toUpperCase();
  if (
    upper.includes('TEST_PHOTO') ||
    upper.includes('TEST_CAPTURE') ||
    upper.includes('TEST_BULLETPROOF') ||
    upper.includes('TEST_SELFIE')
  ) {
    return 'Test Photo';
  }
  if (upper.includes('WRONG_UNLOCK_ATTEMPT')) return 'Wrong Unlock Attempt';
  if (upper.includes('WRONG_PASSWORD')) return 'Wrong Password';
  if (upper.includes('WIFI_ENABLED')) return 'Wi-Fi Enabled Capture';
  const nameWithoutExt = (filename || '').replace(/\.jpe?g$/i, '');
  const parts = nameWithoutExt.split('_');
  if (parts.length >= 3) {
    const eventParts = parts.slice(0, -2);
    return eventParts.join(' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return nameWithoutExt.replace(/_/g, ' ').toUpperCase();
}

type GalleryRow =
  | {kind: 'header'; key: string; label: string; photos: Photo[]}
  | {kind: 'row'; key: string; photos: Photo[]};

function chunkPhotos(list: Photo[], size: number): Photo[][] {
  const rows: Photo[][] = [];
  for (let i = 0; i < list.length; i += size) {
    rows.push(list.slice(i, i + size));
  }
  return rows;
}

const PhotoThumb = React.memo(function PhotoThumb({
  item,
  eventTitle,
  selectMode,
  isSelected,
  styles,
  onPress,
  onLongPress,
}: {
  item: Photo;
  eventTitle: string;
  selectMode: boolean;
  isSelected: boolean;
  styles: ReturnType<typeof createStyles>;
  onPress: (photo: Photo) => void;
  onLongPress: (photo: Photo) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.photoContainer, isSelected && styles.photoContainerSelected]}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}>
      <Image
        source={{uri: `file://${item.path}`}}
        style={styles.photo}
        resizeMode="cover"
        fadeDuration={0}
      />
      {selectMode ? (
        <View style={[styles.selectCheck, isSelected && styles.selectCheckOn]}>
          <Text style={styles.selectCheckText}>{isSelected ? '✓' : ''}</Text>
        </View>
      ) : null}
      <View style={styles.photoOverlay}>
        <Text style={styles.photoTitle} numberOfLines={1}>
          {eventTitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export function PhotoGallery() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [activeTab, setActiveTab] = useState<PhotoTypeFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');
  const [capturingTest, setCapturingTest] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('NONE');

  const openLocation = (lat: number, lng: number) => {
    const url = `https://maps.google.com/?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open maps');
    });
  };

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const photoList = await mrpmModule.getPhotos().catch(() => []);
      const normalizedPhotos: Photo[] = (Array.isArray(photoList) ? photoList : []).map((p: any) => {
        const fileName = p.name || p.path?.split('/').pop() || p.path?.split('\\').pop() || 'UNKNOWN_EVENT.jpg';
        return {
          ...p,
          name: fileName,
          eventType: formatPhotoEventName(fileName),
        };
      });
      setPhotos(normalizedPhotos);
    } catch (e) {
      console.error('Failed to load gallery data:', e);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  const openPhoto = useCallback(async (photo: Photo) => {
    setSelectedPhoto(photo);
    if (timelineEvents.length > 0) return;
    try {
      const eventsList = await mrpmModule.getTimeline().catch(() => []);
      setTimelineEvents(Array.isArray(eventsList) ? eventsList : []);
    } catch {
      /* viewer still works without timeline match */
    }
  }, [timelineEvents.length]);

  // Refresh only when Gallery is opened / focused — no continuous polling
  useFocusEffect(
    useCallback(() => {
      loadData(false);
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') {
          loadData(false);
        }
      });
      return () => sub.remove();
    }, [loadData]),
  );
  const triggerTestSelfie = async () => {
    try {
      setCapturingTest(true);
      Alert.alert(
        'Testing Front Camera',
        'Requesting immediate front camera selfie capture for verification...',
      );
      await mrpmModule.testPhotoCapture('TEST_PHOTO');
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
              setSelectedPaths(prev => prev.filter(p => p !== photo.path));
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
              setSelectedPaths([]);
              setSelectMode(false);
            } catch (e) {
              console.error('Failed to delete all photos:', e);
            }
          },
        },
      ],
    );
  };

  const toggleSelectMode = useCallback((on?: boolean) => {
    setSelectMode(prev => {
      const next = on ?? !prev;
      if (next) {
        setGroupBy(g => (g === 'NONE' ? 'WEEK' : g));
      } else {
        setSelectedPaths([]);
      }
      return next;
    });
  }, []);

  const togglePhotoSelected = useCallback((path: string) => {
    setSelectedPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path],
    );
  }, []);

  // Apply type filter + time-range filter + sort order
  const displayedPhotos = useMemo(() => {
    let result = photos.filter(p => {
      if (activeTab === 'ALL') return true;
      return classifyPhotoType(p.name) === activeTab;
    });

    const now = Date.now();
    if (sortBy === 'DAY') {
      result = result.filter(p => now - p.timestamp < DAY_MS);
    } else if (sortBy === 'WEEK') {
      result = result.filter(p => now - p.timestamp < 7 * DAY_MS);
    } else if (sortBy === 'MONTH') {
      result = result.filter(p => now - p.timestamp < 30 * DAY_MS);
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'OLDEST') return a.timestamp - b.timestamp;
      return b.timestamp - a.timestamp;
    });
  }, [photos, activeTab, sortBy]);

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<PhotoTypeFilter, number>> = {ALL: photos.length};
    for (const p of photos) {
      const key = classifyPhotoType(p.name);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [photos]);

  const photoGroups = useMemo(() => {
    if (groupBy === 'NONE') {
      return [{key: 'all', label: '', photos: displayedPhotos}];
    }
    const buckets = new Map<number, Photo[]>();
    for (const photo of displayedPhotos) {
      const key =
        groupBy === 'WEEK' ? startOfWeekMonday(photo.timestamp) : startOfMonth(photo.timestamp);
      const list = buckets.get(key) || [];
      list.push(photo);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([key, groupPhotos]) => ({
        key: String(key),
        label: groupBy === 'WEEK' ? formatWeekLabel(key) : formatMonthLabel(key),
        photos: groupPhotos,
      }));
  }, [displayedPhotos, groupBy]);

  const selectPaths = (paths: string[]) => {
    setSelectedPaths(prev => Array.from(new Set([...prev, ...paths])));
  };

  const selectGroup = (groupPhotos: Photo[]) => {
    const paths = groupPhotos.map(p => p.path);
    const allSelected = paths.every(p => selectedPaths.includes(p));
    if (allSelected) {
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
    } else {
      selectPaths(paths);
    }
  };

  const deleteSelectedPhotos = () => {
    const count = selectedPaths.length;
    if (count === 0) return;
    Alert.alert(
      'Delete Selected Photos',
      `Permanently delete ${count} selected photo${count === 1 ? '' : 's'}?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete Selected',
          style: 'destructive',
          onPress: async () => {
            const paths = [...selectedPaths];
            try {
              await Promise.all(paths.map(path => mrpmModule.deletePhoto(path).catch(() => false)));
              const removed = new Set(paths);
              setPhotos(prev => prev.filter(p => !removed.has(p.path)));
              if (selectedPhoto && removed.has(selectedPhoto.path)) {
                setSelectedPhoto(null);
              }
              setSelectedPaths([]);
              setSelectMode(false);
            } catch (e) {
              console.error('Failed to delete selected photos:', e);
            }
          },
        },
      ],
    );
  };

  const listRows = useMemo<GalleryRow[]>(() => {
    const rows: GalleryRow[] = [];
    for (const group of photoGroups) {
      if (group.label) {
        rows.push({kind: 'header', key: `h-${group.key}`, label: group.label, photos: group.photos});
      }
      chunkPhotos(group.photos, COLS).forEach((photosRow, i) => {
        rows.push({kind: 'row', key: `r-${group.key}-${i}`, photos: photosRow});
      });
    }
    return rows;
  }, [photoGroups]);

  const onThumbPress = useCallback(
    (photo: Photo) => {
      if (selectMode) {
        togglePhotoSelected(photo.path);
      } else {
        openPhoto(photo);
      }
    },
    [selectMode, openPhoto, togglePhotoSelected],
  );

  const onThumbLongPress = useCallback((photo: Photo) => {
    if (!selectMode) {
      toggleSelectMode(true);
      setSelectedPaths([photo.path]);
    } else {
      togglePhotoSelected(photo.path);
    }
  }, [selectMode, togglePhotoSelected, toggleSelectMode]);

  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const matchedEvent = selectedPhoto
    ? findMatchingEventForPhoto(selectedPhoto, timelineEvents)
    : null;

  const FILTER_CHIPS = TYPE_FILTER_DEFS.filter(
    chip => chip.key === 'ALL' || (typeCounts[chip.key] || 0) > 0,
  ).map(chip => ({
    ...chip,
    label:
      chip.key === 'ALL'
        ? `All (${photos.length})`
        : `${chip.label} (${typeCounts[chip.key] || 0})`,
  }));

  const SORT_CHIPS: {key: SortOption; label: string}[] = [
    {key: 'NEWEST', label: 'Newest'},
    {key: 'OLDEST', label: 'Oldest'},
    {key: 'DAY', label: 'Today'},
    {key: 'WEEK', label: 'This Week'},
    {key: 'MONTH', label: 'This Month'},
  ];

  const GROUP_CHIPS: {key: GroupBy; label: string}[] = [
    {key: 'NONE', label: 'None'},
    {key: 'WEEK', label: 'Weeks'},
    {key: 'MONTH', label: 'Months'},
  ];

  return (
    <View style={styles.container}>
      <View style={styles.controlsShell}>
      <Card style={{marginHorizontal: 0, marginVertical: 0, padding: 12}}>
        <TouchableOpacity
          style={styles.controlsHeader}
          onPress={() => setControlsExpanded(v => !v)}
          activeOpacity={0.7}>
          <View style={styles.controlsHeaderText}>
            <Text style={styles.headerLabel}>CONTROLS</Text>
            <Text style={styles.subheader}>
              {photos.length} capture{photos.length !== 1 ? 's' : ''}
              {selectMode ? ` · ${selectedPaths.length} selected` : ''}
              {!controlsExpanded ? ' · Filters' : ''}
            </Text>
          </View>
          <View style={styles.chevronBtn}>
            <Text style={styles.chevron}>{controlsExpanded ? '▾' : '▸'}</Text>
          </View>
        </TouchableOpacity>

        {selectMode ? (
          <View style={styles.selectBar}>
            <TouchableOpacity style={styles.selectBarBtn} onPress={() => toggleSelectMode(false)}>
              <Text style={styles.selectBarBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.selectBarBtn,
                styles.selectBarDelete,
                selectedPaths.length === 0 && styles.controlButtonDisabled,
              ]}
              disabled={selectedPaths.length === 0}
              onPress={deleteSelectedPhotos}>
              <Text style={styles.selectBarBtnText}>Delete ({selectedPaths.length})</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {controlsExpanded && (
          <ScrollView
            style={styles.controlsScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled">
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.controlButton, capturingTest && styles.controlButtonDisabled]}
                disabled={capturingTest}
                onPress={triggerTestSelfie}>
                <Text style={styles.controlButtonText}>
                  {capturingTest ? 'Taking...' : '📸 Test Capture'}
                </Text>
              </TouchableOpacity>
              {photos.length > 0 && (
                <TouchableOpacity style={styles.controlButton} onPress={deleteAllPhotos}>
                  <Text style={styles.controlButtonText}>🗑️ Delete All Photos</Text>
                </TouchableOpacity>
              )}
            </View>

            {photos.length > 0 && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.controlButton, selectMode && styles.controlButtonActive]}
                  onPress={() => toggleSelectMode()}>
                  <Text style={styles.controlButtonText}>
                    {selectMode ? 'Cancel Select' : '☑️ Select Photos'}
                  </Text>
                </TouchableOpacity>
                {selectMode ? (
                  <TouchableOpacity
                    style={[
                      styles.controlButton,
                      styles.deleteSelectedButton,
                      selectedPaths.length === 0 && styles.controlButtonDisabled,
                    ]}
                    disabled={selectedPaths.length === 0}
                    onPress={deleteSelectedPhotos}>
                    <Text style={styles.controlButtonText}>
                      🗑️ Delete Selected ({selectedPaths.length})
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {selectMode ? (
              <View style={styles.controlSection}>
                <Text style={styles.controlLabel}>Select</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => selectPaths(displayedPhotos.map(p => p.path))}>
                    <Text style={styles.chipText}>All visible</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => {
                      const now = Date.now();
                      selectPaths(
                        displayedPhotos
                          .filter(p => now - p.timestamp < 7 * DAY_MS)
                          .map(p => p.path),
                      );
                    }}>
                    <Text style={styles.chipText}>This week</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => {
                      const now = Date.now();
                      selectPaths(
                        displayedPhotos
                          .filter(p => now - p.timestamp < 30 * DAY_MS)
                          .map(p => p.path),
                      );
                    }}>
                    <Text style={styles.chipText}>This month</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.chip} onPress={() => setSelectedPaths([])}>
                    <Text style={styles.chipText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

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

            <View style={styles.controlSection}>
              <Text style={styles.controlLabel}>Group by</Text>
              <View style={styles.chipRow}>
                {GROUP_CHIPS.map(chip => (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.chip, groupBy === chip.key && styles.chipActive]}
                    onPress={() => setGroupBy(chip.key)}>
                    <Text style={[styles.chipText, groupBy === chip.key && styles.chipTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </Card>
      </View>

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
        <View style={styles.gridFlex}>
        <FlashList
          data={listRows}
          extraData={selectedPaths}
          estimatedItemSize={PHOTO_SIZE + 10}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              tintColor={colors.sky}
              colors={[colors.sky]}
            />
          }
          renderItem={({item}) => {
            if (item.kind === 'header') {
              const allOn = item.photos.every(p => selectedSet.has(p.path));
              return (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>
                    {item.label} · {item.photos.length}
                  </Text>
                  {selectMode ? (
                    <TouchableOpacity
                      onPress={() => selectGroup(item.photos)}
                      style={styles.groupSelectBtn}>
                      <Text style={styles.groupSelectBtnText}>
                        {allOn ? 'Deselect' : 'Select'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            }
            return (
              <View style={styles.photoRow}>
                {item.photos.map(photo => (
                  <PhotoThumb
                    key={photo.path}
                    item={photo}
                    eventTitle={photo.eventType || formatPhotoEventName(photo.name)}
                    selectMode={selectMode}
                    isSelected={selectedSet.has(photo.path)}
                    styles={styles}
                    onPress={onThumbPress}
                    onLongPress={onThumbLongPress}
                  />
                ))}
              </View>
            );
          }}
        />
        </View>
      )}

      <Modal
        visible={!!selectedPhoto}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setSelectedPhoto(null)}
        statusBarTranslucent>
        <View style={styles.modalRoot}>
          <SafeAreaView style={styles.modalContainer}>
            {selectedPhoto ? (
              <View style={styles.modalBody}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                    Security Event Evidence
                  </Text>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setSelectedPhoto(null)}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.modalScrollFlex}
                  contentContainerStyle={styles.modalScroll}
                  showsVerticalScrollIndicator
                  persistentScrollbar
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  bounces={false}>
                  <View style={styles.imageCard}>
                    <Image
                      source={{uri: `file://${selectedPhoto.path}`}}
                      style={styles.fullImage}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={styles.detailsCard}>
                    <Text style={styles.detailsTitle}>
                      {formatPhotoEventName(selectedPhoto.name)}
                    </Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>VERIFIED</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>📅 Capture Timestamp</Text>
                      <Text style={styles.detailValue}>
                        {new Date(selectedPhoto.timestamp).toLocaleDateString()}{' '}
                        {new Date(selectedPhoto.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>

                    {matchedEvent ? (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>⚡ Security Trigger</Text>
                          <Text style={styles.detailValue}>
                            {String(matchedEvent.event_type || '').replace(/_/g, ' ')}
                            {matchedEvent.status ? ` (${matchedEvent.status})` : ''}
                          </Text>
                        </View>

                        {(() => {
                          const loc = matchedEvent.location;
                          const lat = Number(loc?.latitude);
                          const lng = Number(loc?.longitude);
                          const hasCoords =
                            !!loc && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
                          if (!hasCoords) {
                            return (
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>📍 Location</Text>
                                <Text style={styles.detailValue}>No Location Data</Text>
                              </View>
                            );
                          }
                          return (
                            <>
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>📍 Address</Text>
                                <Text style={styles.detailValue}>
                                  {loc!.detailed_address || 'Address lookup in progress'}
                                </Text>
                                <TouchableOpacity
                                  style={styles.mapButton}
                                  onPress={() => openLocation(lat, lng)}>
                                  <Text style={styles.mapButtonText}>📍 Open in Maps</Text>
                                </TouchableOpacity>
                              </View>
                              <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>🌐 GPS Coordinates</Text>
                                <Text style={styles.detailValue}>
                                  {lat.toFixed(5)}, {lng.toFixed(5)}
                                  {loc!.accuracy_meters
                                    ? ` (±${Math.round(Number(loc!.accuracy_meters))}m)`
                                    : ''}
                                </Text>
                              </View>
                            </>
                          );
                        })()}

                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>🏠 Geofence</Text>
                          <Text style={styles.detailValue}>
                            {matchedEvent.geofence_status?.inside_fence
                              ? `Inside ${
                                  matchedEvent.metadata?.geofence_name ||
                                  matchedEvent.geofence_status?.fence_id ||
                                  'zone'
                                }`
                              : matchedEvent.metadata?.geofence_distance_m != null &&
                                  Number.isFinite(Number(matchedEvent.metadata.geofence_distance_m))
                                ? `Away · ${Math.round(Number(matchedEvent.metadata.geofence_distance_m))}m`
                                : 'Away'}
                          </Text>
                          {matchedEvent.metadata?.geofence_distance_m != null &&
                          Number.isFinite(Number(matchedEvent.metadata.geofence_distance_m)) ? (
                            <Text style={styles.detailPath}>
                              Distance{' '}
                              {Math.round(Number(matchedEvent.metadata.geofence_distance_m))} m
                            </Text>
                          ) : null}
                        </View>
                      </>
                    ) : (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>⚡ Trigger Source</Text>
                        <Text style={styles.detailValue}>
                          Security Intruder Surveillance Event
                        </Text>
                      </View>
                    )}

                    <View style={[styles.detailRow, styles.detailRowLast]}>
                      <Text style={styles.detailLabel}>📁 Evidence File</Text>
                      <Text style={styles.detailValue} selectable>
                        {selectedPhoto.name}
                      </Text>
                      <Text style={styles.detailPath} selectable>
                        {selectedPhoto.path}
                      </Text>
                    </View>
                  </View>
                </ScrollView>

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
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
    },
    controlsShell: {
      flexShrink: 0,
    },
    controlsScroll: {
      maxHeight: CONTROLS_MAX,
    },
    selectBar: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    selectBarBtn: {
      flex: 1,
      backgroundColor: colors.skyDark,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    selectBarDelete: {
      backgroundColor: colors.red,
    },
    selectBarBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
    },
    gridFlex: {
      flex: 1,
      minHeight: 180,
      marginTop: 8,
    },
    headerLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    controlsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
    },
    controlsHeaderText: {
      flex: 1,
      paddingRight: 12,
    },
    chevronBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.skySoft,
      borderWidth: 1,
      borderColor: colors.sky,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevron: {
      color: colors.sky,
      fontSize: 16,
      fontWeight: '800',
      lineHeight: 18,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
      marginTop: 8,
    },
    controlButton: {
      flex: 1,
      backgroundColor: colors.skyDark,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    controlButtonDisabled: {
      backgroundColor: colors.surfaceAlt,
      opacity: 0.7,
    },
    controlButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    subheader: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 0,
    },
    controlSection: {
      marginBottom: 12,
    },
    controlLabel: {
      fontSize: 11,
      color: colors.textMuted,
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
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    chipActive: {
      backgroundColor: colors.skyDark,
      borderColor: colors.sky,
    },
    chipText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    chipTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    gridContainer: {
      paddingTop: 12,
      paddingBottom: 24,
    },
    controlButtonActive: {
      backgroundColor: colors.sky,
    },
    deleteSelectedButton: {
      backgroundColor: colors.red,
    },
    photoGroup: {
      marginBottom: 8,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      marginTop: 4,
    },
    groupHeaderText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      flex: 1,
      paddingRight: 8,
    },
    groupSelectBtn: {
      backgroundColor: colors.skySoft,
      borderWidth: 1,
      borderColor: colors.sky,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    groupSelectBtnText: {
      color: colors.sky,
      fontSize: 12,
      fontWeight: '700',
    },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    photoRow: {
      flexDirection: 'row',
      gap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    photoContainer: {
      width: PHOTO_SIZE,
      height: PHOTO_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photoContainerSelected: {
      borderColor: colors.sky,
      borderWidth: 2,
    },
    selectCheck: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectCheckOn: {
      backgroundColor: colors.sky,
      borderColor: colors.sky,
    },
    selectCheckText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 16,
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
      backgroundColor: 'rgba(0, 0, 0, 0.78)',
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    photoTitle: {
      color: '#f8fafc',
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 0,
    },
    photoTime: {
      color: '#cbd5e1',
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
      color: colors.textPrimary,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    refreshEmptyBtn: {
      marginTop: 18,
      backgroundColor: colors.skyDark,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
    },
    refreshEmptyBtnText: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    modalRoot: {
      flex: 1,
      height: WINDOW_HEIGHT,
      backgroundColor: colors.bg,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    modalBody: {
      flex: 1,
      flexDirection: 'column',
      overflow: 'hidden',
    },
    modalScrollFlex: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
    },
    modalScroll: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 16,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      marginTop: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.surface,
      flexGrow: 0,
      flexShrink: 0,
    },
    modalHeaderTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      flex: 1,
    },
    closeBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
    },
    closeBtnText: {
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: 'bold',
    },
    imageCard: {
      height: 180,
      borderRadius: 16,
      backgroundColor: '#000000',
      overflow: 'hidden',
      marginTop: 8,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fullImage: {
      width: '100%',
      height: '100%',
    },
    detailsCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailsTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.skySoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.sky,
      marginBottom: 16,
    },
    badgeText: {
      color: colors.sky,
      fontSize: 11,
      fontWeight: '800',
    },
    detailRow: {
      marginBottom: 16,
    },
    detailRowLast: {
      marginBottom: 0,
    },
    detailLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginBottom: 4,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    detailValue: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '600',
      lineHeight: 22,
    },
    detailPath: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 6,
      fontFamily: 'monospace',
    },
    mapButton: {
      backgroundColor: colors.skySoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      marginTop: 8,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.sky,
    },
    mapButtonText: {
      color: colors.sky,
      fontSize: 12,
      fontWeight: '700',
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
      minHeight: MODAL_ACTIONS_HEIGHT,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.surface,
      flexGrow: 0,
      flexShrink: 0,
      elevation: 8,
      zIndex: 10,
    },
    deleteBtn: {
      flex: 1,
      backgroundColor: colors.red,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginRight: 8,
    },
    deleteBtnText: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    doneBtn: {
      flex: 1,
      backgroundColor: colors.skyDark,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginLeft: 8,
    },
    doneBtnText: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
  });
}
