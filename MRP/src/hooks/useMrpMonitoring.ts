import {useState, useEffect, useCallback} from 'react';
import MrpNative, {PhotoData} from '../native/MrpNative.types';

export function useMrpMonitoring() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    try {
      const photoList = await MrpNative.getPhotos();
      setPhotos(photoList);
    } catch (e) {
      console.error('Failed to load photos:', e);
    }
  }, []);

  const startMonitoring = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await MrpNative.startMonitoring();
      setIsMonitoring(true);
    } catch (e: any) {
      setError(e.message || 'Failed to start monitoring');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopMonitoring = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await MrpNative.stopMonitoring();
      setIsMonitoring(false);
    } catch (e: any) {
      setError(e.message || 'Failed to stop monitoring');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deletePhoto = useCallback(async (path: string) => {
    try {
      await MrpNative.deletePhoto(path);
      await loadPhotos();
    } catch (e) {
      console.error('Failed to delete photo:', e);
    }
  }, [loadPhotos]);

  const takePhoto = useCallback(async () => {
    try {
      await MrpNative.takePhoto();
    } catch (e) {
      console.error('Failed to take photo:', e);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  return {
    isMonitoring,
    photos,
    isLoading,
    error,
    startMonitoring,
    stopMonitoring,
    deletePhoto,
    takePhoto,
    refreshPhotos: loadPhotos,
  };
}