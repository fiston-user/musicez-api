import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { config } from '../config/environment';
import logger from '../utils/logger';
import { authenticateToken } from '../middleware/auth.middleware';
import { 
  validateRecommendationRequest,
  validateBatchRecommendationRequest 
} from '../schemas/recommendation.schemas';
import { recommendationController } from '../controllers/recommendation.controller';

const router = Router();

// Rate limiting for single recommendations - 10 requests per minute (expensive AI operations)
const recommendationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.app.isTest, // Skip rate limiting in tests
  keyGenerator: (req) => {
    const authenticatedReq = req as any;
    if (authenticatedReq.user?.id) {
      return `rec:${authenticatedReq.user.id}`;
    }
    // For unauthenticated users, use a combination of IP and user-agent for IPv6 compatibility
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    return `rec_ip:${ip}:${userAgent.substring(0, 50)}`;
  },
  validate: {
    keyGeneratorIpFallback: false
  },
  handler: (req, res) => {
    const userId = (req as any).user?.id;
    const requestId = res.locals.requestId || 'unknown';
    
    logger.warn('Recommendation rate limit exceeded', {
      userId,
      ip: req.ip,
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
      requestId,
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'RECOMMENDATION_RATE_LIMIT_EXCEEDED',
        message: 'Too many recommendation requests. Please try again later. (Limit: 10 requests per minute)',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  },
});

// Rate limiting for batch recommendations - 3 requests per minute (more expensive operations)
const batchRecommendationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.app.isTest,
  keyGenerator: (req) => {
    const authenticatedReq = req as any;
    if (authenticatedReq.user?.id) {
      return `batch_rec:${authenticatedReq.user.id}`;
    }
    // For unauthenticated users, use a combination of IP and user-agent for IPv6 compatibility
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    return `batch_rec_ip:${ip}:${userAgent.substring(0, 50)}`;
  },
  validate: {
    keyGeneratorIpFallback: false
  },
  handler: (req, res) => {
    const userId = (req as any).user?.id;
    const requestId = res.locals.requestId || 'unknown';
    
    logger.warn('Batch recommendation rate limit exceeded', {
      userId,
      ip: req.ip,
      endpoint: req.originalUrl,
      userAgent: req.get('User-Agent'),
      requestId,
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'BATCH_RECOMMENDATION_RATE_LIMIT_EXCEEDED',
        message: 'Too many batch recommendation requests. Please try again later. (Limit: 3 requests per minute)',
      },
      timestamp: new Date().toISOString(),
      requestId,
    });
  },
});

// POST /api/v1/recommendations - Generate AI recommendations for a single song
router.post(
  '/',
  recommendationRateLimit,
  authenticateToken,
  validateRecommendationRequest,
  recommendationController.generateRecommendations
);

// POST /api/v1/recommendations/batch - Generate AI recommendations for multiple songs
router.post(
  '/batch',
  batchRecommendationRateLimit,
  authenticateToken,
  validateBatchRecommendationRequest,
  recommendationController.generateBatchRecommendations
);

export default router;