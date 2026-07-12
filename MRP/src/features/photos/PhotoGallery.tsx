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
} from 'react-native';
import {Card} from '../../shared/components/Card';
import {Button} from '../../shared/components/Button';
import mrpmModule, {Photo} from '../../shared/hooks/useNativeBridge';

const {width} = Dimensions.get('window');
const PHOTO_SIZE = (width - 48) / 2;

export function PhotoGallery() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPhotos = async () => {
    try {
      const result = await mrpmModule.getPhotos();
      setPhotos(result);
    } catch (e) {
      console.error('Failed to load photos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos();
    // Refresh when screen comes into focus
    const interval = setInterval(loadPhotos, 5000);
    return () => clearInterval(interval);
  }, []);

  const deletePhoto = (photo: Photo) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await mrpmModule.deletePhoto(photo.path);
              setPhotos(prev => prev.filter(p => p.path !== photo.path));
            } catch (e) {
              console.error('Failed to delete photo:', e);
            }
          },
        },
      ],
    );
  };

  const renderPhoto = ({item}: {item: Photo}) => (
    <TouchableOpacity
      style={styles.photoContainer}
      onPress={() => {
        // Could open full-screen viewer
        Alert.alert('Photo Details', `Captured: ${new Date(item.timestamp).toLocaleString()}`);
      }}
      onLongPress={() => deletePhoto(item)}>
      <Image source={{uri: `file://${item.path}`}} style={styles.photo} />
      <View style={styles.photoOverlay}>
        <Text style={styles.photoTime}>
          {new Date(item.timestamp).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Card>
        <Text style={styles.header}>Captured Photos</Text>
        <Text style={styles.subheader}>
          {photos.length} photo{photos.length !== 1 ? 's' : ''} captured
        </Text>
      </Card>

      {loading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : photos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No photos captured yet</Text>
          <Text style={styles.emptySubtext}>
            Photos will appear here when monitoring detects events
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={item => item.path}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {photos.length > 0 && (
        <Button
          title="Test Capture"
          onPress={async () => {
            await mrpmModule.takePhoto();
            loadPhotos();
          }}
          style={styles.testButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  subheader: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
  loading: {
    textAlign: 'center',
    marginTop: 40,
    color: '#757575',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#757575',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  photoContainer: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E0E0E0',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
  },
  photoTime: {
    color: '#FFF',
    fontSize: 10,
  },
  testButton: {
    margin: 16,
  },
});