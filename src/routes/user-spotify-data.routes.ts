import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { UserSpotifyDataController } from '../controllers/user-spotify-data.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import spotifyTokenMiddleware from '../middleware/spotify-token.middleware';
import { validateUserSpotifyRequest } from '../schemas/user-spotify-data.schemas';
import { config } from '../config/environment';

const router = Router();
const controller = new UserSpotifyDataController();

// Rate limiting for user Spotify data endpoints
const spotifyDataRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Higher limit for data endpoints
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.app.isTest,
});

// Sync operation rate limiting (more restrictive)
const syncRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 sync operations per hour
  message: {
    success: false,
    error: {
      code: 'SYNC_RATE_LIMIT_EXCEEDED',
      message: 'Too many sync operations. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.app.isTest,
});

/**
 * @route GET /api/v1/user/spotify/playlists
 * @description Get user's Spotify playlists
 * @access Private - requires authentication and Spotify connection
 */
router.get(
  '/playlists',
  spotifyDataRateLimit,
  authenticateToken,
  spotifyTokenMiddleware.requireSpotifyConnection,
  spotifyTokenMiddleware.refreshTokenIfNeeded,
  spotifyTokenMiddleware.validateTokenScopes(['playlist-read-private']),
  controller.getUserPlaylists
);

/**
 * @route GET /api/v1/user/spotify/recently-played
 * @description Get user's recently played tracks
 * @access Private - requires authentication and Spotify connection
 */
router.get(
  '/recently-played',
  spotifyDataRateLimit,
  authenticateToken,
  spotifyTokenMiddleware.requireSpotifyConnection,
  spotifyTokenMiddleware.refreshTokenIfNeeded,
  spotifyTokenMiddleware.validateTokenScopes(['user-read-recently-played']),
  controller.getRecentlyPlayedTracks
);

/**
 * @route POST /api/v1/user/spotify/sync/playlists
 * @description Queue playlist sync job
 * @access Private - requires authentication and Spotify connection
 */
router.post(
  '/sync/playlists',
  syncRateLimit,
  authenticateToken,
  spotifyTokenMiddleware.requireSpotifyConnection,
  spotifyTokenMiddleware.validateTokenScopes(['playlist-read-private']),
  validateUserSpotifyRequest.playlistSyncRequest,
  controller.queuePlaylistSync
);

/**
 * @route POST /api/v1/user/spotify/sync/recent-tracks
 * @description Queue recent tracks sync job
 * @access Private - requires authentication and Spotify connection
 */
router.post(
  '/sync/recent-tracks',
  syncRateLimit,
  authenticateToken,
  spotifyTokenMiddleware.requireSpotifyConnection,
  spotifyTokenMiddleware.validateTokenScopes(['user-read-recently-played']),
  validateUserSpotifyRequest.recentTracksSyncRequest,
  controller.queueRecentTracksSync
);

/**
 * @route GET /api/v1/user/spotify/sync/jobs
 * @description Get user's sync job history
 * @access Private - requires authentication
 */
router.get(
  '/sync/jobs',
  spotifyDataRateLimit,
  authenticateToken,
  controller.getUserSyncJobs
);

export default router;