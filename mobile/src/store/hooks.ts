import { useAuthStore } from './authStore';
import { useApiStore, API_OPERATIONS } from './apiStore';
import { useAppStore } from './appStore';

// Authentication hooks
export const useAuth = () => {
  const {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    updateUser,
    initialize,
  } = useAuthStore();

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    updateUser,
    initialize,
  };
};

// API loading and error hooks
export const useApiState = (operation: string) => {
  const {
    isLoading,
    getError,
    hasError,
    startOperation,
    completeOperation,
    failOperation,
    clearError,
  } = useApiStore();

  return {
    isLoading: isLoading(operation),
    error: getError(operation),
    hasError: hasError(operation),
    startOperation: () => startOperation(operation),
    completeOperation: () => completeOperation(operation),
    failOperation: (error: any) => failOperation(operation, error),
    clearError: () => clearError(operation),
  };
};

// Specific API operation hooks for common use cases
export const useLoginState = () => useApiState(API_OPERATIONS.LOGIN);
export const useRegisterState = () => useApiState(API_OPERATIONS.REGISTER);
export const useLogoutState = () => useApiState(API_OPERATIONS.LOGOUT);
export const useSearchState = () => useApiState(API_OPERATIONS.SEARCH_SONGS);
export const useRecommendationsState = () => useApiState(API_OPERATIONS.GET_RECOMMENDATIONS);

// App preferences hooks
export const usePreferences = () => {
  const {
    preferences,
    updatePreferences,
    resetPreferences,
  } = useAppStore();

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  };
};

// App settings hooks
export const useSettings = () => {
  const {
    settings,
    updateSettings,
    resetSettings,
  } = useAppStore();

  return {
    settings,
    updateSettings,
    resetSettings,
  };
};

// Search history hooks
export const useSearchHistory = () => {
  const {
    searchHistory,
    addSearchQuery,
    clearSearchHistory,
    removeSearchQuery,
  } = useAppStore();

  return {
    searchHistory,
    addSearchQuery,
    clearSearchHistory,
    removeSearchQuery,
  };
};

// Combined hooks for complex use cases
export const useAuthWithApi = () => {
  const auth = useAuth();
  const loginApi = useLoginState();
  const logoutApi = useLogoutState();

  const login = async (email: string, password: string) => {
    try {
      loginApi.startOperation();
      
      // TODO: Implement actual API call in next tasks
      // For now, simulate successful login
      setTimeout(() => {
        const mockUser = { id: '1', email, name: 'Demo User' };
        const mockTokens = { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' };
        
        auth.login(mockUser, mockTokens.accessToken, mockTokens.refreshToken);
        loginApi.completeOperation();
      }, 1000);
      
    } catch (error: any) {
      loginApi.failOperation(error);
    }
  };

  const logout = async () => {
    try {
      logoutApi.startOperation();
      
      // TODO: Implement actual API call in next tasks
      // For now, just clear local state
      auth.logout();
      logoutApi.completeOperation();
      
    } catch (error: any) {
      logoutApi.failOperation(error);
    }
  };

  return {
    ...auth,
    login,
    logout,
    loginLoading: loginApi.isLoading,
    loginError: loginApi.error,
    logoutLoading: logoutApi.isLoading,
    logoutError: logoutApi.error,
  };
};

// Global app state hook
export const useGlobalState = () => {
  const { isAnyLoading, isOnline } = useApiStore();
  const { isFirstLaunch, appVersion } = useAppStore();

  return {
    isAnyLoading: isAnyLoading(),
    isOnline,
    isFirstLaunch,
    appVersion,
  };
};