import { Response, NextFunction } from 'express';
import { UserSpotifyDataController } from '../../src/controllers/user-spotify-data.controller';
import { SpotifyApiClient } from '../../src/utils/spotify-client';
import { prisma } from '../../src/database/prisma';
import { redis } from '../../src/config/redis';
import logger from '../../src/utils/logger';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';

jest.mock('../../src/database/prisma', () => ({
  prisma: {
    spotifySyncJob: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/spotify-client');
jest.mock('../../src/utils/logger');

const mockPrisma = prisma as any;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('UserSpotifyDataController', () => {
  let controller: UserSpotifyDataController;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    controller = new UserSpotifyDataController();
    
    mockReq = {
      user: { id: 'test_user_123', email: 'test@example.com' },
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: { requestId: 'req_123' },
    };

    mockNext = jest.fn();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getUserPlaylists', () => {
    const mockPlaylistsResponse = {
      items: [
        {
          id: 'playlist_1',
          name: 'My Test Playlist',
          description: 'A test playlist',
          tracks: { total: 25 },
          public: true,
          owner: { display_name: 'test_user' },
        },
        {
          id: 'playlist_2', 
          name: 'Private Playlist',
          description: null,
          tracks: { total: 10 },
          public: false,
          owner: { display_name: 'test_user' },
        },
      ],
      total: 2,
    };

    it('should successfully retrieve user playlists', async () => {
      // Arrange
      const mockSpotifyClient = {
        getUserPlaylists: jest.fn().mockResolvedValue(mockPlaylistsResponse),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      mockRedis.get.mockResolvedValue(null); // No cache
      mockRedis.setex.mockResolvedValue('OK');

      // Act
      await controller.getUserPlaylists(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Assert
      expect(mockSpotifyClient.getUserPlaylists).toHaveBeenCalledWith('test_user_123');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user_playlists:test_user_123',
        300, // 5 minutes cache
        expect.stringContaining('playlist_1')
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          playlists: expect.arrayContaining([
            expect.objectContaining({
              id: 'playlist_1',
              name: 'My Test Playlist',
              trackCount: 25,
            }),
          ]),
        },
        timestamp: expect.any(String),
        requestId: 'req_123',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User playlists retrieved',
        expect.objectContaining({
          userId: 'test_user_123',
          playlistCount: 2,
        })
      );
    });

    it('should return cached playlists when available', async () => {
      // Arrange
      const cachedData = JSON.stringify(mockPlaylistsResponse);
      mockRedis.get.mockResolvedValue(cachedData);

      const mockSpotifyClient = {
        getUserPlaylists: jest.fn(),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Act
      await controller.getUserPlaylists(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Assert
      expect(mockSpotifyClient.getUserPlaylists).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User playlists retrieved from cache',
        expect.objectContaining({ userId: 'test_user_123' })
      );
    });

    it('should handle Spotify API errors gracefully', async () => {
      // Arrange
      const mockSpotifyClient = {
        getUserPlaylists: jest.fn().mockRejectedValue(new Error('Spotify API rate limit exceeded')),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);
      mockRedis.get.mockResolvedValue(null);

      // Act
      await controller.getUserPlaylists(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'User playlists retrieval failed',
        expect.objectContaining({
          error: 'Spotify API rate limit exceeded',
          userId: 'test_user_123',
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal server error occurred. Please try again later.',
        },
        requestId: 'req_123',
      });
    });
  });

  describe('getRecentlyPlayedTracks', () => {
    const mockRecentTracksResponse = {
      items: [
        {
          track: {
            id: 'track_1',
            name: 'Test Song 1',
            artists: [{ name: 'Test Artist 1' }],
            album: { name: 'Test Album 1' },
            popularity: 75,
          },
          played_at: '2023-12-01T10:30:00Z',
        },
        {
          track: {
            id: 'track_2',
            name: 'Test Song 2',
            artists: [{ name: 'Test Artist 2' }],
            album: { name: 'Test Album 2' },
            popularity: 60,
          },
          played_at: '2023-12-01T09:15:00Z',
        },
      ],
      total: 2,
    };

    it('should successfully retrieve recently played tracks', async () => {
      // Arrange
      const mockSpotifyClient = {
        getRecentlyPlayedTracks: jest.fn().mockResolvedValue(mockRecentTracksResponse),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      mockReq.query = { limit: '10' };

      // Act
      await controller.getRecentlyPlayedTracks(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Assert
      expect(mockSpotifyClient.getRecentlyPlayedTracks).toHaveBeenCalledWith('test_user_123', { limit: 10 });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          tracks: expect.arrayContaining([
            expect.objectContaining({
              trackId: 'track_1',
              name: 'Test Song 1',
              artist: 'Test Artist 1',
              playedAt: '2023-12-01T10:30:00Z',
            }),
          ]),
        },
        timestamp: expect.any(String),
        requestId: 'req_123',
      });
    });

    it('should handle invalid limit parameter', async () => {
      // Arrange
      mockReq.query = { limit: 'invalid' };

      // Act
      await controller.getRecentlyPlayedTracks(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid limit parameter. Must be a number between 1 and 50.',
        },
        requestId: 'req_123',
      });
    });
  });

  describe('queuePlaylistSync', () => {
    it('should successfully queue playlist sync job', async () => {
      // Arrange
      const mockSyncJob = {
        id: 'job_123',
        userId: 'test_user_123',
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'pending',
        parameters: { includePrivate: true },
        createdAt: new Date(),
      };

      mockPrisma.spotifySyncJob.create.mockResolvedValue(mockSyncJob);
      mockRedis.setex.mockResolvedValue('OK');

      mockReq.body = { includePrivate: true };

      // Act
      await controller.queuePlaylistSync(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Assert
      expect(mockPrisma.spotifySyncJob.create).toHaveBeenCalledWith({
        data: {
          userId: 'test_user_123',
          jobType: 'USER_PLAYLISTS_SYNC',
          status: 'pending',
          parameters: { includePrivate: true },
        },
      });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'sync_job:job_123',
        3600, // 1 hour TTL
        expect.stringContaining('"id":"job_123"')
      );
      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 'job_123',
          status: 'queued',
          estimatedProcessingTime: '2-5 minutes',
        },
        requestId: 'req_123',
      });
    });
  });
});