import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.middleware';
import { apiKeyController } from '../controllers/api-key.controller';
import {
  validateApiKeyRequest,
  validateApiKeyQuery,
  validateUuidParam,
  apiKeyRequestSchema,
  apiKeyUpdateRequestSchema,
} from '../schemas/api-key.schemas';
import { config } from '../config/environment';

const router = Router();

/**
 * Rate limiting configuration for API key management endpoints
 * More restrictive than regular API endpoints due to admin-level operations
 */
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window for admin operations
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many admin requests. Please try again later.',
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
 * More restrictive rate limiting for write operations (create, update, delete)
 */
const adminWriteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 write operations per window
  message: {
    success: false,
    error: {
      code: 'WRITE_RATE_LIMIT_EXCEEDED',
      message: 'Too many admin write operations. Please try again later.',
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
 * Apply authentication to all routes
 * All API key management endpoints require JWT authentication
 */
router.use(authenticateToken);

/**
 * @route   POST /admin/api-keys
 * @desc    Create a new API key
 * @access  Admin (JWT required)
 * @param   {string} name - API key name (2-100 chars, alphanumeric + spaces, hyphens, underscores, periods)
 * @param   {string} key - API key value (8-512 chars, alphanumeric + hyphens, underscores, periods)
 * @param   {boolean} [active=true] - Whether the API key is active
 * @returns {Object} Created API key details (without sensitive key value)
 * @rate_limit 10 requests per 15 minutes
 * @validation Zod schema validation for request body
 */
router.post(
  '/',
  adminWriteRateLimit,
  validateApiKeyRequest(apiKeyRequestSchema),
  apiKeyController.createApiKey
);

/**
 * @route   GET /admin/api-keys
 * @desc    Get all API keys with optional filtering and pagination
 * @access  Admin (JWT required)
 * @query   {boolean} [active] - Filter by active status (true/false)
 * @query   {number} [limit=20] - Number of results to return (1-100)
 * @query   {number} [offset=0] - Number of results to skip (min 0)
 * @returns {Object} List of API keys with metadata
 * @rate_limit 20 requests per 15 minutes
 * @validation Zod schema validation for query parameters
 */
router.get(
  '/',
  adminRateLimit,
  validateApiKeyQuery,
  apiKeyController.getAllApiKeys
);

/**
 * @route   GET /admin/api-keys/:id
 * @desc    Get a specific API key by ID
 * @access  Admin (JWT required)
 * @param   {string} id - API key UUID
 * @returns {Object} API key details (without sensitive key value)
 * @rate_limit 20 requests per 15 minutes
 * @validation UUID format validation for path parameter
 */
router.get(
  '/:id',
  adminRateLimit,
  validateUuidParam('id'),
  apiKeyController.getApiKeyById
);

/**
 * @route   PUT /admin/api-keys/:id
 * @desc    Update an existing API key (partial update supported)
 * @access  Admin (JWT required)
 * @param   {string} id - API key UUID
 * @body    {string} [name] - New API key name
 * @body    {string} [key] - New API key value (will be hashed)
 * @body    {boolean} [active] - New active status
 * @returns {Object} Updated API key details
 * @rate_limit 10 requests per 15 minutes
 * @validation UUID format validation for path parameter, Zod schema validation for request body
 * @note At least one field must be provided for update
 */
router.put(
  '/:id',
  adminWriteRateLimit,
  validateUuidParam('id'),
  validateApiKeyRequest(apiKeyUpdateRequestSchema),
  apiKeyController.updateApiKey
);

/**
 * @route   DELETE /admin/api-keys/:id
 * @desc    Delete an API key permanently
 * @access  Admin (JWT required)
 * @param   {string} id - API key UUID
 * @returns {Object} Deletion confirmation message
 * @rate_limit 10 requests per 15 minutes
 * @validation UUID format validation for path parameter
 * @audit Deletion is logged for audit trail
 */
router.delete(
  '/:id',
  adminWriteRateLimit,
  validateUuidParam('id'),
  apiKeyController.deleteApiKey
);

export default router;