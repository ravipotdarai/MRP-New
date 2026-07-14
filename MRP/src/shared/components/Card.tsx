import React from 'react';
import {View, Text, StyleSheet, ViewStyle} from 'react-native';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({title, children, style}: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b', // Obsidian Slate surface
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#334155', // subtle border
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 12,
  },
});