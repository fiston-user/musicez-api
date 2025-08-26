import { Response, NextFunction } from 'express';
import { SpotifySyncService } from '../services/spotify-sync.service';
import { prisma } from '../database/prisma';
import logger from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class AdminSpotifySyncController {
  private readonly spotifySyncService: SpotifySyncService;

  constructor() {
    this.spotifySyncService = new SpotifySyncService(prisma);
  }

  public triggerSyncJobProcessing = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const adminUserId = req.user!.id;

    try {
      logger.info('Manual sync job processing triggered', {
        adminUserId,
        ip: req.ip,
        requestId,
      });

      // Trigger sync processing (non-blocking)
      this.spotifySyncService.processQueuedJobs().catch(error => {
        logger.error('Manual sync job processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          adminUserId,
        });
      });

      const processingTime = Date.now() - startTime;

      logger.info('Sync job processing triggered successfully', {
        adminUserId,
        processingTime,
        requestId,
      });

      res.status(202).json({
        success: true,
        data: {
          message: 'Sync job processing has been triggered',
          timestamp: new Date().toISOString(),
        },
        requestId,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Manual sync job trigger failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId,
        processingTime,
        requestId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to trigger sync job processing',
        },
        requestId,
      });
    }
  };

  public getSyncJobStats = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const adminUserId = req.user!.id;

    try {
      logger.info('Sync job stats requested', {
        adminUserId,
        ip: req.ip,
        requestId,
      });

      // Get job counts by status
      const stats = await this.spotifySyncService.getStats();

      // Get recent job counts (last 24 hours)
      const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentJobs = await prisma.spotifySyncJob.count({
        where: {
          createdAt: { gte: recentCutoff },
        },
      });

      // Get service status
      const serviceStatus = {
        isRunning: this.spotifySyncService.isJobProcessingActive(),
      };

      const processingTime = Date.now() - startTime;

      logger.info('Sync job stats retrieved', {
        adminUserId,
        totalJobs: stats.pendingJobs + stats.runningJobs + stats.completedJobs + stats.failedJobs,
        processingTime,
        requestId,
      });

      res.status(200).json({
        success: true,
        data: {
          jobCounts: {
            pending: stats.pendingJobs,
            running: stats.runningJobs,
            completed: stats.completedJobs,
            failed: stats.failedJobs,
            total: stats.pendingJobs + stats.runningJobs + stats.completedJobs + stats.failedJobs,
          },
          recentActivity: {
            last24Hours: recentJobs,
          },
          serviceStatus,
        },
        timestamp: new Date().toISOString(),
        requestId,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Sync job stats retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId,
        processingTime,
        requestId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve sync job statistics',
        },
        requestId,
      });
    }
  };

  public getAllSyncJobs = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const adminUserId = req.user!.id;

    try {
      // Parse query parameters
      const limitParam = req.query.limit as string;
      const offsetParam = req.query.offset as string;
      const statusParam = req.query.status as string;
      const userIdParam = req.query.userId as string;

      const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20; // Max 100
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

      const whereClause: any = {};
      if (statusParam && ['pending', 'running', 'completed', 'failed'].includes(statusParam)) {
        whereClause.status = statusParam;
      }
      if (userIdParam) {
        whereClause.userId = userIdParam;
      }

      logger.info('All sync jobs requested', {
        adminUserId,
        limit,
        offset,
        status: statusParam,
        userId: userIdParam,
        ip: req.ip,
        requestId,
      });

      const [jobs, totalCount] = await Promise.all([
        prisma.spotifySyncJob.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            user: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        }),
        prisma.spotifySyncJob.count({ where: whereClause }),
      ]);

      const processingTime = Date.now() - startTime;

      logger.info('All sync jobs retrieved', {
        adminUserId,
        jobCount: jobs.length,
        totalCount,
        processingTime,
        requestId,
      });

      const formattedJobs = jobs.map(job => ({
        id: job.id,
        userId: job.userId,
        userEmail: job.user?.email || null,
        userName: job.user?.name || null,
        jobType: job.jobType,
        status: job.status,
        parameters: job.parameters,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
        processingTimeMs: job.startedAt && job.completedAt 
          ? job.completedAt.getTime() - job.startedAt.getTime()
          : null,
        retryCount: job.retryCount || 0,
        errorMessage: job.errorMessage || null,
      }));

      res.status(200).json({
        success: true,
        data: {
          jobs: formattedJobs,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + jobs.length < totalCount,
          },
        },
        timestamp: new Date().toISOString(),
        requestId,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('All sync jobs retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId,
        processingTime,
        requestId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve sync jobs',
        },
        requestId,
      });
    }
  };

  public cancelSyncJob = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const adminUserId = req.user!.id;
    const jobId = req.params.jobId;

    try {
      logger.info('Sync job cancellation requested', {
        adminUserId,
        jobId,
        ip: req.ip,
        requestId,
      });

      // Check if job exists and can be cancelled
      const job = await prisma.spotifySyncJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        res.status(404).json({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Sync job not found',
          },
          requestId,
        });
        return;
      }

      if (job.status === 'completed') {
        res.status(400).json({
          success: false,
          error: {
            code: 'JOB_ALREADY_COMPLETED',
            message: 'Cannot cancel a completed job',
          },
          requestId,
        });
        return;
      }

      if (job.status === 'failed') {
        res.status(400).json({
          success: false,
          error: {
            code: 'JOB_ALREADY_FAILED',
            message: 'Job has already failed',
          },
          requestId,
        });
        return;
      }

      // Cancel the job
      await this.spotifySyncService.cancelJob(jobId, job.userId);

      const processingTime = Date.now() - startTime;

      logger.info('Sync job cancelled successfully', {
        adminUserId,
        jobId,
        processingTime,
        requestId,
      });

      res.status(200).json({
        success: true,
        data: {
          message: 'Sync job has been cancelled',
          jobId,
          timestamp: new Date().toISOString(),
        },
        requestId,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Sync job cancellation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId,
        jobId,
        processingTime,
        requestId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to cancel sync job',
        },
        requestId,
      });
    }
  };

  public retrySyncJob = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const adminUserId = req.user!.id;
    const jobId = req.params.jobId;

    try {
      logger.info('Sync job retry requested', {
        adminUserId,
        jobId,
        ip: req.ip,
        requestId,
      });

      // Check if job exists and can be retried
      const job = await prisma.spotifySyncJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        res.status(404).json({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Sync job not found',
          },
          requestId,
        });
        return;
      }

      if (job.status !== 'failed') {
        res.status(400).json({
          success: false,
          error: {
            code: 'JOB_NOT_FAILED',
            message: 'Can only retry failed jobs',
          },
          requestId,
        });
        return;
      }

      // Reset job to pending status
      await prisma.spotifySyncJob.update({
        where: { id: jobId },
        data: {
          status: 'pending',
          startedAt: null,
          completedAt: null,
          errorMessage: null,
        },
      });

      const processingTime = Date.now() - startTime;

      logger.info('Sync job marked for retry', {
        adminUserId,
        jobId,
        processingTime,
        requestId,
      });

      res.status(200).json({
        success: true,
        data: {
          message: 'Sync job has been marked for retry',
          jobId,
          timestamp: new Date().toISOString(),
        },
        requestId,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Sync job retry failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUserId,
        jobId,
        processingTime,
        requestId,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retry sync job',
        },
        requestId,
      });
    }
  };
}