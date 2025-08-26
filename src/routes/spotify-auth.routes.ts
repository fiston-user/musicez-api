import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { SpotifyAuthController } from '../controllers/spotify-auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { config } from '../config/environment';

const router = Router();
const spotifyAuthController = new SpotifyAuthController();

// Rate limiting specifically for Spotify OAuth operations
const spotifyOAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window per IP
  message: {
    success: false,
    error: {
      code: 'SPOTIFY_OAUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many Spotify authentication attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // Skip rate limiting in test environment
    return config.app.isTest;
  },
});

// More restrictive rate limiting for callback endpoint to prevent abuse
const callbackRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 attempts per window per IP
  message: {
    success: false,
    error: {
      code: 'CALLBACK_RATE_LIMIT_EXCEEDED',
      message: 'Too many callback attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // Skip rate limiting in test environment
    return config.app.isTest;
  },
});

/**
 * @route POST /api/v1/auth/spotify/connect
 * @description Initiate Spotify OAuth flow
 * @access Private (requires authentication)
 */
router.post(
  '/connect',
  spotifyOAuthRateLimit,
  authenticateToken,
  spotifyAuthController.connect.bind(spotifyAuthController)
);

/**
 * @route GET /api/v1/auth/spotify/callback
 * @description Handle Spotify OAuth callback
 * @access Public (but validates state token internally)
 */
router.get(
  '/callback',
  callbackRateLimit,
  spotifyAuthController.callback.bind(spotifyAuthController)
);

/**
 * @route GET /api/v1/auth/spotify/status
 * @description Get Spotify connection status for current user
 * @access Private (requires authentication)
 */
router.get(
  '/status',
  authenticateToken,
  spotifyAuthController.status.bind(spotifyAuthController)
);

/**
 * @route POST /api/v1/auth/spotify/disconnect
 * @description Disconnect Spotify account from current user
 * @access Private (requires authentication)
 */
router.post(
  '/disconnect',
  spotifyOAuthRateLimit,
  authenticateToken,
  spotifyAuthController.disconnect.bind(spotifyAuthController)
);

/**
 * @route POST /api/v1/auth/spotify/refresh
 * @description Refresh Spotify access tokens
 * @access Private (requires authentication)
 */
router.post(
  '/refresh',
  authenticateToken,
  spotifyAuthController.refresh.bind(spotifyAuthController)
);

export default router;