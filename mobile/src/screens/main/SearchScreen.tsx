import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainTabScreenProps } from '@/types/navigation';

type Props = MainTabScreenProps<'Search'>;

export default function SearchScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>🔍 Music Search</Text>
          <Text style={styles.welcomeDescription}>
            Discover new songs with our AI-powered search engine
          </Text>
        </View>

        <View style={styles.placeholderSection}>
          <Text style={styles.sectionTitle}>Search Features Coming Soon:</Text>
          
          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>🎵 Smart Song Search</Text>
            <Text style={styles.featureDescription}>
              Search by song title, artist, or lyrics with fuzzy matching
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>🎼 Enhanced Search</Text>
            <Text style={styles.featureDescription}>
              Get enriched results with Spotify metadata and audio features
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>⚡ Real-time Results</Text>
            <Text style={styles.featureDescription}>
              Fast search with Redis caching and PostgreSQL full-text search
            </Text>
          </View>

          <View style={styles.placeholderInput}>
            <Text style={styles.placeholderText}>Search input field (coming soon)</Text>
          </View>

          <TouchableOpacity style={styles.placeholderButton} disabled>
            <Text style={styles.placeholderButtonText}>Search (coming soon)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            This screen will integrate with the following API endpoints:
          </Text>
          <Text style={styles.apiEndpoint}>• GET /api/v1/songs/search</Text>
          <Text style={styles.apiEndpoint}>• GET /api/v1/songs/search/enhanced</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1DB954',
    marginBottom: 8,
  },
  welcomeDescription: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
  },
  placeholderSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 20,
  },
  featureCard: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1DB954',
    marginBottom: 6,
  },
  featureDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 20,
  },
  placeholderInput: {
    height: 56,
    borderWidth: 2,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  placeholderText: {
    color: '#8E8E93',
    fontSize: 14,
    fontStyle: 'italic',
  },
  placeholderButton: {
    backgroundColor: '#E5E5EA',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderButtonText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1DB954',
  },
  infoText: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 12,
    fontWeight: '500',
  },
  apiEndpoint: {
    fontSize: 13,
    color: '#1DB954',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});