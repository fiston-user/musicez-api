import { create } from 'zustand';

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export interface LoadingState {
  [key: string]: boolean;
}

export interface ErrorState {
  [key: string]: ApiError | null;
}

export interface ApiState {
  // Loading states for different operations
  loading: LoadingState;
  
  // Error states for different operations
  errors: ErrorState;
  
  // Network connectivity
  isOnline: boolean;
  
  // Actions for loading states
  setLoading: (operation: string, isLoading: boolean) => void;
  
  // Actions for error states
  setError: (operation: string, error: ApiError | null) => void;
  clearError: (operation: string) => void;
  clearAllErrors: () => void;
  
  // Network actions
  setOnlineStatus: (isOnline: boolean) => void;
  
  // Utility actions
  startOperation: (operation: string) => void;
  completeOperation: (operation: string) => void;
  failOperation: (operation: string, error: ApiError) => void;
  
  // Getters (computed values)
  isLoading: (operation: string) => boolean;
  getError: (operation: string) => ApiError | null;
  hasError: (operation: string) => boolean;
  isAnyLoading: () => boolean;
}

// Common operation keys
export const API_OPERATIONS = {
  // Authentication
  LOGIN: 'auth.login',
  REGISTER: 'auth.register',
  LOGOUT: 'auth.logout',
  REFRESH_TOKEN: 'auth.refresh',
  
  // Search
  SEARCH_SONGS: 'search.songs',
  SEARCH_ENHANCED: 'search.enhanced',
  
  // Recommendations
  GET_RECOMMENDATIONS: 'recommendations.get',
  BATCH_RECOMMENDATIONS: 'recommendations.batch',
  
  // Profile
  GET_PROFILE: 'profile.get',
  UPDATE_PROFILE: 'profile.update',
  
  // Spotify
  SPOTIFY_CONNECT: 'spotify.connect',
  SPOTIFY_SYNC: 'spotify.sync',
} as const;

export const useApiStore = create<ApiState>((set, get) => ({
  // Initial state
  loading: {},
  errors: {},
  isOnline: true,

  // Loading state actions
  setLoading: (operation: string, isLoading: boolean) => {
    set((state) => ({
      loading: {
        ...state.loading,
        [operation]: isLoading,
      },
    }));
  },

  // Error state actions
  setError: (operation: string, error: ApiError | null) => {
    set((state) => ({
      errors: {
        ...state.errors,
        [operation]: error,
      },
    }));
  },

  clearError: (operation: string) => {
    set((state) => {
      const newErrors = { ...state.errors };
      delete newErrors[operation];
      return { errors: newErrors };
    });
  },

  clearAllErrors: () => {
    set({ errors: {} });
  },

  // Network actions
  setOnlineStatus: (isOnline: boolean) => {
    set({ isOnline });
  },

  // Utility actions that combine loading and error management
  startOperation: (operation: string) => {
    set((state) => ({
      loading: {
        ...state.loading,
        [operation]: true,
      },
      errors: {
        ...state.errors,
        [operation]: null,
      },
    }));
  },

  completeOperation: (operation: string) => {
    set((state) => ({
      loading: {
        ...state.loading,
        [operation]: false,
      },
    }));
  },

  failOperation: (operation: string, error: ApiError) => {
    set((state) => ({
      loading: {
        ...state.loading,
        [operation]: false,
      },
      errors: {
        ...state.errors,
        [operation]: error,
      },
    }));
  },

  // Getter functions
  isLoading: (operation: string) => {
    return get().loading[operation] || false;
  },

  getError: (operation: string) => {
    return get().errors[operation] || null;
  },

  hasError: (operation: string) => {
    return !!get().errors[operation];
  },

  isAnyLoading: () => {
    const loadingStates = get().loading;
    return Object.values(loadingStates).some(Boolean);
  },
}));