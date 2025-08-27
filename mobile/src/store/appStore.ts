import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserPreferences {
  // Music preferences
  favoriteGenres: string[];
  preferredTempo: 'any' | 'slow' | 'medium' | 'fast';
  preferredMood: 'any' | 'happy' | 'sad' | 'energetic' | 'calm';
  
  // App preferences
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  autoPlay: boolean;
  
  // Privacy preferences
  shareListeningData: boolean;
  saveSearchHistory: boolean;
}

export interface AppSettings {
  // Search settings
  searchHistoryLimit: number;
  defaultSearchLimit: number;
  searchThreshold: number;
  
  // Recommendation settings
  defaultRecommendationLimit: number;
  enableEnhancedSearch: boolean;
  enableAIRecommendations: boolean;
  
  // Performance settings
  cacheEnabled: boolean;
  cacheTTL: number;
}

export interface AppState {
  // User preferences
  preferences: UserPreferences;
  
  // App settings
  settings: AppSettings;
  
  // App state
  isFirstLaunch: boolean;
  appVersion: string;
  lastUpdated: string;
  
  // Recent activity
  searchHistory: string[];
  recentRecommendations: string[]; // Song IDs
  
  // Actions for preferences
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  
  // Actions for settings
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  
  // Actions for app state
  setFirstLaunch: (isFirstLaunch: boolean) => void;
  updateAppVersion: (version: string) => void;
  
  // Actions for search history
  addSearchQuery: (query: string) => void;
  clearSearchHistory: () => void;
  removeSearchQuery: (query: string) => void;
  
  // Actions for recommendations
  addRecentRecommendation: (songId: string) => void;
  clearRecentRecommendations: () => void;
  
  // Utility actions
  resetAllData: () => void;
}

// Default preferences
const defaultPreferences: UserPreferences = {
  favoriteGenres: [],
  preferredTempo: 'any',
  preferredMood: 'any',
  theme: 'system',
  notifications: true,
  autoPlay: false,
  shareListeningData: true,
  saveSearchHistory: true,
};

// Default settings
const defaultSettings: AppSettings = {
  searchHistoryLimit: 20,
  defaultSearchLimit: 10,
  searchThreshold: 0.3,
  defaultRecommendationLimit: 10,
  enableEnhancedSearch: true,
  enableAIRecommendations: true,
  cacheEnabled: true,
  cacheTTL: 300, // 5 minutes
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      preferences: defaultPreferences,
      settings: defaultSettings,
      isFirstLaunch: true,
      appVersion: '1.0.0',
      lastUpdated: new Date().toISOString(),
      searchHistory: [],
      recentRecommendations: [],

      // Preference actions
      updatePreferences: (newPreferences: Partial<UserPreferences>) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            ...newPreferences,
          },
          lastUpdated: new Date().toISOString(),
        }));
      },

      resetPreferences: () => {
        set({
          preferences: defaultPreferences,
          lastUpdated: new Date().toISOString(),
        });
      },

      // Settings actions
      updateSettings: (newSettings: Partial<AppSettings>) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...newSettings,
          },
          lastUpdated: new Date().toISOString(),
        }));
      },

      resetSettings: () => {
        set({
          settings: defaultSettings,
          lastUpdated: new Date().toISOString(),
        });
      },

      // App state actions
      setFirstLaunch: (isFirstLaunch: boolean) => {
        set({ isFirstLaunch });
      },

      updateAppVersion: (version: string) => {
        set({
          appVersion: version,
          lastUpdated: new Date().toISOString(),
        });
      },

      // Search history actions
      addSearchQuery: (query: string) => {
        const state = get();
        if (!state.preferences.saveSearchHistory) return;

        const currentHistory = state.searchHistory;
        const filteredHistory = currentHistory.filter(q => q !== query);
        const newHistory = [query, ...filteredHistory].slice(0, state.settings.searchHistoryLimit);

        set({
          searchHistory: newHistory,
          lastUpdated: new Date().toISOString(),
        });
      },

      clearSearchHistory: () => {
        set({
          searchHistory: [],
          lastUpdated: new Date().toISOString(),
        });
      },

      removeSearchQuery: (query: string) => {
        set((state) => ({
          searchHistory: state.searchHistory.filter(q => q !== query),
          lastUpdated: new Date().toISOString(),
        }));
      },

      // Recommendation history actions
      addRecentRecommendation: (songId: string) => {
        set((state) => {
          const currentRecommendations = state.recentRecommendations;
          const filteredRecommendations = currentRecommendations.filter(id => id !== songId);
          const newRecommendations = [songId, ...filteredRecommendations].slice(0, 50); // Keep last 50

          return {
            recentRecommendations: newRecommendations,
            lastUpdated: new Date().toISOString(),
          };
        });
      },

      clearRecentRecommendations: () => {
        set({
          recentRecommendations: [],
          lastUpdated: new Date().toISOString(),
        });
      },

      // Utility actions
      resetAllData: () => {
        set({
          preferences: defaultPreferences,
          settings: defaultSettings,
          searchHistory: [],
          recentRecommendations: [],
          lastUpdated: new Date().toISOString(),
        });
      },
    }),
    {
      name: 'musicez-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Persist everything except isFirstLaunch (should reset on fresh install)
        preferences: state.preferences,
        settings: state.settings,
        appVersion: state.appVersion,
        lastUpdated: state.lastUpdated,
        searchHistory: state.searchHistory,
        recentRecommendations: state.recentRecommendations,
      }),
    }
  )
);