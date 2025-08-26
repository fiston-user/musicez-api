import { Request, Response, NextFunction } from 'express';
import { SpotifyAuthController } from '../../src/controllers/spotify-auth.controller';
import { SpotifyApiClient } from '../../src/utils/spotify-client';
import logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/utils/spotify-client');
jest.mock('../../src/utils/logger');
jest.mock('../../src/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

const mockSpotifyClient = SpotifyApiClient.getInstance as jest.MockedFunction<typeof SpotifyApiClient.getInstance>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('SpotifyAuthController', () => {
  let controller: SpotifyAuthController;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockSpotifyClientInstance: jest.Mocked<any>;

  beforeEach(() => {
    controller = new SpotifyAuthController();
    
    mockReq = {
      body: {},
      params: {},
      query: {},
      user: {
        id: 'test_user_123',
        email: 'test@example.com',
      },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
    } as Partial<AuthenticatedRequest>;

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn(),
      locals: { requestId: 'test-req-123' },
    };

    mockNext = jest.fn();

    // Mock Spotify client instance
    mockSpotifyClientInstance = {
      getAuthorizationUrl: jest.fn(),
      generateStateToken: jest.fn(),
      validateStateToken: jest.fn(),
      exchangeCodeForTokens: jest.fn(),
      storeUserTokens: jest.fn(),
      getUserTokens: jest.fn(),
      disconnectUser: jest.fn(),
      hasValidConnection: jest.fn(),
      refreshUserTokens: jest.fn(),
    };

    mockSpotifyClient.mockReturnValue(mockSpotifyClientInstance);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Connect Spotify Account', () => {
    it('should initiate Spotify OAuth flow', async () => {
      const mockAuthUrl = 'https://accounts.spotify.com/authorize?client_id=test&...';
      const mockState = 'secure_state_token_123';

      mockSpotifyClientInstance.generateStateToken.mockResolvedValue(mockState);
      mockSpotifyClientInstance.getAuthorizationUrl.mockReturnValue(mockAuthUrl);

      await controller.connect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockSpotifyClientInstance.generateStateToken).toHaveBeenCalledWith('test_user_123');
      expect(mockSpotifyClientInstance.getAuthorizationUrl).toHaveBeenCalledWith(
        ['user-read-private', 'user-read-email', 'user-library-read', 'playlist-read-private', 'user-read-recently-played'],
        mockState
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          authUrl: mockAuthUrl,
          state: mockState,
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should handle state generation failure', async () => {
      const mockError = new Error('Redis connection failed');
      mockSpotifyClientInstance.generateStateToken.mockRejectedValue(mockError);

      await controller.connect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith('Spotify OAuth initiation failed', {
        error: 'Redis connection failed',
        userId: 'test_user_123',
        ip: '127.0.0.1',
        requestId: 'test-req-123',
        processingTime: expect.any(Number),
      });

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SPOTIFY_OAUTH_INITIATION_FAILED',
          message: 'Failed to initiate Spotify authentication',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should require authenticated user', async () => {
      mockReq.user = undefined;

      await controller.connect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required to connect Spotify account',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });
  });

  describe('OAuth Callback', () => {
    it('should handle successful OAuth callback', async () => {
      const mockCode = 'auth_code_123';
      const mockState = 'valid_state_token';
      const mockUserId = 'test_user_123';

      mockReq.query = { code: mockCode, state: mockState };

      const mockTokenResponse = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
        scope: 'user-read-private playlist-read-private',
      };

      const mockUserProfile = {
        id: 'spotify_user_123',
        display_name: 'Test Spotify User',
      };

      mockSpotifyClientInstance.validateStateToken.mockResolvedValue(mockUserId);
      mockSpotifyClientInstance.exchangeCodeForTokens.mockResolvedValue(mockTokenResponse);
      
      // Mock getting user profile from Spotify API
      mockSpotifyClientInstance.getUserProfile = jest.fn().mockResolvedValue(mockUserProfile);

      await controller.callback(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockSpotifyClientInstance.validateStateToken).toHaveBeenCalledWith(mockState);
      expect(mockSpotifyClientInstance.exchangeCodeForTokens).toHaveBeenCalledWith(mockCode);
      expect(mockSpotifyClientInstance.storeUserTokens).toHaveBeenCalledWith(mockUserId, {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresIn: 3600,
        scope: 'user-read-private playlist-read-private',
        spotifyUserId: 'spotify_user_123',
        displayName: 'Test Spotify User',
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: true,
          spotifyUserId: 'spotify_user_123',
          displayName: 'Test Spotify User',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should handle invalid state parameter', async () => {
      mockReq.query = { code: 'auth_code_123', state: 'invalid_state' };

      const mockError = new Error('Invalid state token');
      mockSpotifyClientInstance.validateStateToken.mockRejectedValue(mockError);

      await controller.callback(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_STATE_TOKEN',
          message: 'Invalid state parameter. Potential CSRF attack.',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should handle OAuth error from Spotify', async () => {
      mockReq.query = { error: 'access_denied', error_description: 'User denied access' };

      await controller.callback(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'OAUTH_ACCESS_DENIED',
          message: 'User denied access',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should handle authorization code exchange failure', async () => {
      const mockCode = 'invalid_auth_code';
      const mockState = 'valid_state_token';
      const mockUserId = 'test_user_123';

      mockReq.query = { code: mockCode, state: mockState };

      mockSpotifyClientInstance.validateStateToken.mockResolvedValue(mockUserId);
      const mockError = new Error('Invalid authorization code');
      mockSpotifyClientInstance.exchangeCodeForTokens.mockRejectedValue(mockError);

      await controller.callback(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: 'Failed to exchange authorization code for tokens',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should require code or error parameter', async () => {
      mockReq.query = {}; // Missing both code and error

      await controller.callback(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_CALLBACK_PARAMETERS',
          message: 'Missing required callback parameters',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });
  });

  describe('Connection Status', () => {
    it('should return connection status for connected user', async () => {
      const mockTokens = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        scope: 'user-read-private playlist-read-private',
        spotifyUserId: 'spotify_user_123',
        displayName: 'Test Spotify User',
      };

      mockSpotifyClientInstance.getUserTokens.mockResolvedValue(mockTokens);

      await controller.status(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: true,
          spotifyUserId: 'spotify_user_123',
          displayName: 'Test Spotify User',
          scope: 'user-read-private playlist-read-private',
          connectedAt: expect.any(String),
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should return not connected status for user without connection', async () => {
      mockSpotifyClientInstance.getUserTokens.mockResolvedValue(null);

      await controller.status(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          connected: false,
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should require authenticated user for status check', async () => {
      mockReq.user = undefined;

      await controller.status(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required to check Spotify connection status',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });
  });

  describe('Disconnect Spotify Account', () => {
    it('should successfully disconnect Spotify account', async () => {
      mockSpotifyClientInstance.disconnectUser.mockResolvedValue(undefined);

      await controller.disconnect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockSpotifyClientInstance.disconnectUser).toHaveBeenCalledWith('test_user_123');

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          disconnected: true,
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });

      expect(mockLogger.info).toHaveBeenCalledWith('User disconnected Spotify account', {
        userId: 'test_user_123',
        ip: '127.0.0.1',
        requestId: 'test-req-123',
        processingTime: expect.any(Number),
      });
    });

    it('should handle disconnect failure', async () => {
      const mockError = new Error('Database connection failed');
      mockSpotifyClientInstance.disconnectUser.mockRejectedValue(mockError);

      await controller.disconnect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SPOTIFY_DISCONNECT_FAILED',
          message: 'Failed to disconnect Spotify account',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should require authenticated user for disconnect', async () => {
      mockReq.user = undefined;

      await controller.disconnect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required to disconnect Spotify account',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });
  });

  describe('Error Handling and Logging', () => {
    it('should log all OAuth operations with proper context', async () => {
      mockSpotifyClientInstance.generateStateToken.mockResolvedValue('state_123');
      mockSpotifyClientInstance.getAuthorizationUrl.mockReturnValue('https://auth.url');

      await controller.connect(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockLogger.info).toHaveBeenCalledWith('Spotify OAuth connection initiated', {
        userId: 'test_user_123',
        ip: '127.0.0.1',
        requestId: 'test-req-123',
        processingTime: expect.any(Number),
      });
    });

    it('should include processing time in all responses', async () => {
      mockSpotifyClientInstance.getUserTokens.mockResolvedValue(null);

      await controller.status(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spotify connection status checked'),
        expect.objectContaining({
          processingTime: expect.any(Number),
        })
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const mockError = new Error('Unexpected error');
      mockSpotifyClientInstance.getUserTokens.mockRejectedValue(mockError);

      await controller.status(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith('Spotify connection status check failed', {
        error: 'Unexpected error',
        userId: 'test_user_123',
        ip: '127.0.0.1',
        requestId: 'test-req-123',
        processingTime: expect.any(Number),
      });

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });
  });
});