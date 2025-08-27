import Constants from 'expo-constants';

// Environment configuration
export const Config = {
  API_BASE_URL: Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:3000/api/v1',
  API_TIMEOUT: 10000,
  TOKEN_STORAGE_KEY: 'musicez_auth_token',
  REFRESH_TOKEN_STORAGE_KEY: 'musicez_refresh_token',
  USER_STORAGE_KEY: 'musicez_user_data',
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',
  
  // Songs (for future use)
  SEARCH_SONGS: '/songs/search',
  SEARCH_ENHANCED: '/songs/search/enhanced',
  
  // Recommendations (for future use)
  RECOMMENDATIONS: '/recommendations',
  BATCH_RECOMMENDATIONS: '/recommendations/batch',
  
  // Spotify (for future use)
  SPOTIFY_CONNECT: '/auth/spotify/connect',
  SPOTIFY_CALLBACK: '/auth/spotify/callback',
  SPOTIFY_STATUS: '/auth/spotify/status',
  SPOTIFY_DISCONNECT: '/auth/spotify/disconnect',
} as const;

// Token Management Configuration
export const TOKEN_CONFIG = {
  REFRESH_THRESHOLD_MS: 5 * 60 * 1000, // 5 minutes before expiry
  BACKGROUND_CHECK_INTERVAL: 60 * 1000, // Check every minute
  MAX_REFRESH_RETRIES: 3,
} as const;

// App Configuration
export const APP_CONFIG = {
  NAME: 'MusicEZ',
  VERSION: '1.0.0',
  DESCRIPTION: 'AI-powered music recommendation app',
} as const;