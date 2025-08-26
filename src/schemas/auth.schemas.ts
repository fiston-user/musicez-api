import { z } from 'zod';

/**
 * Password validation schema with security requirements
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character (@$!%*?&)'
  );

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(1, 'Email is required')
  .max(254, 'Email must not exceed 254 characters')
  .toLowerCase()
  .trim();

/**
 * Name validation schema
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must not exceed 100 characters')
  .trim()
  .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes');

/**
 * Registration request schema
 */
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

/**
 * Login request schema
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

/**
 * Refresh token request schema
 */
export const refreshTokenRequestSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .uuid('Invalid refresh token format'),
});

/**
 * Logout request schema
 */
export const logoutRequestSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .uuid('Invalid refresh token format'),
});

/**
 * Logout all devices request schema
 */
export const logoutAllRequestSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .uuid('Invalid refresh token format'),
});

/**
 * User response schema (public user data)
 */
export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  emailVerified: z.boolean(),
  favoriteGenres: z.array(z.string()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().nullable(),
});

/**
 * Token response schema
 */
export const tokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().uuid(),
  expiresIn: z.number().positive(),
  tokenType: z.literal('Bearer'),
});

/**
 * Authentication success response schema
 */
export const authSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: userResponseSchema.omit({ createdAt: true, updatedAt: true, lastLoginAt: true }),
    tokens: tokenResponseSchema,
  }),
  requestId: z.string().optional(),
});

/**
 * Refresh token success response schema
 */
export const refreshSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    tokens: tokenResponseSchema,
  }),
  requestId: z.string().optional(),
});

/**
 * Logout success response schema
 */
export const logoutSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  requestId: z.string().optional(),
});

/**
 * Authentication error response schema
 */
export const authErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum([
      'VALIDATION_ERROR',
      'EMAIL_ALREADY_EXISTS',
      'INVALID_CREDENTIALS',
      'INVALID_REFRESH_TOKEN',
      'TOKEN_EXPIRED',
      'USER_NOT_FOUND',
      'INTERNAL_SERVER_ERROR',
      'RATE_LIMIT_EXCEEDED',
    ]),
    message: z.string(),
    details: z.any().optional(),
  }),
  requestId: z.string().optional(),
});

// Type exports for TypeScript
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type LogoutAllRequest = z.infer<typeof logoutAllRequestSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export type AuthSuccessResponse = z.infer<typeof authSuccessResponseSchema>;
export type RefreshSuccessResponse = z.infer<typeof refreshSuccessResponseSchema>;
export type LogoutSuccessResponse = z.infer<typeof logoutSuccessResponseSchema>;
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;

/**
 * Validation middleware factory for request schemas
 */
export const validateRequest = (schema: z.ZodSchema) => {
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
            details: result.error.issues.map(issue => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
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
        requestId: res.locals.requestId,
      });
    }
  };
};

/**
 * Device info schema for session tracking
 */
export const deviceInfoSchema = z.object({
  userAgent: z.string().optional(),
  ip: z.string().optional(),
  deviceType: z.enum(['web', 'mobile', 'desktop', 'api']).default('web'),
  deviceName: z.string().optional(),
}).optional();

export type DeviceInfo = z.infer<typeof deviceInfoSchema>;