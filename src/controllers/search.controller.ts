import { Response, NextFunction } from 'express';
import { SongSearchService } from '../utils/song-search-service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { 
  SearchResponse, 
  SearchResultItem, 
  SearchMetadata,
  EnhancedSearchResponse,
  EnhancedSearchMetadata,
  SearchAiRecommendations,
  AiRecommendationItem 
} from '../schemas/search.schemas';
import { redis } from '../config/redis';
import { config } from '../config/environment';
import logger from '../utils/logger';
import { OpenAIRecommendationService } from '../services/openai-recommendation.service';

/**
 * Search Controller - handles song search API requests
 */
export class SearchController {
  private searchService: SongSearchService;
  private recommendationService: OpenAIRecommendationService;
  private cachePrefix = 'search:';
  private cacheTTL = 300; // 5 minutes

  constructor() {
    this.searchService = new SongSearchService();
    this.recommendationService = new OpenAIRecommendationService();
  }

  /**
   * Generate cache key for search query
   */
  private generateCacheKey(query: string, limit: number, threshold: number): string {
    return `${this.cachePrefix}${Buffer.from(`${query}:${limit}:${threshold}`).toString('base64')}`;
  }

  /**
   * Check if result should be cached
   */
  private shouldCache(results: SearchResultItem[]): boolean {
    // Cache results if we have matches (avoid caching empty results)
    return results.length > 0;
  }

  /**
   * Search for songs
   */
  public searchSongs = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    
    try {
      const { q: query, limit, threshold } = (req as any).validatedQuery;
      const userId = req.user?.id;

      logger.info('Song search initiated', {
        query,
        limit,
        threshold,
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Generate cache key
      const cacheKey = this.generateCacheKey(query, limit, threshold);
      let results: SearchResultItem[] = [];
      let cached = false;

      // Try to get results from cache (skip cache in test environment)
      if (!config.app.isTest) {
        try {
          const cachedResult = await redis.get(cacheKey);
          if (cachedResult) {
            results = JSON.parse(cachedResult);
            cached = true;
            
            logger.debug('Search results retrieved from cache', {
              query,
              resultsCount: results.length,
              userId
            });
          }
        } catch (cacheError) {
          logger.warn('Cache retrieval failed', {
            error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
            cacheKey: cacheKey.substring(0, 50) + '...'
          });
          // Continue without cache
        }
      }

      // If not cached, perform database search
      if (!cached) {
        results = await this.searchService.search(query, { limit, threshold });
        
        // Cache results if appropriate (skip in test environment)
        if (!config.app.isTest && this.shouldCache(results)) {
          try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(results));
            
            logger.debug('Search results cached', {
              query,
              resultsCount: results.length,
              cacheTTL: this.cacheTTL
            });
          } catch (cacheError) {
            logger.warn('Cache storage failed', {
              error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
              query,
              resultsCount: results.length
            });
            // Continue without caching
          }
        }
      }

      const processingTime = Date.now() - startTime;

      // Prepare response metadata
      const metadata: SearchMetadata = {
        total: results.length,
        query: query,
        processingTime: processingTime,
        limit: limit,
        threshold: threshold,
        ...(cached && { cached: true })
      };

      // Prepare response
      const response: SearchResponse = {
        success: true,
        data: {
          results,
          metadata
        },
        timestamp: new Date().toISOString()
      };

      // Log search completion
      logger.info('Song search completed', {
        query,
        resultsCount: results.length,
        processingTime,
        cached,
        userId,
        ip: req.ip
      });

      // Log analytics data for search queries
      logger.info('Search analytics', {
        type: 'search_query',
        query,
        resultsCount: results.length,
        processingTime,
        userId,
        timestamp: new Date().toISOString(),
        cached,
        limit,
        threshold
      });

      res.status(200).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Song search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        query: req.query?.q,
        userId: req.user?.id,
        processingTime,
        ip: req.ip
      });

      // Handle specific search service errors
      if (error instanceof Error && error.message.includes('Query must be at least')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            field: 'query'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Generic error response
      res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Search operation failed. Please try again later.'
        },
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Enhanced search for songs with optional AI recommendations
   */
  public enhancedSearchSongs = async (
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    
    try {
      const { q: query, limit, threshold, enrich, fresh, recommend } = (req as any).validatedQuery;
      const userId = req.user?.id;

      logger.info('Enhanced song search initiated', {
        query,
        limit,
        threshold,
        enrich,
        fresh,
        recommend,
        userId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Generate cache key (include recommend parameter in cache key)
      const cacheKey = this.generateEnhancedCacheKey(query, limit, threshold, recommend);
      let results: SearchResultItem[] = [];
      let cached = false;
      let aiRecommendations: SearchAiRecommendations = undefined;
      let aiProcessingTime = 0;

      // Try to get results from cache (skip if fresh=true or in test environment)
      if (!fresh && !config.app.isTest) {
        try {
          const cachedResult = await redis.get(cacheKey);
          if (cachedResult) {
            const parsedCache = JSON.parse(cachedResult);
            results = parsedCache.results || [];
            aiRecommendations = parsedCache.aiRecommendations;
            cached = true;
            
            logger.debug('Enhanced search results retrieved from cache', {
              query,
              resultsCount: results.length,
              hasAiRecommendations: !!aiRecommendations,
              userId
            });
          }
        } catch (cacheError) {
          logger.warn('Enhanced search cache retrieval failed', {
            error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
            cacheKey: cacheKey.substring(0, 50) + '...'
          });
          // Continue without cache
        }
      }

      // If not cached, perform database search
      if (!cached) {
        results = await this.searchService.search(query, { limit, threshold });

        // Generate AI recommendations if requested and we have search results
        if (recommend && results.length > 0 && userId) {
          const aiStartTime = Date.now();
          try {
            // Use the top search result for AI recommendations
            const topResult = results[0];
            const aiResult = await this.recommendationService.generateRecommendations(
              topResult.id,
              { limit: Math.min(5, limit), includeAnalysis: false }
            );
            
            aiProcessingTime = Date.now() - aiStartTime;
            
            aiRecommendations = {
              basedOnSongId: topResult.id,
              basedOnSongTitle: topResult.title,
              basedOnSongArtist: topResult.artist,
              recommendations: aiResult.recommendations.map(rec => ({
                song: {
                  id: rec.song.id,
                  title: rec.song.title,
                  artist: rec.song.artist,
                  album: rec.song.album,
                  duration: rec.song.duration || null,
                  releaseYear: rec.song.releaseYear || null,
                  popularity: rec.song.popularity || null,
                  similarity: rec.score, // Use AI score as similarity
                  previewUrl: rec.song.previewUrl || null,
                },
                score: rec.score,
                reason: rec.reason,
              } as AiRecommendationItem)),
              processingTime: aiProcessingTime,
              tokensUsed: aiResult.metadata.tokensUsed,
            };

            logger.info('AI recommendations generated for search', {
              basedOnSong: `${topResult.title} - ${topResult.artist}`,
              recommendationsCount: aiRecommendations.recommendations.length,
              aiProcessingTime,
              tokensUsed: aiResult.metadata.tokensUsed,
              userId,
            });
          } catch (aiError) {
            aiProcessingTime = Date.now() - aiStartTime;
            logger.warn('AI recommendations failed for search', {
              error: aiError instanceof Error ? aiError.message : 'Unknown AI error',
              query,
              topResultId: results[0]?.id,
              aiProcessingTime,
              userId,
            });
            // Continue without AI recommendations
          }
        }
        
        // Cache results if appropriate (skip in test environment)
        if (!config.app.isTest && this.shouldCache(results)) {
          try {
            const cacheData = {
              results,
              aiRecommendations,
            };
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(cacheData));
            
            logger.debug('Enhanced search results cached', {
              query,
              resultsCount: results.length,
              hasAiRecommendations: !!aiRecommendations,
              cacheTTL: this.cacheTTL
            });
          } catch (cacheError) {
            logger.warn('Enhanced search cache storage failed', {
              error: cacheError instanceof Error ? cacheError.message : 'Unknown error',
              query,
              resultsCount: results.length
            });
            // Continue without caching
          }
        }
      }

      const totalProcessingTime = Date.now() - startTime;

      // Prepare response metadata
      const metadata: EnhancedSearchMetadata = {
        total: results.length,
        query: query,
        processingTime: totalProcessingTime,
        limit: limit,
        threshold: threshold,
        spotifyEnabled: enrich || false, // For future Spotify integration
        localResults: results.length,
        spotifyResults: 0, // For future Spotify integration
        aiRecommendationsEnabled: recommend,
        aiProcessingTime: aiProcessingTime > 0 ? aiProcessingTime : undefined,
        ...(cached && { cached: true })
      };

      // Prepare response
      const response: EnhancedSearchResponse = {
        success: true,
        data: {
          results: results.map(result => ({
            ...result,
            source: 'local' as const, // For future multi-source support
          })),
          metadata,
          aiRecommendations,
        },
        timestamp: new Date().toISOString()
      };

      // Log search completion
      logger.info('Enhanced song search completed', {
        query,
        resultsCount: results.length,
        totalProcessingTime,
        aiProcessingTime: aiProcessingTime || 0,
        hasAiRecommendations: !!aiRecommendations,
        cached,
        userId,
        ip: req.ip
      });

      // Performance monitoring - warn if search is slow
      if (totalProcessingTime > 200) {
        logger.warn('Enhanced search performance warning', {
          query,
          processingTime: totalProcessingTime,
          targetTime: 200,
          aiEnabled: recommend,
          aiProcessingTime,
          userId,
        });
      }

      res.status(200).json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Enhanced song search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        query: req.query?.q,
        userId: req.user?.id,
        processingTime,
        ip: req.ip
      });

      // Handle specific search service errors
      if (error instanceof Error && error.message.includes('Query must be at least')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error.message,
            field: 'query'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Generic error response
      res.status(500).json({
        success: false,
        error: {
          code: 'ENHANCED_SEARCH_FAILED',
          message: 'Enhanced search operation failed. Please try again later.'
        },
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Generate cache key for enhanced search query including AI recommendations
   */
  private generateEnhancedCacheKey(query: string, limit: number, threshold: number, recommend: boolean): string {
    return `${this.cachePrefix}enhanced:${Buffer.from(`${query}:${limit}:${threshold}:${recommend}`).toString('base64')}`;
  }

  /**
   * Get search suggestions (autocomplete)
   * This method can be implemented later for autocomplete functionality
   */
  public getSearchSuggestions = async (
    req: AuthenticatedRequest & { query: { q: string; limit?: number } },
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    try {
      const { q: query } = req.query;
      
      if (!query || query.length < 1) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter is required',
            field: 'query'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      // For now, return empty suggestions - this can be enhanced later
      const suggestions: string[] = [];

      res.status(200).json({
        success: true,
        data: {
          suggestions,
          query
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Search suggestions failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: req.query?.q,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'SUGGESTIONS_FAILED',
          message: 'Unable to fetch search suggestions. Please try again.'
        },
        timestamp: new Date().toISOString()
      });
    }
  };
}

// Export controller instance
export const searchController = new SearchController();