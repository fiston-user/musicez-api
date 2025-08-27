import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainTabScreenProps } from '@/types/navigation';
import { useAuth, useAuthWithApi, useGlobalState } from '@/store';

type Props = MainTabScreenProps<'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { logout, logoutLoading } = useAuthWithApi();
  const { appVersion } = useGlobalState();

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              // Navigation will happen automatically via store state change
            } catch (error) {
              console.error('Logout failed:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>👤 Profile</Text>
          <Text style={styles.welcomeDescription}>
            Manage your account and preferences
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Demo User'}</Text>
          <Text style={styles.userEmail}>{user?.email || 'demo@musicez.com'}</Text>
          <View style={styles.stateIndicator}>
            <Text style={styles.stateText}>✅ Connected to Zustand Store</Text>
            <Text style={styles.versionText}>App Version: {appVersion}</Text>
          </View>
        </View>

        <View style={styles.sectionsContainer}>
          <Text style={styles.sectionTitle}>Profile Features Coming Soon:</Text>
          
          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>🎵 Music Preferences</Text>
            <Text style={styles.featureDescription}>
              Set your favorite genres and customize recommendation settings
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>🔗 Spotify Integration</Text>
            <Text style={styles.featureDescription}>
              Connect your Spotify account to sync playlists and listening history
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureTitle}>📊 Statistics</Text>
            <Text style={styles.featureDescription}>
              View your music discovery stats and recommendation history
            </Text>
          </View>

          <View style={styles.menuSection}>
            <TouchableOpacity style={styles.menuItem} disabled>
              <Text style={styles.menuItemText}>🎶 Music Preferences</Text>
              <Text style={styles.menuItemChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} disabled>
              <Text style={styles.menuItemText}>🔗 Connect Spotify</Text>
              <Text style={styles.menuItemChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} disabled>
              <Text style={styles.menuItemText}>⚙️ Settings</Text>
              <Text style={styles.menuItemChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} disabled>
              <Text style={styles.menuItemText}>📊 Statistics</Text>
              <Text style={styles.menuItemChevron}>›</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.logoutButton, logoutLoading && styles.logoutButtonDisabled]} 
            onPress={handleLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            This screen will integrate with the following API endpoints:
          </Text>
          <Text style={styles.apiEndpoint}>• GET /api/v1/user/profile</Text>
          <Text style={styles.apiEndpoint}>• PUT /api/v1/user/profile</Text>
          <Text style={styles.apiEndpoint}>• GET /api/v1/auth/spotify/status</Text>
          <Text style={styles.apiEndpoint}>• POST /api/v1/auth/logout</Text>
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
  },
  profileCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    color: '#ffffff',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666666',
  },
  sectionsContainer: {
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
  menuSection: {
    marginTop: 20,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  menuItemChevron: {
    fontSize: 20,
    color: '#8E8E93',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 18,
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
  stateIndicator: {
    marginTop: 12,
    alignItems: 'center',
  },
  stateText: {
    fontSize: 12,
    color: '#1DB954',
    fontWeight: '500',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 10,
    color: '#666666',
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
});