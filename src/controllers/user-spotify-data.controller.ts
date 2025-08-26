import { Response, NextFunction } from 'express';
import { SpotifyApiClient } from '../utils/spotify-client';
import { prisma } from '../database/prisma';
import { redis } from '../config/redis';
import logger from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { 
  formatUserPlaylistsResponse, 
  formatRecentTracksResponse,
  formatSyncJobResponse,
  formatUserSyncJobsResponse,
  userDataErrorResponses 
} from '../utils/user-data-formatters';

export class UserSpotifyDataController {
  private readonly spotifyClient: SpotifyApiClient;

  constructor() {
    this.spotifyClient = SpotifyApiClient.getInstance();
  }

  public getUserPlaylists = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const userId = req.user!.id;

    try {
      logger.info('User playlists requested', {
        userId,
        ip: req.ip,
        requestId,
      });

      // Check cache first
      const cacheKey = `user_playlists:${userId}`;
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        const playlists = JSON.parse(cachedData);
        const processingTime = Date.now() - startTime;

        logger.info('User playlists retrieved from cache', {
          userId,
          playlistCount: playlists.items?.length || 0,
          processingTime,
          requestId,
        });

        const response = formatUserPlaylistsResponse(playlists, requestId);
        res.status(200).json(response);
        return;
      }

      // Fetch from Spotify API
      const playlists = await this.spotifyClient.getUserPlaylists(userId);

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(playlists));

      const processingTime = Date.now() - startTime;

      logger.info('User playlists retrieved', {
        userId,
        playlistCount: playlists.items?.length || 0,
        processingTime,
        requestId,
      });

      const response = formatUserPlaylistsResponse(playlists, requestId);
      res.status(200).json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('User playlists retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        processingTime,
        requestId,
      });

      const errorResponse = userDataErrorResponses.internalError(requestId);
      res.status(500).json(errorResponse);
    }
  };

  public getRecentlyPlayedTracks = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const userId = req.user!.id;

    try {
      // Validate limit parameter
      const limitParam = req.query.limit as string;
      let limit = 20; // Default limit

      if (limitParam) {
        const parsedLimit = parseInt(limitParam, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
          const errorResponse = userDataErrorResponses.validationError(
            'Invalid limit parameter. Must be a number between 1 and 50.',
            requestId
          );
          res.status(400).json(errorResponse);
          return;
        }
        limit = parsedLimit;
      }

      logger.info('Recently played tracks requested', {
        userId,
        limit,
        ip: req.ip,
        requestId,
      });

      // Check cache first
      const cacheKey = `user_recent_tracks:${userId}`;
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        const tracks = JSON.parse(cachedData);
        const processingTime = Date.now() - startTime;

        logger.info('Recently played tracks retrieved from cache', {
          userId,
          trackCount: tracks.items?.length || 0,
          processingTime,
          requestId,
        });

        const response = formatRecentTracksResponse(tracks, requestId);
        res.status(200).json(response);
        return;
      }

      // Fetch from Spotify API
      const tracks = await this.spotifyClient.getRecentlyPlayedTracks(userId, { limit });

      // Cache for 10 minutes
      await redis.setex(cacheKey, 600, JSON.stringify(tracks));

      const processingTime = Date.now() - startTime;

      logger.info('Recently played tracks retrieved', {
        userId,
        trackCount: tracks.items?.length || 0,
        processingTime,
        requestId,
      });

      const response = formatRecentTracksResponse(tracks, requestId);
      res.status(200).json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Recently played tracks retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        processingTime,
        requestId,
      });

      const errorResponse = userDataErrorResponses.internalError(requestId);
      res.status(500).json(errorResponse);
    }
  };

  public queuePlaylistSync = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const requestId = res.locals.requestId;
    const userId = req.user!.id;

    try {
      const { includePrivate = false } = req.body;

      logger.info('Playlist sync job requested', {
        userId,
        includePrivate,
        ip: req.ip,
        requestId,
      });

      // Create sync job
      const syncJob = await prisma.spotifySyncJob.create({
        data: {
          userId,
          jobType: 'USER_PLAYLISTS_SYNC',
          status: 'pending',
          parameters: { includePrivate },
        },
      });

      // Add to Redis job queue
      await redis.setex(`sync_job:${syncJob.id}`, 3600, JSON.stringify(syncJob)); // 1 hour TTL

      logger.info('Playlist sync job queued', {
        jobId: syncJob.id,
        userId,
        requestId,
      });

      const response = formatSyncJobResponse(syncJob.id, 'queued', '2-5 minutes', requestId);
      res.status(202).json(response);

    } catch (error) {
      logger.error('Playlist sync job creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        requestId,
      });

      const errorResponse = userDataErrorResponses.internalError(requestId);
      res.status(500).json(errorResponse);
    }
  };

  public queueRecentTracksSync = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const requestId = res.locals.requestId;
    const userId = req.user!.id;

    try {
      const { limit = 20 } = req.body;

      logger.info('Recent tracks sync job requested', {
        userId,
        limit,
        ip: req.ip,
        requestId,
      });

      // Create sync job
      const syncJob = await prisma.spotifySyncJob.create({
        data: {
          userId,
          jobType: 'RECENTLY_PLAYED_SYNC',
          status: 'pending',
          parameters: { limit },
        },
      });

      // Add to Redis job queue
      await redis.setex(`sync_job:${syncJob.id}`, 3600, JSON.stringify(syncJob)); // 1 hour TTL

      logger.info('Recent tracks sync job queued', {
        jobId: syncJob.id,
        userId,
        requestId,
      });

      const response = formatSyncJobResponse(syncJob.id, 'queued', '1-3 minutes', requestId);
      res.status(202).json(response);

    } catch (error) {
      logger.error('Recent tracks sync job creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        requestId,
      });

      const errorResponse = userDataErrorResponses.internalError(requestId);
      res.status(500).json(errorResponse);
    }
  };

  public getUserSyncJobs = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId;
    const userId = req.user!.id;

    try {
      // Parse pagination parameters
      const limitParam = req.query.limit as string;
      const offsetParam = req.query.offset as string;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

      logger.info('User sync jobs requested', {
        userId,
        limit,
        offset,
        ip: req.ip,
        requestId,
      });

      // Fetch user sync jobs
      const jobs = await prisma.spotifySyncJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const processingTime = Date.now() - startTime;

      logger.info('User sync jobs retrieved', {
        userId,
        jobCount: jobs.length,
        processingTime,
        requestId,
      });

      const response = formatUserSyncJobsResponse(jobs, requestId);
      res.status(200).json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('User sync jobs retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        processingTime,
        requestId,
      });

      const errorResponse = userDataErrorResponses.internalError(requestId);
      res.status(500).json(errorResponse);
    }
  };
}