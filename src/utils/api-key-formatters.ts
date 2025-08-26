import { ApiKey } from '@prisma/client';
import {
  ApiKeyResponse,
  ApiKeySuccessResponse,
  ApiKeyListResponse,
  ApiKeyDeleteResponse,
  ApiKeyErrorResponse,
  ApiKeyErrorCode,
} from '../schemas/api-key.schemas';

/**
 * Format API key data for public response (excludes sensitive key value)
 */
export const formatApiKeyResponse = (apiKey: ApiKey): ApiKeyResponse => {
  return {
    id: apiKey.id,
    name: apiKey.name,
    active: apiKey.active,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt,
    lastUsed: apiKey.lastUsed,
  };
};

/**
 * Format multiple API keys for list response
 */
export const formatApiKeyListResponse = (
  apiKeys: ApiKey[],
  requestId?: string
): ApiKeyListResponse => {
  return {
    success: true,
    data: apiKeys.map(formatApiKeyResponse),
    timestamp: new Date().toISOString(),
    requestId,
  };
};

/**
 * Format single API key for success response
 */
export const formatApiKeySuccessResponse = (
  apiKey: ApiKey,
  requestId?: string
): ApiKeySuccessResponse => {
  return {
    success: true,
    data: formatApiKeyResponse(apiKey),
    timestamp: new Date().toISOString(),
    requestId,
  };
};

/**
 * Format API key deletion success response
 */
export const formatApiKeyDeleteResponse = (
  message: string = 'API key deleted successfully',
  requestId?: string
): ApiKeyDeleteResponse => {
  return {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    requestId,
  };
};

/**
 * Format API key error response
 */
export const formatApiKeyErrorResponse = (
  code: ApiKeyErrorCode,
  message: string,
  options?: {
    field?: string;
    details?: any;
    requestId?: string;
  }
): ApiKeyErrorResponse => {
  return {
    success: false,
    error: {
      code,
      message,
      field: options?.field,
      details: options?.details,
    },
    timestamp: new Date().toISOString(),
    requestId: options?.requestId,
  };
};

/**
 * Standard error responses for common API key scenarios
 */
export const apiKeyErrorResponses = {
  notFound: (requestId?: string): ApiKeyErrorResponse =>
    formatApiKeyErrorResponse(
      'API_KEY_NOT_FOUND',
      'API key with the specified ID was not found',
      { requestId }
    ),

  duplicateName: (name: string, requestId?: string): ApiKeyErrorResponse =>
    formatApiKeyErrorResponse(
      'DUPLICATE_API_KEY_NAME',
      `An API key with the name '${name}' already exists`,
      { field: 'name', requestId }
    ),

  unauthorized: (requestId?: string): ApiKeyErrorResponse =>
    formatApiKeyErrorResponse(
      'UNAUTHORIZED',
      'Admin authentication required to manage API keys',
      { requestId }
    ),

  internalError: (requestId?: string): ApiKeyErrorResponse =>
    formatApiKeyErrorResponse(
      'INTERNAL_SERVER_ERROR',
      'An internal server error occurred while processing the request',
      { requestId }
    ),

  rateLimitExceeded: (requestId?: string): ApiKeyErrorResponse =>
    formatApiKeyErrorResponse(
      'RATE_LIMIT_EXCEEDED',
      'Too many requests. Please try again later.',
      { requestId }
    ),

  validationError: (message: string, field?: string, details?: any, requestId?: string): ApiKeyErrorResponse =>
    formatApiKeyErrorResponse(
      'VALIDATION_ERROR',
      message,
      { field, details, requestId }
    ),
};

/**
 * Mask API key value for secure display (shows first 4 and last 4 characters)
 */
export const maskApiKey = (key: string): string => {
  if (key.length <= 8) {
    return '*'.repeat(key.length);
  }
  
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  const masked = '*'.repeat(Math.max(4, key.length - 8));
  
  return `${start}${masked}${end}`;
};

/**
 * Format API key with masked value for admin display
 */
export const formatApiKeyWithMask = (apiKey: ApiKey): ApiKeyResponse & { maskedKey: string } => {
  return {
    ...formatApiKeyResponse(apiKey),
    maskedKey: maskApiKey(apiKey.key),
  };
};

/**
 * Validate API key name uniqueness helper
 */
export const formatDuplicateNameError = (name: string, requestId?: string): ApiKeyErrorResponse => {
  return apiKeyErrorResponses.duplicateName(name, requestId);
};

/**
 * Format paginated API key list response
 */
export const formatPaginatedApiKeyResponse = (
  apiKeys: ApiKey[],
  total: number,
  limit: number,
  offset: number,
  requestId?: string
): ApiKeyListResponse & {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
} => {
  return {
    success: true,
    data: apiKeys.map(formatApiKeyResponse),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + apiKeys.length < total,
    },
    timestamp: new Date().toISOString(),
    requestId,
  };
};

/**
 * Response helper for common HTTP status codes
 */
export const getHttpStatusForError = (code: ApiKeyErrorCode): number => {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'API_KEY_NOT_FOUND':
      return 404;
    case 'DUPLICATE_API_KEY_NAME':
      return 409;
    case 'RATE_LIMIT_EXCEEDED':
      return 429;
    case 'INTERNAL_SERVER_ERROR':
    default:
      return 500;
  }
};