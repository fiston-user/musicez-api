import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Search query validation schema
 */
export const searchQuerySchema = z
  .string()
  .min(2, 'Query must be at least 2 characters long')
  .max(500, 'Query must not exceed 500 characters')
  .trim();

/**
 * Search limit validation schema
 */
export const searchLimitSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((val) => {
    if (val === undefined) return 20;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num)) throw new Error('Limit must be a positive integer');
    if (num < 1 || num > 50) throw new Error('Limit must be between 1 and 50');
    return num;
  });

/**
 * Search similarity threshold validation schema
 */
export const searchThresholdSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((val) => {
    if (val === undefined) return 0.3;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) throw new Error('Threshold must be a valid number');
    if (num < 0.1 || num > 1.0) throw new Error('Threshold must be between 0.1 and 1.0');
    return num;
  });

/**
 * Enhanced search enable Spotify validation schema
 */
export const searchEnableSpotifySchema = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((val) => {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  });

/**
 * Fresh search validation schema (bypass cache)
 */
export const searchFreshSchema = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((val) => {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  });

/**
 * AI recommendation enable validation schema
 */
export const searchRecommendSchema = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((val) => {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  });

/**
 * Complete search request query parameters schema
 */
export const searchRequestSchema = z.object({
  q: searchQuerySchema,
  limit: searchLimitSchema,
  threshold: searchThresholdSchema
});

/**
 * Enhanced search request query parameters schema
 */
export const enhancedSearchRequestSchema = z.object({
  q: searchQuerySchema,
  limit: searchLimitSchema,
  threshold: searchThresholdSchema,
  enrich: searchEnableSpotifySchema,
  fresh: searchFreshSchema,
  recommend: searchRecommendSchema
});

/**
 * TypeScript types for search requests
 */
export type SearchQueryParams = z.infer<typeof searchRequestSchema>;
export type EnhancedSearchQueryParams = z.infer<typeof enhancedSearchRequestSchema>;

export interface SearchRequest extends Request {
  query: SearchQueryParams & { [key: string]: any };
}

export interface EnhancedSearchRequest extends Request {
  query: EnhancedSearchQueryParams & { [key: string]: any };
}

/**
 * Middleware to validate search query parameters
 */
export const validateSearchQuery = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const validatedQuery = searchRequestSchema.parse(req.query);
    (req as any).validatedQuery = validatedQuery;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path[0] as string;
      
      // Map field names to user-friendly names
      const fieldMap: Record<string, string> = {
        q: 'query',
        limit: 'limit',
        threshold: 'threshold'
      };
      
      const friendlyFieldName = fieldMap[fieldName] || fieldName;
      
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError.message,
          field: friendlyFieldName,
          details: error.issues.map(err => ({
            field: fieldMap[err.path[0] as string] || err.path[0],
            message: err.message,
            value: (err as any).received
          }))
        },
        timestamp: new Date().toISOString()
      });
    } else if (error instanceof Error) {
      // Handle custom transform errors
      const errorMessage = error.message;
      let field = 'query';
      
      if (errorMessage.includes('Limit')) {
        field = 'limit';
      } else if (errorMessage.includes('Threshold')) {
        field = 'threshold';
      }
      
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
          field: field
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Middleware to validate enhanced search query parameters with AI recommendations
 */
export const validateEnhancedSearchQuery = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const validatedQuery = enhancedSearchRequestSchema.parse(req.query);
    (req as any).validatedQuery = validatedQuery;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path[0] as string;
      
      // Map field names to user-friendly names
      const fieldMap: Record<string, string> = {
        q: 'query',
        limit: 'limit',
        threshold: 'threshold',
        enrich: 'enrich',
        fresh: 'fresh',
        recommend: 'recommend'
      };
      
      const friendlyFieldName = fieldMap[fieldName] || fieldName;
      
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstError.message,
          field: friendlyFieldName,
          details: error.issues.map(err => ({
            field: fieldMap[err.path[0] as string] || err.path[0],
            message: err.message,
            value: (err as any).received
          }))
        },
        timestamp: new Date().toISOString()
      });
    } else if (error instanceof Error) {
      // Handle custom transform errors
      const errorMessage = error.message;
      let field = 'query';
      
      if (errorMessage.includes('Limit')) {
        field = 'limit';
      } else if (errorMessage.includes('Threshold')) {
        field = 'threshold';
      } else if (errorMessage.includes('recommend')) {
        field = 'recommend';
      }
      
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
          field: field
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters'
        },
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Audio features schema for enhanced search results
 */
export const audioFeaturesSchema = z.object({
  acousticness: z.number().optional(),
  danceability: z.number().optional(),
  energy: z.number().optional(),
  valence: z.number().optional(),
  speechiness: z.number().optional(),
  liveness: z.number().optional(),
  loudness: z.number().optional(),
}).optional();

/**
 * Search result item schema for response validation
 */
export const searchResultItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  duration: z.number().nullable(),
  releaseYear: z.number().nullable(),
  popularity: z.number().nullable(),
  similarity: z.number().min(0).max(1),
  previewUrl: z.string().nullable().optional()
});

/**
 * Enhanced search result item schema with Spotify enrichment
 */
export const enhancedSearchResultItemSchema = searchResultItemSchema.extend({
  spotifyId: z.string().optional(),
  externalUrl: z.string().optional(),
  audioFeatures: audioFeaturesSchema,
  source: z.enum(['local', 'spotify', 'merged']).optional()
});

/**
 * AI recommendation item schema for search results
 */
export const aiRecommendationItemSchema = z.object({
  song: searchResultItemSchema,
  score: z.number().min(0).max(1),
  reason: z.string().optional(),
});

/**
 * AI recommendations response schema for search
 */
export const searchAiRecommendationsSchema = z.object({
  basedOnSongId: z.string(),
  basedOnSongTitle: z.string(),
  basedOnSongArtist: z.string(),
  recommendations: z.array(aiRecommendationItemSchema),
  processingTime: z.number().min(0),
  tokensUsed: z.number().optional(),
}).optional();

/**
 * Search response metadata schema
 */
export const searchMetadataSchema = z.object({
  total: z.number().min(0),
  query: z.string(),
  processingTime: z.number().min(0),
  limit: z.number().min(1).max(50),
  threshold: z.number().min(0.1).max(1.0),
  cached: z.boolean().optional()
});

/**
 * Enhanced search response metadata schema
 */
export const enhancedSearchMetadataSchema = searchMetadataSchema.extend({
  spotifyEnabled: z.boolean(),
  localResults: z.number().min(0),
  spotifyResults: z.number().min(0),
  aiRecommendationsEnabled: z.boolean().optional(),
  aiProcessingTime: z.number().min(0).optional(),
});

/**
 * Complete search response schema
 */
export const searchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(searchResultItemSchema),
    metadata: searchMetadataSchema
  }),
  timestamp: z.string()
});

/**
 * Enhanced search response schema
 */
export const enhancedSearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(enhancedSearchResultItemSchema),
    metadata: enhancedSearchMetadataSchema,
    aiRecommendations: searchAiRecommendationsSchema
  }),
  timestamp: z.string()
});

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
    details: z.array(z.object({
      field: z.string(),
      message: z.string(),
      value: z.any().optional()
    })).optional()
  }),
  timestamp: z.string()
});

/**
 * TypeScript types for responses
 */
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;
export type EnhancedSearchResultItem = z.infer<typeof enhancedSearchResultItemSchema>;
export type AiRecommendationItem = z.infer<typeof aiRecommendationItemSchema>;
export type SearchAiRecommendations = z.infer<typeof searchAiRecommendationsSchema>;
export type SearchMetadata = z.infer<typeof searchMetadataSchema>;
export type EnhancedSearchMetadata = z.infer<typeof enhancedSearchMetadataSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type EnhancedSearchResponse = z.infer<typeof enhancedSearchResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;