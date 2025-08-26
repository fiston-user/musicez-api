import request from 'supertest';
import { Application } from 'express';
import createApp from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { redis } from '../../src/config/redis';
import { SpotifyApiClient } from '../../src/utils/spotify-client';
import { generateJwtTokens } from '../../src/utils/jwt-token';
import { encryptSpotifyTokens } from '../../src/utils/spotify-token-encryption';

jest.mock('../../src/database/prisma');
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/spotify-client');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRedis = redis as jest.Mocked<typeof redis>;

describe('User Spotify Data Routes', () => {
  let app: Application;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = createApp();
    userId = 'test_user_123';
    
    // Generate test JWT token
    const tokens = generateJwtTokens({ id: userId, email: 'test@example.com' });
    accessToken = tokens.accessToken;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock user authentication
    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'test@example.com',
      spotifyConnection: {
        id: 'conn_123',
        userId,
        accessToken: 'encrypted_access_token',
        refreshToken: 'encrypted_refresh_token',
        expiresAt: new Date(Date.now() + 3600000),
        scopes: ['playlist-read-private', 'user-read-recently-played'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);

    // Mock Redis for session/cache
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
  });

  describe('GET /api/v1/user/spotify/playlists', () => {
    const mockPlaylistsResponse = {
      items: [
        {
          id: 'playlist_1',
          name: 'My Awesome Playlist',
          description: 'Collection of great songs',
          tracks: { total: 25 },
          public: true,
          owner: { display_name: 'testuser' },
        },
        {
          id: 'playlist_2',
          name: 'Private Mix',
          description: null,
          tracks: { total: 15 },
          public: false,
          owner: { display_name: 'testuser' },
        },
      ],
      total: 2,
    };

    it('should return user playlists successfully', async () => {
      // Arrange
      const mockSpotifyClient = {
        getUserPlaylists: jest.fn().mockResolvedValue(mockPlaylistsResponse),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Act
      const response = await request(app)
        .get('/api/v1/user/spotify/playlists')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        success: true,
        data: {
          playlists: [
            {
              id: 'playlist_1',
              name: 'My Awesome Playlist',
              description: 'Collection of great songs',
              trackCount: 25,
              isPublic: true,
              owner: 'testuser',
            },
            {
              id: 'playlist_2',
              name: 'Private Mix',
              description: null,
              trackCount: 15,
              isPublic: false,
              owner: 'testuser',
            },
          ],
        },
        timestamp: expect.any(String),
        requestId: expect.any(String),
      });

      expect(mockSpotifyClient.getUserPlaylists).toHaveBeenCalledWith(userId);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/v1/user/spotify/playlists')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        requestId: expect.any(String),
      });
    });

    it('should return 403 when user has no Spotify connection', async () => {
      // Arrange
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        spotifyConnection: null,
      } as any);

      // Act
      const response = await request(app)
        .get('/api/v1/user/spotify/playlists')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      // Assert
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'SPOTIFY_CONNECTION_REQUIRED',
          message: 'Spotify account connection is required for this operation',
        },
        requestId: expect.any(String),
      });
    });

    it('should handle rate limiting', async () => {
      // Make multiple requests quickly to trigger rate limiting
      const requests = Array.from({ length: 25 }, () =>
        request(app)
          .get('/api/v1/user/spotify/playlists')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.allSettled(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses
        .filter((response): response is PromiseFulfilledResult<any> => 
          response.status === 'fulfilled' && response.value.status === 429
        );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      expect(rateLimitedResponses[0].value.body).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      });
    });
  });

  describe('GET /api/v1/user/spotify/recently-played', () => {
    const mockRecentTracksResponse = {
      items: [
        {
          track: {
            id: 'track_1',
            name: 'Amazing Song',
            artists: [{ name: 'Great Artist' }],
            album: { name: 'Fantastic Album' },
            popularity: 85,
          },
          played_at: '2023-12-01T10:30:00.000Z',
        },
        {
          track: {
            id: 'track_2', 
            name: 'Another Hit',
            artists: [{ name: 'Cool Band' }],
            album: { name: 'New Release' },
            popularity: 72,
          },
          played_at: '2023-12-01T09:15:00.000Z',
        },
      ],
    };

    it('should return recently played tracks successfully', async () => {
      // Arrange
      const mockSpotifyClient = {
        getRecentlyPlayedTracks: jest.fn().mockResolvedValue(mockRecentTracksResponse),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Act
      const response = await request(app)
        .get('/api/v1/user/spotify/recently-played?limit=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        success: true,
        data: {
          tracks: [
            {
              trackId: 'track_1',
              name: 'Amazing Song',
              artist: 'Great Artist',
              album: 'Fantastic Album',
              popularity: 85,
              playedAt: '2023-12-01T10:30:00.000Z',
            },
            {
              trackId: 'track_2',
              name: 'Another Hit', 
              artist: 'Cool Band',
              album: 'New Release',
              popularity: 72,
              playedAt: '2023-12-01T09:15:00.000Z',
            },
          ],
        },
        timestamp: expect.any(String),
        requestId: expect.any(String),
      });

      expect(mockSpotifyClient.getRecentlyPlayedTracks).toHaveBeenCalledWith(userId, { limit: 10 });
    });

    it('should handle invalid limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/user/spotify/recently-played?limit=invalid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid limit parameter. Must be a number between 1 and 50.',
        },
        requestId: expect.any(String),
      });
    });

    it('should use default limit when not specified', async () => {
      // Arrange
      const mockSpotifyClient = {
        getRecentlyPlayedTracks: jest.fn().mockResolvedValue({ items: [] }),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Act
      await request(app)
        .get('/api/v1/user/spotify/recently-played')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Assert
      expect(mockSpotifyClient.getRecentlyPlayedTracks).toHaveBeenCalledWith(userId, { limit: 20 }); // Default limit
    });
  });

  describe('POST /api/v1/user/spotify/sync/playlists', () => {
    it('should queue playlist sync job successfully', async () => {
      // Arrange
      const mockSyncJob = {
        id: 'job_123',
        userId,
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'pending',
        parameters: { includePrivate: true },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.spotifySyncJob.create.mockResolvedValue(mockSyncJob);

      // Act
      const response = await request(app)
        .post('/api/v1/user/spotify/sync/playlists')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ includePrivate: true })
        .expect(202);

      // Assert
      expect(response.body).toEqual({
        success: true,
        data: {
          jobId: 'job_123',
          status: 'queued',
          estimatedProcessingTime: '2-5 minutes',
        },
        requestId: expect.any(String),
      });

      expect(mockPrisma.spotifySyncJob.create).toHaveBeenCalledWith({
        data: {
          userId,
          jobType: 'USER_PLAYLISTS_SYNC',
          status: 'pending',
          parameters: { includePrivate: true },
        },
      });
    });

    it('should validate request body', async () => {
      const response = await request(app)
        .post('/api/v1/user/spotify/sync/playlists')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ includePrivate: 'invalid' }) // Should be boolean
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/user/spotify/sync/recent-tracks', () => {
    it('should queue recent tracks sync job successfully', async () => {
      // Arrange
      const mockSyncJob = {
        id: 'job_456',
        userId,
        jobType: 'RECENTLY_PLAYED_SYNC',
        status: 'pending',
        parameters: { limit: 30 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.spotifySyncJob.create.mockResolvedValue(mockSyncJob);

      // Act
      const response = await request(app)
        .post('/api/v1/user/spotify/sync/recent-tracks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ limit: 30 })
        .expect(202);

      // Assert
      expect(response.body).toEqual({
        success: true,
        data: {
          jobId: 'job_456',
          status: 'queued',
          estimatedProcessingTime: '1-3 minutes',
        },
        requestId: expect.any(String),
      });

      expect(mockPrisma.spotifySyncJob.create).toHaveBeenCalledWith({
        data: {
          userId,
          jobType: 'RECENTLY_PLAYED_SYNC',
          status: 'pending',
          parameters: { limit: 30 },
        },
      });
    });
  });

  describe('GET /api/v1/user/spotify/sync/jobs', () => {
    it('should return user sync jobs', async () => {
      // Arrange
      const mockJobs = [
        {
          id: 'job_1',
          userId,
          jobType: 'USER_PLAYLISTS_SYNC',
          status: 'completed',
          parameters: { includePrivate: true },
          createdAt: new Date('2023-12-01T10:00:00Z'),
          startedAt: new Date('2023-12-01T10:00:05Z'),
          completedAt: new Date('2023-12-01T10:02:30Z'),
          errorMessage: null,
          retryCount: 0,
        },
        {
          id: 'job_2',
          userId,
          jobType: 'RECENTLY_PLAYED_SYNC',
          status: 'pending',
          parameters: { limit: 20 },
          createdAt: new Date('2023-12-01T10:30:00Z'),
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          retryCount: 0,
        },
      ];

      mockPrisma.spotifySyncJob.findMany.mockResolvedValue(mockJobs);

      // Act
      const response = await request(app)
        .get('/api/v1/user/spotify/sync/jobs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        success: true,
        data: {
          jobs: [
            {
              id: 'job_1',
              type: 'USER_PLAYLISTS_SYNC',
              status: 'completed',
              createdAt: '2023-12-01T10:00:00.000Z',
              startedAt: '2023-12-01T10:00:05.000Z',
              completedAt: '2023-12-01T10:02:30.000Z',
              processingTimeMs: 145000, // Calculated duration
              retryCount: 0,
            },
            {
              id: 'job_2',
              type: 'RECENTLY_PLAYED_SYNC',
              status: 'pending',
              createdAt: '2023-12-01T10:30:00.000Z',
              startedAt: null,
              completedAt: null,
              processingTimeMs: null,
              retryCount: 0,
            },
          ],
        },
        timestamp: expect.any(String),
        requestId: expect.any(String),
      });
    });

    it('should support pagination', async () => {
      // Arrange
      mockPrisma.spotifySyncJob.findMany.mockResolvedValue([]);

      // Act
      await request(app)
        .get('/api/v1/user/spotify/sync/jobs?limit=5&offset=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Assert
      expect(mockPrisma.spotifySyncJob.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        skip: 10,
      });
    });
  });
});