import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Base song schema for responses
export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  genre: z.string().nullable(),
  releaseYear: z.number().nullable(),
  tempo: z.number().nullable(),
  key: z.string().nullable(),
  energy: z.number().nullable(),
  danceability: z.number().nullable(),
  valence: z.number().nullable(),
  acousticness: z.number().nullable(),
  instrumentalness: z.number().nullable(),
  popularity: z.number().nullable(),
  previewUrl: z.string().nullable(),
});

// Request validation schemas
export const recommendationRequestSchema = z.object({
  songId: z.string().uuid('Song ID must be a valid UUID'),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').optional().default(10),
  includeAnalysis: z.boolean().optional().default(false),
  forceRefresh: z.boolean().optional().default(false),
});

export const batchRecommendationRequestSchema = z.object({
  songIds: z.array(z.string().uuid('Each song ID must be a valid UUID')).min(1, 'At least one song ID is required').max(10, 'Cannot process more than 10 songs at once'),
  limit: z.number().int().min(1, 'Limit must be at least 1').max(20, 'Limit per song cannot exceed 20').optional().default(5),
  includeAnalysis: z.boolean().optional().default(false),
});

// Recommendation item schema
export const recommendationItemSchema = z.object({
  song: songSchema,
  score: z.number().min(0).max(1),
  reason: z.string().optional(),
});

// Metadata schema
export const recommendationMetadataSchema = z.object({
  inputSong: z.object({
    id: z.string(),
    title: z.string(),
    artist: z.string(),
  }),
  totalRecommendations: z.number(),
  processingTimeMs: z.number(),
  cacheHit: z.boolean(),
  tokensUsed: z.number().optional(),
});

// Response schemas
export const recommendationSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    recommendations: z.array(recommendationItemSchema),
    metadata: recommendationMetadataSchema,
  }),
  timestamp: z.string(),
  requestId: z.string(),
});

export const recommendationErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
    details: z.any().optional(),
  }),
  timestamp: z.string(),
  requestId: z.string(),
});

// Batch response schemas
export const batchRecommendationItemSchema = z.object({
  inputSongId: z.string(),
  success: z.boolean(),
  recommendations: z.array(recommendationItemSchema).optional(),
  error: z.string().optional(),
});

export const batchRecommendationSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(batchRecommendationItemSchema),
    metadata: z.object({
      processed: z.number(),
      failed: z.number(),
      totalProcessingTime: z.number(),
    }),
  }),
  timestamp: z.string(),
  requestId: z.string(),
});

// Export TypeScript types
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type BatchRecommendationRequest = z.infer<typeof batchRecommendationRequestSchema>;
export type RecommendationItem = z.infer<typeof recommendationItemSchema>;
export type RecommendationSuccessResponse = z.infer<typeof recommendationSuccessResponseSchema>;
export type RecommendationErrorResponse = z.infer<typeof recommendationErrorResponseSchema>;
export type BatchRecommendationSuccessResponse = z.infer<typeof batchRecommendationSuccessResponseSchema>;

// Validation middleware functions
export const validateRecommendationRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const validatedData = recommendationRequestSchema.parse(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError.message,
          field: firstError.path.join('.'),
          details: error.issues,
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId || 'unknown',
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Request validation failed',
      },
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || 'unknown',
    });
  }
};

export const validateBatchRecommendationRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const validatedData = batchRecommendationRequestSchema.parse(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError.message,
          field: firstError.path.join('.'),
          details: error.issues,
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId || 'unknown',
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Request validation failed',
      },
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || 'unknown',
    });
  }
};