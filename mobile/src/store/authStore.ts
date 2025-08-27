import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@/types/auth';

export interface AuthState {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  
  // Auth actions
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  
  // Initialization
  initialize: () => Promise<void>;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      isLoading: true, // Start with loading true until initialization
      user: null,
      accessToken: null,
      refreshToken: null,

      // Auth actions
      login: (user: User, accessToken: string, refreshToken: string) => {
        set({
          isAuthenticated: true,
          isLoading: false,
          user,
          accessToken,
          refreshToken,
        });
      },

      logout: () => {
        set({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          accessToken: null,
          refreshToken: null,
        });
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: { ...currentUser, ...userData },
          });
        }
      },

      updateTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      // Initialize auth state from storage
      initialize: async () => {
        try {
          set({ isLoading: true });
          
          // The persist middleware will automatically restore the state from AsyncStorage
          // We just need to validate that the tokens are still valid
          const state = get();
          
          if (state.accessToken && state.refreshToken && state.user) {
            // TODO: In future tasks, validate token with API
            // For now, assume valid if tokens exist
            set({
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch (error) {
          console.error('Auth initialization failed:', error);
          set({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            accessToken: null,
            refreshToken: null,
          });
        }
      },

      clearAuth: () => {
        set({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          accessToken: null,
          refreshToken: null,
        });
      },
    }),
    {
      name: 'musicez-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist these fields
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);