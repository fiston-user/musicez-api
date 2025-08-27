// Store exports
export { useAuthStore } from './authStore';
export { useApiStore, API_OPERATIONS } from './apiStore';
export { useAppStore } from './appStore';

// Hook exports
export {
  useAuth,
  useApiState,
  useLoginState,
  useRegisterState,
  useLogoutState,
  useSearchState,
  useRecommendationsState,
  usePreferences,
  useSettings,
  useSearchHistory,
  useAuthWithApi,
  useGlobalState,
} from './hooks';

// Type exports
export type { AuthState } from './authStore';
export type { ApiState, ApiError, LoadingState, ErrorState } from './apiStore';
export type { AppState, UserPreferences, AppSettings } from './appStore';