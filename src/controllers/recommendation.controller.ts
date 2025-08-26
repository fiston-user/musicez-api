import { Response, NextFunction } from 'express';

import logger from '../utils/logger';
import { OpenAIRecommendationService } from '../services/openai-recommendation.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  RecommendationRequest,
  BatchRecommendationRequest,
  RecommendationSuccessResponse,
  RecommendationErrorResponse,
  BatchRecommendationSuccessResponse,
} from '../schemas/recommendation.schemas';

interface BatchRecommendationResult {
  inputSongId: string;
  success: boolean;
  recommendations?: any[];
  error?: string;
}

interface BatchRecommendationResponse {
  results: BatchRecommendationResult[];
  metadata: {
    processed: number;
    failed: number;
    totalProcessingTime: number;
    averageProcessingTime: number;
    concurrencyUsed: number;
    cacheHitRate: number;
    totalTokensUsed?: number;
    errorBreakdown: Record<string, number>;
  };
}

export class RecommendationController {
  private readonly openaiService: OpenAIRecommendationService;

  constructor() {
    this.openaiService = new OpenAIRecommendationService();
  }

  public generateRecommendations = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId || 'unknown';
    const userId = req.user?.id;
    
    try {
      // Input validation
      const { songId, limit, includeAnalysis, forceRefresh } = req.body as RecommendationRequest;
      
      if (!songId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Song ID is required',
            field: 'songId',
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      logger.info('Recommendation generation initiated', {
        songId,
        limit: limit || 10,
        includeAnalysis: includeAnalysis || false,
        forceRefresh: forceRefresh || false,
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId,
      });

      // Generate recommendations using OpenAI service
      const result = await this.openaiService.generateRecommendations(songId, {
        limit: limit || 10,
        includeAnalysis: includeAnalysis || false,
        forceRefresh: forceRefresh || false,
      });

      // Success logging with performance metrics
      const processingTime = Date.now() - startTime;
      logger.info('Recommendation generation completed', {
        songId,
        totalRecommendations: result.recommendations.length,
        processingTimeMs: processingTime,
        cacheHit: result.metadata.cacheHit,
        tokensUsed: result.metadata.tokensUsed,
        userId,
        requestId,
      });

      // Format and send successful response
      const response: RecommendationSuccessResponse = {
        success: true,
        data: {
          recommendations: result.recommendations,
          metadata: {
            ...result.metadata,
            processingTimeMs: processingTime,
          },
        },
        timestamp: new Date().toISOString(),
        requestId,
      };

      res.status(200).json(response);
    } catch (error) {
      // Error handling with comprehensive logging
      const processingTime = Date.now() - startTime;
      
      logger.error('Recommendation generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        songId: req.body?.songId,
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        processingTimeMs: processingTime,
        requestId,
      });

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('Song not found')) {
          const errorResponse: RecommendationErrorResponse = {
            success: false,
            error: {
              code: 'SONG_NOT_FOUND',
              message: 'The specified song was not found in our database',
              field: 'songId',
            },
            timestamp: new Date().toISOString(),
            requestId,
          };
          res.status(404).json(errorResponse);
          return;
        }

        if (error.message.includes('rate limit')) {
          const errorResponse: RecommendationErrorResponse = {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'OpenAI API rate limit exceeded. Please try again later.',
            },
            timestamp: new Date().toISOString(),
            requestId,
          };
          res.status(429).json(errorResponse);
          return;
        }

        if (error.message.includes('timeout')) {
          const errorResponse: RecommendationErrorResponse = {
            success: false,
            error: {
              code: 'AI_SERVICE_TIMEOUT',
              message: 'AI service request timed out. Please try again.',
            },
            timestamp: new Date().toISOString(),
            requestId,
          };
          res.status(503).json(errorResponse);
          return;
        }
      }

      // Generic error response
      const errorResponse: RecommendationErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while generating recommendations',
        },
        timestamp: new Date().toISOString(),
        requestId,
      };

      res.status(500).json(errorResponse);
    }
  };

  public generateBatchRecommendations = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = res.locals.requestId || 'unknown';
    const userId = req.user?.id;
    
    try {
      const { songIds, limit, includeAnalysis } = req.body as BatchRecommendationRequest;

      logger.info('Batch recommendation generation initiated', {
        songIds,
        songCount: songIds.length,
        limit: limit || 5,
        includeAnalysis: includeAnalysis || false,
        userId,
        ip: req.ip,
        requestId,
      });

      // Process batch recommendations
      const batchResults = await this.processBatchRecommendations(songIds, {
        limit: limit || 5,
        includeAnalysis: includeAnalysis || false,
      });

      // Store batch recommendations in database using connection pooling optimization
      try {
        await this.openaiService.storeBatchRecommendations(
          batchResults.results, 
          { limit: limit || 5, includeAnalysis: includeAnalysis || false }
        );
      } catch (storageError) {
        logger.warn('Batch storage failed but continuing with response', {
          error: storageError instanceof Error ? storageError.message : 'Unknown storage error',
          batchSize: batchResults.results.length,
          requestId,
        });
      }

      // Success logging with batch metrics
      const processingTime = Date.now() - startTime;
      logger.info('Batch recommendation generation completed', {
        totalSongs: songIds.length,
        processed: batchResults.metadata.processed,
        failed: batchResults.metadata.failed,
        processingTimeMs: processingTime,
        userId,
        requestId,
      });

      // Format and send successful response
      const response: BatchRecommendationSuccessResponse = {
        success: true,
        data: {
          ...batchResults,
          metadata: {
            ...batchResults.metadata,
            totalProcessingTime: processingTime,
          },
        },
        timestamp: new Date().toISOString(),
        requestId,
      };

      res.status(200).json(response);
    } catch (error) {
      // Error handling for batch processing
      const processingTime = Date.now() - startTime;
      
      logger.error('Batch recommendation generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        songIds: req.body?.songIds,
        userId,
        processingTimeMs: processingTime,
        requestId,
      });

      const errorResponse: RecommendationErrorResponse = {
        success: false,
        error: {
          code: 'BATCH_PROCESSING_ERROR',
          message: 'Failed to process batch recommendations',
        },
        timestamp: new Date().toISOString(),
        requestId,
      };

      res.status(500).json(errorResponse);
    }
  };

  private async processBatchRecommendations(
    songIds: string[],
    options: { limit: number; includeAnalysis: boolean }
  ): Promise<BatchRecommendationResponse> {
    const batchStartTime = Date.now();
    const results: BatchRecommendationResult[] = [];
    let processed = 0;
    let failed = 0;
    let totalCacheHits = 0;
    let totalTokensUsed = 0;
    const errorBreakdown: Record<string, number> = {};
    const individualProcessingTimes: number[] = [];

    // Dynamic concurrency based on batch size and load
    const concurrency = Math.min(5, Math.max(2, Math.ceil(songIds.length / 3)));
    
    logger.info('Starting batch processing with dynamic concurrency', {
      totalSongs: songIds.length,
      concurrencyLevel: concurrency,
      options,
    });

    // Process songs using Promise.allSettled for better error isolation
    const chunks: string[][] = [];
    for (let i = 0; i < songIds.length; i += concurrency) {
      chunks.push(songIds.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (songId): Promise<BatchRecommendationResult> => {
        const individualStartTime = Date.now();
        
        try {
          const result = await this.openaiService.generateRecommendations(songId, options);
          const individualProcessingTime = Date.now() - individualStartTime;
          individualProcessingTimes.push(individualProcessingTime);
          
          processed++;
          if (result.metadata.cacheHit) {
            totalCacheHits++;
          }
          if (result.metadata.tokensUsed) {
            totalTokensUsed += result.metadata.tokensUsed;
          }
          
          return {
            inputSongId: songId,
            success: true,
            recommendations: result.recommendations,
          };
        } catch (error) {
          const individualProcessingTime = Date.now() - individualStartTime;
          individualProcessingTimes.push(individualProcessingTime);
          
          failed++;
          const errorType = this.categorizeError(error);
          errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
          
          logger.warn('Individual recommendation failed in batch', {
            songId,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType,
            processingTime: individualProcessingTime,
          });
          
          return {
            inputSongId: songId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      // Use Promise.allSettled for better error handling
      const chunkSettled = await Promise.allSettled(chunkPromises);
      const chunkResults = chunkSettled.map(settled => 
        settled.status === 'fulfilled' ? settled.value : {
          inputSongId: 'unknown',
          success: false,
          error: 'Promise settlement failed',
        } as BatchRecommendationResult
      );
      
      results.push(...chunkResults);
    }

    const totalProcessingTime = Date.now() - batchStartTime;
    const averageProcessingTime = individualProcessingTimes.length > 0 
      ? Math.round(individualProcessingTimes.reduce((a, b) => a + b, 0) / individualProcessingTimes.length)
      : 0;
    const cacheHitRate = songIds.length > 0 
      ? Math.round((totalCacheHits / songIds.length) * 100) / 100 
      : 0;

    logger.info('Batch processing completed', {
      totalSongs: songIds.length,
      processed,
      failed,
      concurrencyUsed: concurrency,
      totalProcessingTime,
      averageProcessingTime,
      cacheHitRate,
      totalTokensUsed,
      errorBreakdown,
    });

    return {
      results,
      metadata: {
        processed,
        failed,
        totalProcessingTime,
        averageProcessingTime,
        concurrencyUsed: concurrency,
        cacheHitRate,
        totalTokensUsed: totalTokensUsed > 0 ? totalTokensUsed : undefined,
        errorBreakdown,
      },
    };
  }

  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('rate limit')) return 'RATE_LIMIT_EXCEEDED';
      if (message.includes('timeout')) return 'TIMEOUT';
      if (message.includes('song not found')) return 'SONG_NOT_FOUND';
      if (message.includes('invalid')) return 'VALIDATION_ERROR';
      if (message.includes('network') || message.includes('connection')) return 'NETWORK_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

}

// Export controller instance
export const recommendationController = new RecommendationController();