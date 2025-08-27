import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Config, API_ENDPOINTS } from '@/constants/config';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  LogoutRequest,
  ApiError
} from '@/types/auth';

/**
 * Authentication Service
 * 
 * Handles all authentication-related API calls to the MusicEZ backend.
 * Implements secure token management with automatic refresh and proper error handling.
 * 
 * Architecture follows established MusicEZ patterns:
 * - Singleton service pattern
 * - Axios interceptors for automatic token handling
 * - Secure storage for refresh tokens
 * - Memory-only storage for access tokens
 * - Comprehensive error handling matching backend responses
 */
export class AuthService {
  private readonly apiClient: AxiosInstance;
  private readonly REFRESH_TOKEN_KEY = 'musicez_refresh_token';
  private accessToken: string | null = null;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
  }> = [];

  constructor() {
    // Initialize axios client with base configuration
    this.apiClient = axios.create({
      baseURL: Config.API_BASE_URL,
      timeout: Config.API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Set up request/response interceptors for automatic token handling
    this.setupInterceptors();
  }

  /**
   * Configure axios interceptors for authentication and token refresh
   */
  private setupInterceptors(): void {
    // Request interceptor: Attach access token to requests
    this.apiClient.interceptors.request.use(
      async (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: Handle token refresh on 401 responses
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // If token refresh is already in progress, queue this request
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.apiClient(originalRequest);
            }).catch((err) => {
              return Promise.reject(err);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newAccessToken = await this.attemptTokenRefresh();
            if (newAccessToken) {
              this.processQueue(null, newAccessToken);
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return this.apiClient(originalRequest);
            }
          } catch (refreshError) {
            this.processQueue(refreshError, null);
            this.clearAuthData();
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Process queued requests after token refresh
   */
  private processQueue(error: any, token: string | null): void {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token!);
      }
    });

    this.failedQueue = [];
  }

  /**
   * Attempt to refresh access token using stored refresh token
   */
  private async attemptTokenRefresh(): Promise<string | null> {
    try {
      const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.refreshToken(refreshToken);
      this.accessToken = response.data.tokens.accessToken;
      
      // Store new refresh token securely
      await SecureStore.setItemAsync(this.REFRESH_TOKEN_KEY, response.data.tokens.refreshToken);
      
      return this.accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Clear all authentication data from memory and secure storage
   */
  private async clearAuthData(): Promise<void> {
    this.accessToken = null;
    await SecureStore.deleteItemAsync(this.REFRESH_TOKEN_KEY).catch(() => {
      // Ignore errors if key doesn't exist
    });
  }

  /**
   * Set access token in memory (called by auth store after successful login)
   */
  public setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Get current access token from memory
   */
  public getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Register new user account
   * 
   * @param userData - User registration data
   * @returns Promise resolving to authentication response
   */
  public async registerUser(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.apiClient.post(
        API_ENDPOINTS.REGISTER,
        userData
      );

      // Store tokens after successful registration
      const { accessToken, refreshToken } = response.data.data.tokens;
      this.accessToken = accessToken;
      await SecureStore.setItemAsync(this.REFRESH_TOKEN_KEY, refreshToken);

      return response.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Login user with email and password
   * 
   * @param credentials - User login credentials
   * @returns Promise resolving to authentication response
   */
  public async loginUser(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await this.apiClient.post(
        API_ENDPOINTS.LOGIN,
        credentials
      );

      // Store tokens after successful login
      const { accessToken, refreshToken } = response.data.data.tokens;
      this.accessToken = accessToken;
      await SecureStore.setItemAsync(this.REFRESH_TOKEN_KEY, refreshToken);

      return response.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Refresh access token using refresh token
   * 
   * @param refreshToken - Current refresh token
   * @returns Promise resolving to new token pair
   */
  public async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    try {
      const requestData: RefreshTokenRequest = { refreshToken };
      
      const response: AxiosResponse<RefreshTokenResponse> = await this.apiClient.post(
        API_ENDPOINTS.REFRESH,
        requestData
      );

      return response.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Logout from current device
   * 
   * @returns Promise resolving when logout is complete
   */
  public async logout(): Promise<void> {
    try {
      const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
      
      if (refreshToken) {
        const requestData: LogoutRequest = { refreshToken };
        await this.apiClient.post(API_ENDPOINTS.LOGOUT, requestData);
      }
    } catch (error) {
      // Log error but don't throw - we want to clear local data regardless
      console.warn('Logout API call failed:', error);
    } finally {
      // Always clear local authentication data
      await this.clearAuthData();
    }
  }

  /**
   * Logout from all devices
   * 
   * @returns Promise resolving when logout from all devices is complete
   */
  public async logoutAll(): Promise<void> {
    try {
      const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
      
      if (refreshToken) {
        const requestData: LogoutRequest = { refreshToken };
        await this.apiClient.post(API_ENDPOINTS.LOGOUT, requestData);
      }
    } catch (error) {
      // Log error but don't throw - we want to clear local data regardless
      console.warn('Logout all API call failed:', error);
    } finally {
      // Always clear local authentication data
      await this.clearAuthData();
    }
  }

  /**
   * Handle API errors and convert them to standardized format
   * 
   * @param error - Axios error object
   * @returns Standardized API error object
   */
  private handleApiError(error: any): ApiError {
    if (error.response?.data) {
      // Backend returned structured error response
      return error.response.data as ApiError;
    }

    if (error.code === 'ECONNABORTED') {
      // Request timeout
      return {
        success: false,
        error: {
          code: 'NETWORK_TIMEOUT',
          message: 'Request timed out. Please check your connection and try again.',
        },
        timestamp: new Date().toISOString(),
      };
    }

    if (error.code === 'NETWORK_ERROR' || !error.response) {
      // Network connectivity issues
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to connect to the server. Please check your internet connection.',
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Generic server error
    const statusCode = error.response?.status || 500;
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: `An unexpected error occurred (${statusCode}). Please try again later.`,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if user has valid authentication tokens
   * 
   * @returns Promise resolving to true if tokens are available
   */
  public async hasValidTokens(): Promise<boolean> {
    try {
      const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
      return !!(this.accessToken && refreshToken);
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize authentication state (called on app startup)
   * 
   * @returns Promise resolving to true if user should be authenticated
   */
  public async initializeAuth(): Promise<boolean> {
    try {
      const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
      
      if (refreshToken) {
        // Attempt to refresh access token
        const newAccessToken = await this.attemptTokenRefresh();
        return !!newAccessToken;
      }
      
      return false;
    } catch (error) {
      console.error('Auth initialization failed:', error);
      await this.clearAuthData();
      return false;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();