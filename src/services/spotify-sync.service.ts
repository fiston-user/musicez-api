import * as cron from 'node-cron';
import { PrismaClient, SpotifySyncJob } from '@prisma/client';
import { SpotifyApiClient } from '../utils/spotify-client';
import { redis } from '../config/redis';
import logger from '../utils/logger';

// Enum-like constants for job status and types (since they're strings in the schema)
export const JobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const JobType = {
  PLAYLIST_SYNC: 'playlist_sync',
  RECENT_TRACKS_SYNC: 'recent_tracks_sync',
} as const;

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus];
export type JobTypeType = (typeof JobType)[keyof typeof JobType];

export class SpotifySyncService {
  private readonly prisma: PrismaClient;
  private readonly spotifyClient: SpotifyApiClient;
  private isProcessing: boolean = false;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.spotifyClient = SpotifyApiClient.getInstance();
  }

  public async initializeScheduledJobs(): Promise<void> {
    // Background sync job - runs every 6 hours
    const backgroundSyncTask = cron.schedule('0 */6 * * *', async () => {
      if (!this.isProcessing) {
        logger.info('Starting scheduled background Spotify sync');
        await this.processQueuedJobs();
      }
    }, {
      name: 'background-spotify-sync',
    });

    // Playlist sync job - runs every 30 minutes
    const playlistSyncTask = cron.schedule('*/30 * * * *', async () => {
      if (!this.isProcessing) {
        logger.info('Starting scheduled playlist sync');
        await this.processPlaylistJobs();
      }
    }, {
      name: 'playlist-spotify-sync',
    });

    this.scheduledJobs.set('background-sync', backgroundSyncTask);
    this.scheduledJobs.set('playlist-sync', playlistSyncTask);

    logger.info('Spotify sync scheduled jobs initialized');
  }

  public startScheduler(): void {
    for (const [name, task] of this.scheduledJobs) {
      task.start();
      logger.info(`Started scheduled job: ${name}`);
    }
  }

  public stopScheduler(): void {
    for (const [name, task] of this.scheduledJobs) {
      task.stop();
      logger.info(`Stopped scheduled job: ${name}`);
    }
  }

  public async createSyncJob(
    userId: string,
    jobType: JobTypeType,
    parameters?: any
  ): Promise<SpotifySyncJob> {
    try {
      const job = await this.prisma.spotifySyncJob.create({
        data: {
          userId,
          jobType,
          status: JobStatus.PENDING,
          parameters: parameters || {},
          createdAt: new Date(),
        },
      });

      logger.info('Sync job created', {
        jobId: job.id,
        userId,
        jobType,
      });

      return job;
    } catch (error) {
      logger.error('Failed to create sync job', {
        userId,
        jobType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async processQueuedJobs(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Job processing already in progress, skipping');
      return;
    }

    this.isProcessing = true;
    logger.info('Starting Spotify sync job processing');

    try {
      const jobs = await this.prisma.spotifySyncJob.findMany({
        where: {
          status: JobStatus.PENDING,
        },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 10, // Process up to 10 jobs at a time
      });

      if (jobs.length === 0) {
        logger.info('No pending sync jobs found');
        return;
      }

      logger.info(`Processing ${jobs.length} sync jobs`);

      for (const job of jobs) {
        await this.processSingleJob(job);
      }

      logger.info('Completed processing all queued sync jobs');
    } catch (error) {
      logger.error('Error processing sync jobs', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleJob(job: SpotifySyncJob): Promise<void> {
    try {
      await this.prisma.spotifySyncJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.RUNNING,
          startedAt: new Date(),
        },
      });

      logger.info('Starting sync job', {
        jobId: job.id,
        jobType: job.jobType,
        userId: job.userId,
      });

      // Check if user has valid Spotify connection
      const hasValidConnection = await this.spotifyClient.hasValidConnection(job.userId);
      if (!hasValidConnection) {
        throw new Error('User does not have valid Spotify connection');
      }

      const userTokens = await this.spotifyClient.getUserTokens(job.userId);
      if (!userTokens) {
        throw new Error('Unable to retrieve user Spotify tokens');
      }

      switch (job.jobType) {
        case JobType.PLAYLIST_SYNC:
          await this.processPlaylistSyncJob(job, userTokens.accessToken);
          break;
        case JobType.RECENT_TRACKS_SYNC:
          await this.processRecentTracksJob(job, userTokens.accessToken);
          break;
        default:
          throw new Error(`Unsupported job type: ${job.jobType}`);
      }

      await this.prisma.spotifySyncJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      logger.info('Sync job completed successfully', {
        jobId: job.id,
        jobType: job.jobType,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.prisma.spotifySyncJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage,
          completedAt: new Date(),
          retryCount: {
            increment: 1,
          },
        },
      });

      logger.error('Sync job failed', {
        jobId: job.id,
        jobType: job.jobType,
        error: errorMessage,
      });
    }
  }

  public async processPlaylistSyncJob(job: SpotifySyncJob, _accessToken: string): Promise<void> {
    try {
      const playlists = await this.spotifyClient.getUserPlaylists(job.userId);

      // Cache the playlist data
      const cacheKey = `user_playlists:${job.userId}`;
      await redis.setex(cacheKey, 300, JSON.stringify(playlists)); // 5 minutes cache

      logger.info('Playlist sync job completed', {
        jobId: job.id,
        playlistCount: playlists?.items?.length || 0,
        userId: job.userId,
      });
    } catch (error) {
      logger.error('Playlist sync job failed', {
        jobId: job.id,
        userId: job.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async processRecentTracksJob(job: SpotifySyncJob, _accessToken: string): Promise<void> {
    try {
      // Handle parameters type safely
      const parameters = job.parameters as Record<string, any> || {};
      const limit = typeof parameters.limit === 'number' ? parameters.limit : 20;
      
      const recentTracks = await this.spotifyClient.getRecentlyPlayedTracks(job.userId, { limit });

      // Cache the recent tracks data
      const cacheKey = `user_recent_tracks:${job.userId}`;
      await redis.setex(cacheKey, 300, JSON.stringify(recentTracks)); // 5 minutes cache

      logger.info('Recent tracks sync job completed', {
        jobId: job.id,
        trackCount: recentTracks?.items?.length || 0,
        userId: job.userId,
      });
    } catch (error) {
      logger.error('Recent tracks sync job failed', {
        jobId: job.id,
        userId: job.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processPlaylistJobs(): Promise<void> {
    const playlistJobs = await this.prisma.spotifySyncJob.findMany({
      where: {
        jobType: JobType.PLAYLIST_SYNC,
        status: JobStatus.PENDING,
      },
      include: {
        user: true,
      },
      take: 5, // Limit playlist syncs
    });

    for (const job of playlistJobs) {
      await this.processSingleJob(job);
    }
  }

  public async getJobStatus(jobId: string): Promise<SpotifySyncJob | null> {
    return this.prisma.spotifySyncJob.findUnique({
      where: { id: jobId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  public async getUserJobs(userId: string, status?: JobStatusType): Promise<SpotifySyncJob[]> {
    const whereCondition: any = { userId };
    if (status) {
      whereCondition.status = status;
    }

    return this.prisma.spotifySyncJob.findMany({
      where: whereCondition,
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limit results
    });
  }

  public async cancelJob(jobId: string, userId: string): Promise<boolean> {
    try {
      const job = await this.prisma.spotifySyncJob.findFirst({
        where: {
          id: jobId,
          userId,
          status: {
            in: [JobStatus.PENDING, JobStatus.RUNNING],
          },
        },
      });

      if (!job) {
        return false;
      }

      await this.prisma.spotifySyncJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMessage: 'Job cancelled by user',
          completedAt: new Date(),
        },
      });

      logger.info('Sync job cancelled', {
        jobId,
        userId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to cancel sync job', {
        jobId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  public async cleanupOldJobs(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.prisma.spotifySyncJob.deleteMany({
        where: {
          completedAt: {
            lte: thirtyDaysAgo,
          },
          status: {
            in: [JobStatus.COMPLETED, JobStatus.FAILED],
          },
        },
      });

      logger.info('Cleaned up old sync jobs', {
        deletedCount: result.count,
        cutoffDate: thirtyDaysAgo,
      });
    } catch (error) {
      logger.error('Failed to cleanup old sync jobs', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async getStats(): Promise<{
    pendingJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
  }> {
    const [pending, running, completed, failed] = await Promise.all([
      this.prisma.spotifySyncJob.count({ where: { status: JobStatus.PENDING } }),
      this.prisma.spotifySyncJob.count({ where: { status: JobStatus.RUNNING } }),
      this.prisma.spotifySyncJob.count({ where: { status: JobStatus.COMPLETED } }),
      this.prisma.spotifySyncJob.count({ where: { status: JobStatus.FAILED } }),
    ]);

    return {
      pendingJobs: pending,
      runningJobs: running,
      completedJobs: completed,
      failedJobs: failed,
    };
  }

  public isJobProcessingActive(): boolean {
    return this.isProcessing;
  }

  public async retryFailedJob(jobId: string, userId: string): Promise<boolean> {
    try {
      const job = await this.prisma.spotifySyncJob.findFirst({
        where: {
          id: jobId,
          userId,
          status: JobStatus.FAILED,
        },
      });

      if (!job) {
        return false;
      }

      if (job.retryCount >= 3) {
        logger.warn('Job retry limit exceeded', {
          jobId,
          retryCount: job.retryCount,
        });
        return false;
      }

      await this.prisma.spotifySyncJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      });

      logger.info('Sync job queued for retry', {
        jobId,
        userId,
        retryCount: job.retryCount + 1,
      });

      return true;
    } catch (error) {
      logger.error('Failed to retry sync job', {
        jobId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}