import { z } from 'zod';

/**
 * API key name validation schema
 */
export const apiKeyNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters long')
  .max(100, 'Name must not exceed 100 characters')
  .trim()
  .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Name can only contain letters, numbers, spaces, hyphens, underscores, and periods');

/**
 * API key value validation schema
 */
export const apiKeyValueSchema = z
  .string()
  .min(8, 'Key must be at least 8 characters long')
  .max(512, 'Key must not exceed 512 characters')
  .regex(/^[a-zA-Z0-9\-_.]+$/, 'Key can only contain alphanumeric characters, hyphens, underscores, and periods');

/**
 * API key creation request schema
 */
export const apiKeyRequestSchema = z.object({
  name: apiKeyNameSchema,
  key: apiKeyValueSchema,
  active: z.boolean().default(true),
});

/**
 * API key update request schema
 */
export const apiKeyUpdateRequestSchema = z
  .object({
    name: apiKeyNameSchema.optional(),
    key: apiKeyValueSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.key !== undefined || data.active !== undefined,
    {
      message: 'At least one field (name, key, or active) must be provided for update',
    }
  );

/**
 * UUID validation schema for API key IDs
 */
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

/**
 * API key response schema (without sensitive data)
 */
export const apiKeyResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastUsed: z.date().nullable(),
});

/**
 * API key success response schema
 */
export const apiKeySuccessResponseSchema = z.object({
  success: z.literal(true),
  data: apiKeyResponseSchema,
  timestamp: z.string(),
  requestId: z.string().optional(),
});

/**
 * API key list response schema
 */
export const apiKeyListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(apiKeyResponseSchema),
  timestamp: z.string(),
  requestId: z.string().optional(),
});

/**
 * API key delete response schema
 */
export const apiKeyDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  timestamp: z.string(),
  requestId: z.string().optional(),
});

/**
 * API key error codes
 */
export const apiKeyErrorCodes = z.enum([
  'VALIDATION_ERROR',
  'API_KEY_NOT_FOUND',
  'DUPLICATE_API_KEY_NAME',
  'UNAUTHORIZED',
  'INTERNAL_SERVER_ERROR',
  'RATE_LIMIT_EXCEEDED',
]);

/**
 * API key error response schema
 */
export const apiKeyErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: apiKeyErrorCodes,
    message: z.string(),
    field: z.string().optional(),
    details: z.any().optional(),
  }),
  timestamp: z.string(),
  requestId: z.string().optional(),
});

/**
 * Query parameters schema for getting API keys
 */
export const apiKeyQuerySchema = z.object({
  active: z
    .string()
    .optional()
    .transform((val) => val === 'true' ? true : val === 'false' ? false : undefined)
    .pipe(z.boolean().optional()),
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : undefined)
    .pipe(z.number().min(1).max(100).default(20).optional()),
  offset: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : undefined)
    .pipe(z.number().min(0).default(0).optional()),
});

// Type exports for TypeScript
export type ApiKeyRequest = z.infer<typeof apiKeyRequestSchema>;
export type ApiKeyUpdateRequest = z.infer<typeof apiKeyUpdateRequestSchema>;
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;
export type ApiKeySuccessResponse = z.infer<typeof apiKeySuccessResponseSchema>;
export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;
export type ApiKeyDeleteResponse = z.infer<typeof apiKeyDeleteResponseSchema>;
export type ApiKeyErrorResponse = z.infer<typeof apiKeyErrorResponseSchema>;
export type ApiKeyErrorCode = z.infer<typeof apiKeyErrorCodes>;
export type ApiKeyQuery = z.infer<typeof apiKeyQuerySchema>;

/**
 * Validation middleware factory for API key request schemas
 */
export const validateApiKeyRequest = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        const firstError = result.error.issues[0];
        const errorMessage = firstError.path.length > 0 
          ? `${firstError.path.join('.')} ${firstError.message.toLowerCase()}`
          : firstError.message;
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: errorMessage,
            field: firstError.path.length > 0 ? firstError.path.join('.') : undefined,
            details: result.error.issues.map(issue => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          timestamp: new Date().toISOString(),
          requestId: res.locals.requestId,
        });
      }
      
      // Replace req.body with validated and transformed data
      req.body = result.data;
      next();
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request format',
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      });
    }
  };
};

/**
 * Validation middleware factory for API key query parameters
 */
export const validateApiKeyQuery = (req: any, res: any, next: any) => {
  try {
    const result = apiKeyQuerySchema.safeParse(req.query);
    
    if (!result.success) {
      const firstError = result.error.issues[0];
      const errorMessage = firstError.path.length > 0 
        ? `${firstError.path.join('.')} ${firstError.message.toLowerCase()}`
        : firstError.message;
      
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
          field: firstError.path.length > 0 ? firstError.path.join('.') : undefined,
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      });
    }
    
    // Replace req.query with validated and transformed data
    req.query = result.data;
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
      },
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId,
    });
  }
};

/**
 * Validation middleware for UUID path parameters
 */
export const validateUuidParam = (paramName: string = 'id') => {
  return (req: any, res: any, next: any) => {
    const paramValue = req.params[paramName];
    
    if (!paramValue) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `${paramName} parameter is required`,
          field: paramName,
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      });
    }
    
    const result = uuidSchema.safeParse(paramValue);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid ${paramName} format`,
          field: paramName,
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      });
    }
    
    next();
  };
};