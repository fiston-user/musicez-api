import { SpotifyApiClient, SpotifyApiError, SpotifyAuthenticationError, SpotifyRateLimitError } from '../../src/utils/spotify-client';
import { config } from '../../src/config/environment';
import { createClient } from 'redis';

// Mock dependencies
jest.mock('../../src/config/environment');
jest.mock('../../src/utils/logger');
jest.mock('redis');
jest.mock('@spotify/web-api-ts-sdk', () => ({
  SpotifyApi: {
    withClientCredentials: jest.fn(),
  },
}));

const mockConfig = config as jest.Mocked<typeof config>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('SpotifyApiClient', () => {
  let spotifyClient: SpotifyApiClient;
  let mockRedisClient: any;

  beforeAll(() => {
    // Mock config values
    mockConfig.spotify = {
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
      redirectUri: 'http://localhost:3000/api/v1/auth/spotify/callback',
      encryptionKey: '12345678901234567890123456789012',
    };
    mockConfig.redis = {
      url: 'redis://localhost:6379',
    };
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      setEx: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(60),
    };
    
    mockCreateClient.mockReturnValue(mockRedisClient);
    
    // Get fresh instance
    spotifyClient = SpotifyApiClient.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = SpotifyApiClient.getInstance();
      const instance2 = SpotifyApiClient.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Authorization URL Generation', () => {
    it('should generate correct authorization URL', () => {
      const scopes = ['user-read-private', 'playlist-read-private'];
      const state = 'test_state_token';

      const authUrl = spotifyClient.getAuthorizationUrl(scopes, state);

      expect(authUrl).toContain('https://accounts.spotify.com/authorize');
      expect(authUrl).toContain(`client_id=${mockConfig.spotify.clientId}`);
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(mockConfig.spotify.redirectUri!)}`);
      expect(authUrl).toContain(`scope=${encodeURIComponent(scopes.join(' '))}`);
      expect(authUrl).toContain(`state=${state}`);
    });

    it('should throw error if OAuth config is missing', () => {
      mockConfig.spotify.clientId = undefined;
      
      expect(() => {
        spotifyClient.getAuthorizationUrl(['user-read-private'], 'state');
      }).toThrow(SpotifyAuthenticationError);
      
      // Restore config
      mockConfig.spotify.clientId = 'test_client_id';
    });
  });

  describe('State Token Management', () => {
    it('should generate and store state token', async () => {
      const userId = 'test_user_123';
      
      const state = await spotifyClient.generateStateToken(userId);
      
      expect(state).toBeTruthy();
      expect(state).toContain(userId);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        expect.stringContaining('spotify_state:'),
        600, // 10 minutes
        userId
      );
    });

    it('should validate and return userId for valid state token', async () => {
      const userId = 'test_user_123';
      const state = 'valid_state_token';
      
      mockRedisClient.get.mockResolvedValue(userId);
      
      const result = await spotifyClient.validateStateToken(state);
      
      expect(result).toBe(userId);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`spotify_state:${state}`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`spotify_state:${state}`);
    });

    it('should throw error for invalid state token', async () => {
      const state = 'invalid_state_token';
      
      mockRedisClient.get.mockResolvedValue(null);
      
      await expect(spotifyClient.validateStateToken(state)).rejects.toThrow(SpotifyAuthenticationError);
      await expect(spotifyClient.validateStateToken(state)).rejects.toThrow('Invalid or expired state token');
    });
  });

  describe('Token Exchange', () => {
    it('should exchange authorization code for tokens', async () => {
      const authCode = 'test_auth_code';
      const mockResponse = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
        scope: 'user-read-private',
      };

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await spotifyClient.exchangeCodeForTokens(authCode);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://accounts.spotify.com/api/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should handle token exchange failure', async () => {
      const authCode = 'invalid_auth_code';
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      });

      await expect(spotifyClient.exchangeCodeForTokens(authCode)).rejects.toThrow(SpotifyAuthenticationError);
    });
  });

  describe('User Profile Retrieval', () => {
    it('should fetch user profile from Spotify API', async () => {
      const accessToken = 'test_access_token';
      const mockProfile = {
        id: 'spotify_user_123',
        display_name: 'Test User',
        email: 'test@example.com',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockProfile),
      });

      const result = await spotifyClient.getUserProfile(accessToken);

      expect(result).toEqual({
        id: mockProfile.id,
        display_name: mockProfile.display_name,
        email: mockProfile.email,
        followers: undefined,
        images: undefined,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/me',
        expect.objectContaining({
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        })
      );
    });

    it('should handle unauthorized access token', async () => {
      const accessToken = 'invalid_access_token';
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(spotifyClient.getUserProfile(accessToken)).rejects.toThrow(SpotifyAuthenticationError);
    });
  });

  describe('Token Storage and Retrieval', () => {
    it('should store user tokens in Redis', async () => {
      const userId = 'test_user_123';
      const tokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresIn: 3600,
        scope: 'user-read-private',
        spotifyUserId: 'spotify_user_123',
        displayName: 'Test User',
      };

      await spotifyClient.storeUserTokens(userId, tokens);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `spotify_tokens:${userId}`,
        86400 * 30, // 30 days
        expect.stringContaining(tokens.accessToken)
      );
    });

    it('should retrieve user tokens from Redis', async () => {
      const userId = 'test_user_123';
      const storedData = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresIn: 3600,
        scope: 'user-read-private',
        spotifyUserId: 'spotify_user_123',
        displayName: 'Test User',
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        storedAt: new Date().toISOString(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(storedData));

      const result = await spotifyClient.getUserTokens(userId);

      expect(result).toBeTruthy();
      expect(result!.accessToken).toBe(storedData.accessToken);
      expect(result!.tokenExpiresAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent user tokens', async () => {
      const userId = 'nonexistent_user';
      
      mockRedisClient.get.mockResolvedValue(null);

      const result = await spotifyClient.getUserTokens(userId);

      expect(result).toBeNull();
    });
  });

  describe('Token Refresh', () => {
    it('should refresh expired tokens', async () => {
      const userId = 'test_user_123';
      const refreshToken = 'refresh_token_123';
      const mockResponse = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await spotifyClient.refreshUserTokens(userId, refreshToken);

      expect(result).toBeTruthy();
      expect(result!.accessToken).toBe(mockResponse.access_token);
      expect(result!.refreshToken).toBe(mockResponse.refresh_token);
    });

    it('should handle invalid refresh token', async () => {
      const userId = 'test_user_123';
      const refreshToken = 'invalid_refresh_token';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        }),
      });

      const result = await spotifyClient.refreshUserTokens(userId, refreshToken);

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith(`spotify_tokens:${userId}`);
    });
  });

  describe('Connection Management', () => {
    it('should disconnect user account', async () => {
      const userId = 'test_user_123';

      await spotifyClient.disconnectUser(userId);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`spotify_tokens:${userId}`);
    });

    it('should check if user has valid connection', async () => {
      const userId = 'test_user_123';
      const validTokenData = {
        accessToken: 'access_token_123',
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(validTokenData));

      const result = await spotifyClient.hasValidConnection(userId);

      expect(result).toBe(true);
    });

    it('should return false for expired connection', async () => {
      const userId = 'test_user_123';
      const expiredTokenData = {
        accessToken: 'access_token_123',
        tokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(expiredTokenData));

      const result = await spotifyClient.hasValidConnection(userId);

      expect(result).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should implement rate limiting', async () => {
      mockRedisClient.get.mockResolvedValue('100'); // At limit
      mockRedisClient.ttl.mockResolvedValue(30);

      const apiCall = jest.fn();

      await expect(spotifyClient.makeApiCall(apiCall)).rejects.toThrow(SpotifyRateLimitError);
    });

    it('should track request counts', async () => {
      mockRedisClient.get.mockResolvedValue('50'); // Under limit
      mockRedisClient.incr.mockResolvedValue(51);

      const apiCall = jest.fn().mockResolvedValue('success');

      const result = await spotifyClient.makeApiCall(apiCall);

      expect(result).toBe('success');
      expect(mockRedisClient.incr).toHaveBeenCalled();
    });

    it('should return rate limit status', async () => {
      mockRedisClient.get.mockResolvedValue('25');
      mockRedisClient.ttl.mockResolvedValue(45);

      const status = await spotifyClient.getRateLimitStatus();

      expect(status.remainingRequests).toBe(75);
      expect(status.resetTime).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling', () => {
    it('should create SpotifyApiError with correct properties', () => {
      const error = new SpotifyApiError('Test error', 400);
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('SpotifyApiError');
    });

    it('should create SpotifyRateLimitError with retry after', () => {
      const error = new SpotifyRateLimitError('Rate limited', 60);
      
      expect(error.message).toBe('Rate limited');
      expect(error.retryAfter).toBe(60);
      expect(error.statusCode).toBe(429);
    });

    it('should create SpotifyAuthenticationError', () => {
      const error = new SpotifyAuthenticationError('Auth failed');
      
      expect(error.message).toBe('Auth failed');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('API Call Wrapper', () => {
    it('should retry on transient errors', async () => {
      const apiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      mockRedisClient.get.mockResolvedValue('1');

      const result = await spotifyClient.makeApiCall(apiCall, 2);

      expect(result).toBe('success');
      expect(apiCall).toHaveBeenCalledTimes(2);
    });

    it('should not retry authentication errors', async () => {
      const apiCall = jest.fn().mockRejectedValue(new SpotifyAuthenticationError('Unauthorized'));

      mockRedisClient.get.mockResolvedValue('1');

      await expect(spotifyClient.makeApiCall(apiCall)).rejects.toThrow(SpotifyAuthenticationError);
      expect(apiCall).toHaveBeenCalledTimes(1);
    });
  });
});