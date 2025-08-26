import { Response, NextFunction } from 'express';
import { SongSearchService } from '../utils/song-search-service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { SearchResponse, SearchResultItem, SearchMetadata } from '../schemas/search.schemas';
import { redis } from '../config/redis';
import { config } from '../config/environment';
import logger from '../utils/logger';

/**
 * Search Controller - handles song search API requests
 */
export class SearchController {
  private searchService: SongSearchService;
  private cachePrefix = 'search:';
  private cacheTTL = 300; // 5 minutes

  constructor() {
    this.searchService = new SongSearchService();
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