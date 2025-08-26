import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AdminSpotifySyncController } from '../controllers/admin-spotify-sync.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { config } from '../config/environment';

const router = Router();
const controller = new AdminSpotifySyncController();

// Admin rate limiting (more restrictive)
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Max 50 requests per 15 minutes for admin operations
  message: {
    success: false,
    error: {
      code: 'ADMIN_RATE_LIMIT_EXCEEDED',
      message: 'Too many admin requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.app.isTest,
});

// Trigger operations rate limiting (very restrictive)
const triggerRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Max 5 trigger operations per 5 minutes
  message: {
    success: false,
    error: {
      code: 'TRIGGER_RATE_LIMIT_EXCEEDED',
      message: 'Too many trigger operations. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.app.isTest,
});

/**
 * @route POST /api/v1/admin/spotify/sync/trigger
 * @description Manually trigger sync job processing
 * @access Private - requires admin authentication
 */
router.post(
  '/sync/trigger',
  triggerRateLimit,
  authenticateToken,
  // TODO: Add admin authorization middleware
  controller.triggerSyncJobProcessing
);

/**
 * @route GET /api/v1/admin/spotify/sync/stats
 * @description Get sync job statistics and service status
 * @access Private - requires admin authentication
 */
router.get(
  '/sync/stats',
  adminRateLimit,
  authenticateToken,
  // TODO: Add admin authorization middleware
  controller.getSyncJobStats
);

/**
 * @route GET /api/v1/admin/spotify/sync/jobs
 * @description Get all sync jobs with filtering and pagination
 * @access Private - requires admin authentication
 */
router.get(
  '/sync/jobs',
  adminRateLimit,
  authenticateToken,
  // TODO: Add admin authorization middleware
  controller.getAllSyncJobs
);

/**
 * @route DELETE /api/v1/admin/spotify/sync/jobs/:jobId
 * @description Cancel a sync job
 * @access Private - requires admin authentication
 */
router.delete(
  '/sync/jobs/:jobId',
  adminRateLimit,
  authenticateToken,
  // TODO: Add admin authorization middleware
  controller.cancelSyncJob
);

/**
 * @route POST /api/v1/admin/spotify/sync/jobs/:jobId/retry
 * @description Retry a failed sync job
 * @access Private - requires admin authentication
 */
router.post(
  '/sync/jobs/:jobId/retry',
  triggerRateLimit,
  authenticateToken,
  // TODO: Add admin authorization middleware
  controller.retrySyncJob
);

export default router;