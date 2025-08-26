import { SpotifySyncService } from '../../src/services/spotify-sync.service';
import { SpotifyApiClient } from '../../src/utils/spotify-client';
import { prisma } from '../../src/database/prisma';
import { redis } from '../../src/config/redis';
import logger from '../../src/utils/logger';

jest.mock('../../src/database/prisma');
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/spotify-client');
jest.mock('../../src/utils/logger');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('SpotifySyncService', () => {
  let service: SpotifySyncService;

  beforeEach(() => {
    service = new SpotifySyncService();
    jest.clearAllMocks();
  });

  describe('processPendingSyncJobs', () => {
    it('should process pending sync jobs successfully', async () => {
      // Arrange
      const mockJobs = [
        {
          id: 'job_1',
          userId: 'user_1',
          jobType: 'USER_PLAYLISTS_SYNC',
          status: 'pending',
          parameters: { includePrivate: true },
          createdAt: new Date(),
        },
        {
          id: 'job_2',
          userId: 'user_2',
          jobType: 'RECENTLY_PLAYED_SYNC',
          status: 'pending',
          parameters: { limit: 50 },
          createdAt: new Date(),
        },
      ];

      mockPrisma.spotifySyncJob.findMany.mockResolvedValue(mockJobs);
      mockPrisma.spotifySyncJob.update.mockResolvedValue({} as any);
      
      const mockSpotifyClient = {
        getUserPlaylists: jest.fn().mockResolvedValue({ items: [] }),
        getRecentlyPlayedTracks: jest.fn().mockResolvedValue({ items: [] }),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Mock user with Spotify connection
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_1',
        spotifyConnection: {
          accessToken: 'encrypted_token',
          refreshToken: 'encrypted_refresh',
          expiresAt: new Date(Date.now() + 3600000),
        },
      } as any);

      // Act
      await service.processPendingSyncJobs();

      // Assert
      expect(mockPrisma.spotifySyncJob.findMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          createdAt: {
            gte: expect.any(Date), // Within 24 hours
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 10, // Batch size
      });

      expect(mockPrisma.spotifySyncJob.update).toHaveBeenCalledTimes(4); // 2 jobs × 2 updates each (running + completed)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Sync jobs processing completed',
        expect.objectContaining({
          processed: 2,
          successful: 2,
          failed: 0,
        })
      );
    });

    it('should handle job processing failures gracefully', async () => {
      // Arrange
      const mockJob = {
        id: 'job_fail',
        userId: 'user_1',
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'pending',
        parameters: {},
        createdAt: new Date(),
      };

      mockPrisma.spotifySyncJob.findMany.mockResolvedValue([mockJob]);
      mockPrisma.spotifySyncJob.update.mockResolvedValue({} as any);

      const mockSpotifyClient = {
        getUserPlaylists: jest.fn().mockRejectedValue(new Error('Spotify API error')),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_1',
        spotifyConnection: {
          accessToken: 'encrypted_token',
          refreshToken: 'encrypted_refresh',
          expiresAt: new Date(Date.now() + 3600000),
        },
      } as any);

      // Act
      await service.processPendingSyncJobs();

      // Assert
      expect(mockPrisma.spotifySyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job_fail' },
        data: {
          status: 'failed',
          completedAt: expect.any(Date),
          errorMessage: 'Spotify API error',
          retryCount: { increment: 1 },
        },
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Sync job failed',
        expect.objectContaining({
          jobId: 'job_fail',
          error: 'Spotify API error',
        })
      );
    });

    it('should skip jobs for users without Spotify connection', async () => {
      // Arrange
      const mockJob = {
        id: 'job_no_connection',
        userId: 'user_no_spotify',
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'pending',
        parameters: {},
        createdAt: new Date(),
      };

      mockPrisma.spotifySyncJob.findMany.mockResolvedValue([mockJob]);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user_no_spotify',
        spotifyConnection: null,
      } as any);

      // Act
      await service.processPendingSyncJobs();

      // Assert
      expect(mockPrisma.spotifySyncJob.update).toHaveBeenCalledWith({
        where: { id: 'job_no_connection' },
        data: {
          status: 'failed',
          completedAt: expect.any(Date),
          errorMessage: 'User Spotify connection not found',
          retryCount: { increment: 1 },
        },
      });
    });

    it('should retry failed jobs with exponential backoff', async () => {
      // Arrange
      const mockJob = {
        id: 'job_retry',
        userId: 'user_1',
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'pending',
        parameters: {},
        retryCount: 2, // Already failed twice
        createdAt: new Date(),
      };

      mockPrisma.spotifySyncJob.findMany.mockResolvedValue([mockJob]);
      
      // Act
      const result = await service.shouldRetryJob(mockJob as any);

      // Assert
      expect(result).toBe(true); // Should retry (max retries is 3)
    });

    it('should not retry jobs that exceeded max retries', async () => {
      // Arrange
      const mockJob = {
        id: 'job_max_retry',
        userId: 'user_1', 
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'failed',
        parameters: {},
        retryCount: 3, // Already failed 3 times
        createdAt: new Date(),
      };

      // Act
      const result = await service.shouldRetryJob(mockJob as any);

      // Assert
      expect(result).toBe(false); // Should not retry anymore
    });
  });

  describe('processPlaylistSyncJob', () => {
    it('should sync user playlists and update database', async () => {
      // Arrange
      const mockJob = {
        id: 'job_playlist',
        userId: 'user_1',
        parameters: { includePrivate: true },
      };

      const mockPlaylistsResponse = {
        items: [
          {
            id: 'playlist_1',
            name: 'My Playlist',
            description: 'Test playlist',
            tracks: { total: 10 },
            public: true,
            owner: { id: 'user_1' },
          },
        ],
      };

      const mockSpotifyClient = {
        getUserPlaylists: jest.fn().mockResolvedValue(mockPlaylistsResponse),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Act
      await service.processPlaylistSyncJob(mockJob as any, 'encrypted_token');

      // Assert
      expect(mockSpotifyClient.getUserPlaylists).toHaveBeenCalledWith('user_1', {
        includePrivate: true,
      });
      
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user_playlists:user_1',
        300, // 5 minutes cache
        expect.stringContaining('playlist_1')
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Playlist sync job completed',
        expect.objectContaining({
          jobId: 'job_playlist',
          userId: 'user_1',
          playlistCount: 1,
        })
      );
    });
  });

  describe('processRecentTracksSyncJob', () => {
    it('should sync recently played tracks', async () => {
      // Arrange  
      const mockJob = {
        id: 'job_recent',
        userId: 'user_1',
        parameters: { limit: 20 },
      };

      const mockRecentTracksResponse = {
        items: [
          {
            track: {
              id: 'track_1',
              name: 'Recent Song',
              artists: [{ name: 'Artist' }],
              album: { name: 'Album' },
            },
            played_at: '2023-12-01T10:00:00Z',
          },
        ],
      };

      const mockSpotifyClient = {
        getRecentlyPlayedTracks: jest.fn().mockResolvedValue(mockRecentTracksResponse),
      };
      (SpotifyApiClient.getInstance as jest.Mock).mockReturnValue(mockSpotifyClient);

      // Act
      await service.processRecentTracksSyncJob(mockJob as any, 'encrypted_token');

      // Assert
      expect(mockSpotifyClient.getRecentlyPlayedTracks).toHaveBeenCalledWith('user_1', {
        limit: 20,
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user_recent_tracks:user_1',
        600, // 10 minutes cache
        expect.stringContaining('track_1')
      );
    });
  });

  describe('cleanup operations', () => {
    it('should clean up old completed sync jobs', async () => {
      // Arrange
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      mockPrisma.spotifySyncJob.deleteMany.mockResolvedValue({ count: 5 });

      // Act
      await service.cleanupOldSyncJobs();

      // Assert
      expect(mockPrisma.spotifySyncJob.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              status: 'completed',
              completedAt: {
                lt: cutoffDate,
              },
            },
            {
              status: 'failed',
              completedAt: {
                lt: cutoffDate,
              },
            },
          ],
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Old sync jobs cleaned up',
        { deletedCount: 5 }
      );
    });

    it('should clean up expired Redis job queue entries', async () => {
      // Arrange
      const mockJobKeys = ['sync_job:job_1', 'sync_job:job_2', 'sync_job:job_3'];
      mockRedis.keys.mockResolvedValue(mockJobKeys);
      mockRedis.get
        .mockResolvedValueOnce(null) // job_1 expired
        .mockResolvedValueOnce('{"id":"job_2"}') // job_2 valid  
        .mockResolvedValueOnce(null); // job_3 expired

      mockRedis.del.mockResolvedValue(2);

      // Act
      await service.cleanupExpiredJobQueue();

      // Assert
      expect(mockRedis.keys).toHaveBeenCalledWith('sync_job:*');
      expect(mockRedis.del).toHaveBeenCalledWith('sync_job:job_1', 'sync_job:job_3');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Expired job queue entries cleaned up',
        { cleanedCount: 2 }
      );
    });
  });
});