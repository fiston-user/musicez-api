import { PrismaClient } from '@prisma/client';

describe('Spotify Integration Database Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    
    // Clean test database - order matters due to foreign key constraints
    await prisma.spotifySyncJob.deleteMany();
    await prisma.spotifyConnection.deleteMany();
    await prisma.userPreference.deleteMany();
    await prisma.recommendedSong.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.song.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('SpotifyConnection Model', () => {
    let userId: string;

    beforeEach(async () => {
      // Clean up connections and users
      await prisma.spotifyConnection.deleteMany();
      await prisma.user.deleteMany();
      
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'spotify-test@example.com',
          password: '$2b$12$testHashedPassword123456789',
          name: 'Spotify Test User',
        },
      });
      userId = user.id;
    });

    it('should create a Spotify connection with encrypted tokens', async () => {
      const connection = await prisma.spotifyConnection.create({
        data: {
          userId,
          spotifyUserId: 'spotify_user_123',
          accessToken: 'encrypted_access_token_data_here',
          refreshToken: 'encrypted_refresh_token_data_here',
          tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          scope: 'user-read-private user-library-read playlist-read-private',
          displayName: 'Test Spotify User',
        },
      });

      expect(connection.id).toBeDefined();
      expect(connection.userId).toBe(userId);
      expect(connection.spotifyUserId).toBe('spotify_user_123');
      expect(connection.accessToken).toBe('encrypted_access_token_data_here');
      expect(connection.refreshToken).toBe('encrypted_refresh_token_data_here');
      expect(connection.scope).toBe('user-read-private user-library-read playlist-read-private');
      expect(connection.displayName).toBe('Test Spotify User');
      expect(connection.createdAt).toBeInstanceOf(Date);
      expect(connection.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce unique userId constraint', async () => {
      // Create first connection
      await prisma.spotifyConnection.create({
        data: {
          userId,
          spotifyUserId: 'spotify_user_first',
          accessToken: 'encrypted_token_1',
          refreshToken: 'encrypted_refresh_1',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          scope: 'user-read-private',
        },
      });

      // Attempt to create second connection for same user should fail
      await expect(
        prisma.spotifyConnection.create({
          data: {
            userId,
            spotifyUserId: 'spotify_user_second',
            accessToken: 'encrypted_token_2',
            refreshToken: 'encrypted_refresh_2',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            scope: 'user-read-private',
          },
        })
      ).rejects.toThrow();
    });

    it('should enforce unique spotifyUserId constraint', async () => {
      const spotifyUserId = 'unique_spotify_user_123';
      
      // Create first connection
      await prisma.spotifyConnection.create({
        data: {
          userId,
          spotifyUserId,
          accessToken: 'encrypted_token_1',
          refreshToken: 'encrypted_refresh_1',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          scope: 'user-read-private',
        },
      });

      // Create another user
      const user2 = await prisma.user.create({
        data: {
          email: 'spotify-test2@example.com',
          password: '$2b$12$testHashedPassword123456789',
          name: 'Second Spotify User',
        },
      });

      // Attempt to create connection with same Spotify user ID should fail
      await expect(
        prisma.spotifyConnection.create({
          data: {
            userId: user2.id,
            spotifyUserId,
            accessToken: 'encrypted_token_2',
            refreshToken: 'encrypted_refresh_2',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            scope: 'user-read-private',
          },
        })
      ).rejects.toThrow();
    });

    it('should find connection by userId', async () => {
      await prisma.spotifyConnection.create({
        data: {
          userId,
          spotifyUserId: 'findable_user_123',
          accessToken: 'encrypted_token',
          refreshToken: 'encrypted_refresh',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          scope: 'user-read-private',
        },
      });

      const connection = await prisma.spotifyConnection.findUnique({
        where: { userId },
        include: { user: true },
      });

      expect(connection).toBeDefined();
      expect(connection?.userId).toBe(userId);
      expect(connection?.user.email).toBe('spotify-test@example.com');
    });

    it('should update token expiration and refresh token', async () => {
      const connection = await prisma.spotifyConnection.create({
        data: {
          userId,
          spotifyUserId: 'updatable_user_123',
          accessToken: 'old_encrypted_token',
          refreshToken: 'old_encrypted_refresh',
          tokenExpiresAt: new Date(Date.now() + 1000), // Soon to expire
          scope: 'user-read-private',
        },
      });

      const newExpiresAt = new Date(Date.now() + 7200000); // 2 hours from now
      const updated = await prisma.spotifyConnection.update({
        where: { id: connection.id },
        data: {
          accessToken: 'new_encrypted_token',
          refreshToken: 'new_encrypted_refresh',
          tokenExpiresAt: newExpiresAt,
        },
      });

      expect(updated.accessToken).toBe('new_encrypted_token');
      expect(updated.refreshToken).toBe('new_encrypted_refresh');
      expect(updated.tokenExpiresAt).toEqual(newExpiresAt);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(updated.createdAt.getTime());
    });

    it('should cascade delete when user is deleted', async () => {
      await prisma.spotifyConnection.create({
        data: {
          userId,
          spotifyUserId: 'cascade_test_user',
          accessToken: 'encrypted_token',
          refreshToken: 'encrypted_refresh',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          scope: 'user-read-private',
        },
      });

      // Delete user - should cascade to Spotify connection
      await prisma.user.delete({
        where: { id: userId },
      });

      // Connection should be deleted
      const connection = await prisma.spotifyConnection.findUnique({
        where: { userId },
      });
      expect(connection).toBeNull();
    });
  });

  describe('SpotifySyncJob Model', () => {
    let userId: string;

    beforeEach(async () => {
      // Clean up sync jobs and users
      await prisma.spotifySyncJob.deleteMany();
      await prisma.user.deleteMany();
      
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'sync-job-test@example.com',
          password: '$2b$12$testHashedPassword123456789',
          name: 'Sync Job Test User',
        },
      });
      userId = user.id;
    });

    it('should create sync job with default status pending', async () => {
      const job = await prisma.spotifySyncJob.create({
        data: {
          jobType: 'track_sync',
          targetId: 'spotify_track_123',
          userId,
          parameters: {
            refreshMetadata: true,
            includeAudioFeatures: true,
          },
        },
      });

      expect(job.id).toBeDefined();
      expect(job.jobType).toBe('track_sync');
      expect(job.status).toBe('pending');
      expect(job.targetId).toBe('spotify_track_123');
      expect(job.parameters).toEqual({
        refreshMetadata: true,
        includeAudioFeatures: true,
      });
      expect(job.retryCount).toBe(0);
      expect(job.createdAt).toBeInstanceOf(Date);
    });

    it('should support different job types', async () => {
      const jobTypes = ['track_sync', 'user_library', 'popularity_update', 'playlist_sync'];
      
      for (const jobType of jobTypes) {
        const job = await prisma.spotifySyncJob.create({
          data: {
            jobType,
            userId,
            targetId: `test_target_${jobType}`,
          },
        });
        
        expect(job.jobType).toBe(jobType);
      }
    });

    it('should update job status from pending to running to completed', async () => {
      const job = await prisma.spotifySyncJob.create({
        data: {
          jobType: 'user_library',
          userId,
        },
      });

      // Update to running
      const running = await prisma.spotifySyncJob.update({
        where: { id: job.id },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });
      expect(running.status).toBe('running');
      expect(running.startedAt).toBeInstanceOf(Date);

      // Update to completed
      const completed = await prisma.spotifySyncJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          itemsProcessed: 50,
          totalItems: 50,
        },
      });
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeInstanceOf(Date);
      expect(completed.itemsProcessed).toBe(50);
      expect(completed.totalItems).toBe(50);
    });

    it('should handle failed jobs with error messages and retry count', async () => {
      const job = await prisma.spotifySyncJob.create({
        data: {
          jobType: 'track_sync',
          userId,
          targetId: 'failing_track_123',
        },
      });

      const failed = await prisma.spotifySyncJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: 'Spotify API rate limit exceeded',
          retryCount: 3,
          completedAt: new Date(),
        },
      });

      expect(failed.status).toBe('failed');
      expect(failed.errorMessage).toBe('Spotify API rate limit exceeded');
      expect(failed.retryCount).toBe(3);
    });

    it('should find jobs by status and user', async () => {
      // Create jobs with different statuses
      await prisma.spotifySyncJob.createMany({
        data: [
          {
            jobType: 'track_sync',
            userId,
            status: 'pending',
            targetId: 'track_1',
          },
          {
            jobType: 'user_library',
            userId,
            status: 'running',
            targetId: 'library_sync',
          },
          {
            jobType: 'popularity_update',
            userId,
            status: 'completed',
            targetId: 'popularity_job',
          },
        ],
      });

      // Find pending jobs
      const pendingJobs = await prisma.spotifySyncJob.findMany({
        where: {
          userId,
          status: 'pending',
        },
      });
      expect(pendingJobs.length).toBe(1);
      expect(pendingJobs[0].jobType).toBe('track_sync');

      // Find running jobs
      const runningJobs = await prisma.spotifySyncJob.findMany({
        where: { status: 'running' },
      });
      expect(runningJobs.length).toBe(1);
      expect(runningJobs[0].jobType).toBe('user_library');
    });

    it('should order jobs by creation date for processing queue', async () => {
      const now = new Date();
      
      // Create jobs with slight time differences
      await prisma.spotifySyncJob.create({
        data: {
          jobType: 'track_sync',
          userId,
          targetId: 'first_job',
          createdAt: new Date(now.getTime() - 2000),
        },
      });

      await prisma.spotifySyncJob.create({
        data: {
          jobType: 'track_sync',
          userId,
          targetId: 'second_job',
          createdAt: new Date(now.getTime() - 1000),
        },
      });

      await prisma.spotifySyncJob.create({
        data: {
          jobType: 'track_sync',
          userId,
          targetId: 'third_job',
          createdAt: now,
        },
      });

      // Get jobs ordered by creation date (oldest first for processing)
      const orderedJobs = await prisma.spotifySyncJob.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
      });

      expect(orderedJobs.length).toBe(3);
      expect(orderedJobs[0].targetId).toBe('first_job');
      expect(orderedJobs[1].targetId).toBe('second_job');
      expect(orderedJobs[2].targetId).toBe('third_job');
    });

    it('should include user relationship in queries', async () => {
      const job = await prisma.spotifySyncJob.create({
        data: {
          jobType: 'playlist_sync',
          userId,
          parameters: {
            playlistId: 'spotify_playlist_123',
          },
        },
      });

      const jobWithUser = await prisma.spotifySyncJob.findUnique({
        where: { id: job.id },
        include: { user: true },
      });

      expect(jobWithUser?.user).toBeDefined();
      expect(jobWithUser?.user.email).toBe('sync-job-test@example.com');
    });

    it('should cascade delete when user is deleted', async () => {
      await prisma.spotifySyncJob.create({
        data: {
          jobType: 'user_library',
          userId,
          status: 'pending',
        },
      });

      // Delete user - should cascade to sync jobs
      await prisma.user.delete({
        where: { id: userId },
      });

      // Jobs should be deleted
      const jobs = await prisma.spotifySyncJob.findMany({
        where: { userId },
      });
      expect(jobs.length).toBe(0);
    });
  });

  describe('Song Model Spotify Extensions', () => {
    it('should support existing Spotify-related fields', async () => {
      const song = await prisma.song.create({
        data: {
          title: 'Spotify Integrated Song',
          artist: 'Spotify Artist',
          album: 'Spotify Album',
          spotifyId: '4iV5W9uYEdYUVa79Axb7Rh', // Real Spotify track ID format
          genre: 'pop',
          releaseYear: 2023,
          tempo: 128.5,
          energy: 0.75,
          danceability: 0.68,
          valence: 0.82,
          acousticness: 0.15,
          instrumentalness: 0.001,
          popularity: 85,
          duration: 210000, // 3.5 minutes in milliseconds
          previewUrl: 'https://p.scdn.co/mp3-preview/example',
        },
      });

      expect(song.spotifyId).toBe('4iV5W9uYEdYUVa79Axb7Rh');
      expect(song.tempo).toBe(128.5);
      expect(song.energy).toBe(0.75);
      expect(song.danceability).toBe(0.68);
      expect(song.valence).toBe(0.82);
      expect(song.acousticness).toBe(0.15);
      expect(song.instrumentalness).toBe(0.001);
      expect(song.popularity).toBe(85);
      expect(song.previewUrl).toBe('https://p.scdn.co/mp3-preview/example');
    });

    it('should enforce unique spotifyId constraint', async () => {
      const spotifyId = '1A2B3C4D5E6F7G8H9I0J';
      
      await prisma.song.create({
        data: {
          title: 'First Song',
          artist: 'Artist 1',
          spotifyId,
        },
      });

      // Attempt to create another song with same Spotify ID should fail
      await expect(
        prisma.song.create({
          data: {
            title: 'Second Song',
            artist: 'Artist 2',
            spotifyId,
          },
        })
      ).rejects.toThrow();
    });

    it('should find songs by spotifyId using index', async () => {
      const spotifyId = 'indexed_spotify_track_123';
      
      await prisma.song.create({
        data: {
          title: 'Indexed Song',
          artist: 'Indexed Artist',
          spotifyId,
          popularity: 75,
        },
      });

      const song = await prisma.song.findUnique({
        where: { spotifyId },
      });

      expect(song).toBeDefined();
      expect(song?.title).toBe('Indexed Song');
      expect(song?.popularity).toBe(75);
    });
  });

  describe('Database Indexes and Performance', () => {
    it('should efficiently query SpotifyConnections by userId', async () => {
      // Create test user
      const user = await prisma.user.create({
        data: {
          email: 'index-test@example.com',
          password: '$2b$12$testPassword',
          name: 'Index Test User',
        },
      });

      await prisma.spotifyConnection.create({
        data: {
          userId: user.id,
          spotifyUserId: 'performance_test_user',
          accessToken: 'encrypted_token',
          refreshToken: 'encrypted_refresh',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          scope: 'user-read-private',
        },
      });

      // This query should use the unique index on userId
      const connection = await prisma.spotifyConnection.findUnique({
        where: { userId: user.id },
      });
      
      expect(connection).toBeDefined();
    });

    it('should efficiently query SpotifySyncJobs by status', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'status-test@example.com',
          password: '$2b$12$testPassword',
          name: 'Status Test User',
        },
      });

      // Create multiple jobs
      await prisma.spotifySyncJob.createMany({
        data: [
          { jobType: 'track_sync', userId: user.id, status: 'pending' },
          { jobType: 'user_library', userId: user.id, status: 'running' },
          { jobType: 'popularity_update', userId: user.id, status: 'completed' },
        ],
      });

      // This query should use the index on status
      const pendingJobs = await prisma.spotifySyncJob.findMany({
        where: { status: 'pending' },
      });
      
      expect(pendingJobs.length).toBe(1);
    });
  });

  describe('Transaction Support for Spotify Operations', () => {
    it('should support transactions for creating user and Spotify connection', async () => {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: 'transaction-spotify@example.com',
            password: '$2b$12$transactionPassword',
            name: 'Transaction Spotify User',
          },
        });

        const connection = await tx.spotifyConnection.create({
          data: {
            userId: user.id,
            spotifyUserId: 'transaction_spotify_user',
            accessToken: 'encrypted_transaction_token',
            refreshToken: 'encrypted_transaction_refresh',
            tokenExpiresAt: new Date(Date.now() + 3600000),
            scope: 'user-read-private',
          },
        });

        return { user, connection };
      });

      expect(result.user.email).toBe('transaction-spotify@example.com');
      expect(result.connection.userId).toBe(result.user.id);
    });

    it('should rollback transaction if sync job creation fails', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'rollback-test@example.com',
          password: '$2b$12$rollbackPassword',
          name: 'Rollback Test User',
        },
      });

      const initialJobCount = await prisma.spotifySyncJob.count();

      try {
        await prisma.$transaction(async (tx) => {
          await tx.spotifySyncJob.create({
            data: {
              jobType: 'track_sync',
              userId: user.id,
            },
          });

          // Force error to test rollback
          throw new Error('Transaction rollback test');
        });
      } catch (error) {
        expect((error as Error).message).toBe('Transaction rollback test');
      }

      const finalJobCount = await prisma.spotifySyncJob.count();
      expect(finalJobCount).toBe(initialJobCount);
    });
  });
});