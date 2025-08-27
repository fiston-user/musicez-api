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

type Props = MainTabScreenProps<'Recommendations'>;

export default function RecommendationsScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>🤖 AI Recommendations</Text>
          <Text style={styles.welcomeDescription}>
            Get personalized music recommendations powered by OpenAI GPT-4
          </Text>
        </View>

        <View style={styles.placeholderSection}>
          <Text style={styles.sectionTitle}>AI Features Coming Soon:</Text>
          
          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>🎯 Smart Recommendations</Text>
            <Text style={styles.featureDescription}>
              AI analyzes musical attributes like tempo, key, energy, and mood to suggest similar tracks
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>⚡ Batch Processing</Text>
            <Text style={styles.featureDescription}>
              Get recommendations for multiple songs at once with dynamic concurrency
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>🧠 Learning Engine</Text>
            <Text style={styles.featureDescription}>
              Recommendations improve based on musical DNA analysis and user preferences
            </Text>
          </View>

          <View style={styles.demoSection}>
            <Text style={styles.demoTitle}>Demo Recommendation Card</Text>
            <View style={styles.recommendationCard}>
              <Text style={styles.songTitle}>🎵 Song Title</Text>
              <Text style={styles.artistName}>Artist Name</Text>
              <Text style={styles.recommendationReason}>
                "Similar tempo and energy to your liked tracks"
              </Text>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>Match Score:</Text>
                <Text style={styles.scoreValue}>92%</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.placeholderButton} disabled>
            <Text style={styles.placeholderButtonText}>Generate Recommendations (coming soon)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            This screen will integrate with the following API endpoints:
          </Text>
          <Text style={styles.apiEndpoint}>• POST /api/v1/recommendations</Text>
          <Text style={styles.apiEndpoint}>• POST /api/v1/recommendations/batch</Text>
          <Text style={styles.infoText} style={{ marginTop: 12 }}>
            Powered by OpenAI GPT-4 with intelligent caching and fuzzy matching
          </Text>
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
  demoSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  demoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 12,
  },
  recommendationCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 4,
  },
  artistName: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 8,
  },
  recommendationReason: {
    fontSize: 14,
    color: '#555555',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#666666',
    marginRight: 8,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1DB954',
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