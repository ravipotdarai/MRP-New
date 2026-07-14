import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity} from 'react-native';
import {Card} from '../../shared/components/Card';
import mrpmModule, {MonitoringEvent} from '../../shared/hooks/useNativeBridge';

const EVENT_ICONS: Record<string, string> = {
  WRONG_PASSWORD: '🔐',
  WRONG_BIOMETRIC: '👆',
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
  SIM_REMOVED: '📤',
  SIM_INSERTED: '📥',
  FACTORY_RESET: '⚠️',
  DEVICE_BOOT: '🔄',
  USB_CONNECTED: '🔌',
  USB_DISCONNECTED: '🚫',
};

export function EventTimeline() {
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    try {
      const result = await mrpmModule.getEvents();
      const sorted = [...result].sort((a, b) => b.timestamp - a.timestamp);
      setEvents(sorted);
    } catch (e) {
      console.error('Failed to load events:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  const renderEvent = ({item}: {item: MonitoringEvent}) => (
    <TouchableOpacity style={styles.eventItem}>
      <Text style={styles.eventIcon}>{EVENT_ICONS[item.type] || '📋'}</Text>
      <View style={styles.eventContent}>
        <Text style={styles.eventType}>{formatEventType(item.type)}</Text>
        <Text style={styles.eventDescription}>
          {item.metadata.description || 'No description'}
        </Text>
        <Text style={styles.eventTime}>
          {new Date(item.timestamp).toLocaleString()}
        </Text>
      </View>
      <View style={[styles.severityBadge, {backgroundColor: getSeverityColor(item.severity)}]}>
        <Text style={styles.severityText}>{item.severity}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Card>
        <Text style={styles.header}>Event Timeline</Text>
        <Text style={styles.subheader}>{events.length} events captured</Text>
      </Card>

      {loading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No events yet</Text>
          <Text style={styles.emptySubtext}>
            Events will appear here when monitoring detects activity
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEvent}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return '#F44336';
    case 'HIGH':
      return '#FF9800';
    case 'MEDIUM':
      return '#FFC107';
    case 'LOW':
      return '#4CAF50';
    default:
      return '#9E9E9E';
  }
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
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  eventIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  eventDescription: {
    fontSize: 14,
    color: '#757575',
    marginTop: 2,
  },
  eventTime: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 4,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
});