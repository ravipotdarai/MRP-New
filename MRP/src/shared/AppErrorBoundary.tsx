import React, {Component, type ErrorInfo, type ReactNode} from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';

type Props = {children: ReactNode};
type State = {error: Error | null};

/**
 * Prevents a JS render throw from white-screening the whole app.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info?.componentStack);
  }

  private retry = () => this.setState({error: null});

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap} accessibilityRole="alert">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            MRP hit an unexpected error. You can try again without force-closing
            the app.
          </Text>
          <Text style={styles.detail} numberOfLines={4}>
            {this.state.error.message}
          </Text>
          <Pressable style={styles.btn} onPress={this.retry}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f1419',
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  detail: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: '#eab308',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: {
    color: '#0f1419',
    fontWeight: '700',
    fontSize: 15,
  },
});
