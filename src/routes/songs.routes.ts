import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.middleware';
import { validateSearchQuery, validateEnhancedSearchQuery } from '../schemas/search.schemas';
import { searchController } from '../controllers/search.controller';
import { config } from '../config/environment';
import logger from '../utils/logger';

const router = Router();

// Search-specific rate limiting (30 requests per minute)
const searchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // Skip rate limiting in test environment
    return config.app.isTest;
  },
  // Custom key generator to rate limit per user
  keyGenerator: (req) => {
    // Use user ID if authenticated
    const authenticatedReq = req as any;
    if (authenticatedReq.user?.id) {
      return `user:${authenticatedReq.user.id}`;
    }
    // For unauthenticated users, use a combination of IP and user-agent
    // This provides better IPv6 compatibility and security
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    return `ip:${ip}:${userAgent.substring(0, 50)}`;
  },
  validate: {
    keyGeneratorIpFallback: false
  },
  // Custom handler that logs rate limit hits
  handler: (req, res) => {
    const authenticatedReq = req as any;
    logger.warn('Search rate limit exceeded', {
      userId: authenticatedReq.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    });
    
    res.status(429).json({
      success: false,
      error: {
        code: 'SEARCH_RATE_LIMIT_EXCEEDED',
        message: 'Too many search requests. Please try again later. (Limit: 30 requests per minute)'
      }
    });
  }
});

// More restrictive rate limiting for unauthenticated users
const anonymousSearchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute for anonymous users
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip if in test environment
    if (config.app.isTest) return true;
    
    // Skip if user is authenticated
    const authenticatedReq = req as any;
    return !!authenticatedReq.user;
  },
  // Use default keyGenerator which handles IPv6 properly
  validate: {
    keyGeneratorIpFallback: false
  },
  handler: (req, res) => {
    logger.warn('Anonymous search rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    });
    
    res.status(429).json({
      success: false,
      error: {
        code: 'ANONYMOUS_SEARCH_RATE_LIMIT_EXCEEDED',
        message: 'Too many anonymous search requests. Please authenticate or try again later. (Limit: 10 requests per minute)'
      }
    });
  }
});

/**
 * GET /search
 * Search for songs with fuzzy matching
 * 
 * Query Parameters:
 * - q: Search query (required, min 2 characters)
 * - limit: Maximum results to return (optional, 1-50, default 20)
 * - threshold: Similarity threshold (optional, 0.1-1.0, default 0.3)
 * 
 * Authentication: Required (Bearer token)
 * Rate Limit: 30 requests per minute for authenticated users, 10 for anonymous
 */
router.get(
  '/search',
  // Apply rate limiting first
  searchRateLimit,
  anonymousSearchRateLimit,
  
  // Require authentication
  authenticateToken,
  
  // Validate search query parameters
  validateSearchQuery,
  
  // Handle search request
  searchController.searchSongs
);

/**
 * GET /search/suggestions
 * Get search suggestions for autocomplete
 * 
 * Query Parameters:
 * - q: Query prefix (required, min 1 character)
 * - limit: Maximum suggestions to return (optional, 1-10, default 5)
 * 
 * Authentication: Required (Bearer token)
 * Rate Limit: Same as search endpoint
 * 
 * Note: This endpoint is prepared for future implementation
 */
router.get(
  '/search/suggestions',
  // Apply same rate limiting as search
  searchRateLimit,
  anonymousSearchRateLimit,
  
  // Require authentication
  authenticateToken,
  
  // Handle suggestions request
  searchController.getSearchSuggestions
);

/**
 * GET /search/enhanced
 * Enhanced search for songs with fuzzy matching and optional AI recommendations
 * 
 * Query Parameters:
 * - q: Search query (required, min 2 characters)
 * - limit: Maximum results to return (optional, 1-50, default 20)
 * - threshold: Similarity threshold (optional, 0.1-1.0, default 0.3)
 * - enrich: Enable Spotify enrichment (optional, default false)
 * - fresh: Bypass cache (optional, default false)
 * - recommend: Enable AI recommendations (optional, default false)
 * 
 * Authentication: Required (Bearer token)
 * Rate Limit: 30 requests per minute for authenticated users, 10 for anonymous
 */
router.get(
  '/search/enhanced',
  // Apply rate limiting first
  searchRateLimit,
  anonymousSearchRateLimit,
  
  // Require authentication  
  authenticateToken,
  
  // Validate enhanced search query parameters
  validateEnhancedSearchQuery,
  
  // Handle enhanced search request
  searchController.enhancedSearchSongs
);

// Export the router
export default router;