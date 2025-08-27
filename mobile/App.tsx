import React, { useEffect } from 'react';
import { StatusBar, View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from '@/navigation';
import { useAuth, useGlobalState } from '@/store';

// Loading screen component
function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingTitle}>🎵 MusicEZ</Text>
      <Text style={styles.loadingText}>Initializing...</Text>
    </View>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, initialize } = useAuth();
  const { isFirstLaunch } = useGlobalState();

  // Initialize authentication state from storage
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <LoadingScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <NavigationContainer>
        <RootNavigator isAuthenticated={isAuthenticated} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666666',
  },
});
