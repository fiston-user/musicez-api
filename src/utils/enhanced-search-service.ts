import { SongSearchService, SearchResult, SearchOptions, ValidatedSearchOptions } from './song-search-service';
import SpotifyApiClient, { SpotifyAuthenticationError } from './spotify-client';
import { redis } from '../config/redis';
import logger from './logger';
import { prisma } from '../database/prisma';

/**
 * Extended search options for Spotify enhancement
 */
export interface EnhancedSearchOptions extends SearchOptions {
  enableSpotify?: boolean;
  fresh?: boolean; // Bypass cache
  userId?: string; // For user-specific Spotify access
}

/**
 * Enhanced search result with Spotify enrichment data
 */
export interface EnhancedSearchResult extends SearchResult {
  spotifyId?: string;
  previewUrl?: string;
  externalUrl?: string;
  audioFeatures?: {
    acousticness?: number;
    danceability?: number;
    energy?: number;
    valence?: number;
    speechiness?: number;
    liveness?: number;
    loudness?: number;
  };
  source: 'local' | 'spotify' | 'merged';
}

/**
 * Spotify track data from API
 */
interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    release_date: string;
  };
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
  audio_features?: any;
}

/**
 * Enhanced song search service with Spotify integration
 * Extends the base SongSearchService to provide optional Spotify enrichment
 */
export class EnhancedSongSearchService extends SongSearchService {
  private readonly spotifyClient: SpotifyApiClient;
  private readonly SPOTIFY_CACHE_TTL = 3600; // 1 hour
  private readonly LOCAL_CACHE_TTL = 300; // 5 minutes (same as base service)
  private readonly PERFORMANCE_TARGET_MS = 200;
  private readonly MAX_SPOTIFY_RESULTS = 50;

  constructor() {
    super();
    this.spotifyClient = SpotifyApiClient.getInstance();
  }

  /**
   * Generate cache key for enhanced search results
   */
  private generateCacheKey(
    query: string, 
    options: ValidatedSearchOptions & { enableSpotify?: boolean }
  ): string {
    const sanitizedQuery = this.sanitize_query(query);
    const keyData = {
      query: sanitizedQuery,
      limit: options.limit,
      threshold: options.threshold,
      spotify: options.enableSpotify || false,
    };
    
    const keyString = JSON.stringify(keyData);
    const keyBase64 = Buffer.from(keyString).toString('base64');
    
    return options.enableSpotify 
      ? `spotify_search:${keyBase64}`
      : `local_search:${keyBase64}`;
  }

  /**
   * Get cached search results
   */
  private async getCachedResults(cacheKey: string): Promise<EnhancedSearchResult[] | null> {
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (error) {
      logger.warn('Cache retrieval failed', { error: (error as Error).message, cacheKey });
    }
    return null;
  }

  /**
   * Cache search results
   */
  private async cacheResults(
    cacheKey: string, 
    results: EnhancedSearchResult[], 
    ttl: number
  ): Promise<void> {
    try {
      if (results.length > 0) {
        await redis.setex(cacheKey, ttl, JSON.stringify(results));
      }
    } catch (error) {
      logger.warn('Cache storage failed', { error: (error as Error).message, cacheKey });
    }
  }

  /**
   * Convert Spotify track to enhanced search result
   */
  private convertSpotifyTrack(track: SpotifyTrack, similarity: number = 0.5): EnhancedSearchResult {
    return {
      id: `spotify:${track.id}`,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      duration: Math.round(track.duration_ms / 1000),
      releaseYear: track.album.release_date ? 
        parseInt(track.album.release_date.split('-')[0]) : null,
      popularity: track.popularity,
      similarity,
      spotifyId: track.id,
      previewUrl: track.preview_url || undefined,
      externalUrl: track.external_urls.spotify,
      audioFeatures: track.audio_features ? {
        acousticness: track.audio_features.acousticness,
        danceability: track.audio_features.danceability,
        energy: track.audio_features.energy,
        valence: track.audio_features.valence,
        speechiness: track.audio_features.speechiness,
        liveness: track.audio_features.liveness,
        loudness: track.audio_features.loudness,
      } : undefined,
      source: 'spotify',
    };
  }

  /**
   * Convert local search result to enhanced format
   */
  private convertLocalResult(result: SearchResult): EnhancedSearchResult {
    return {
      ...result,
      source: 'local' as const,
    };
  }

  /**
   * Search Spotify for tracks
   */
  private async searchSpotify(
    query: string, 
    limit: number,
    userId?: string
  ): Promise<EnhancedSearchResult[]> {
    try {
      // Check if user has valid Spotify connection
      if (userId && !(await this.spotifyClient.hasValidConnection(userId))) {
        logger.debug('User has no valid Spotify connection', { userId });
        return [];
      }

      const spotifyApi = this.spotifyClient.getSpotifyApi();
      const searchLimit = Math.min(limit, this.MAX_SPOTIFY_RESULTS);

      const searchResults = await this.spotifyClient.makeApiCall(
        async () => {
          return await spotifyApi.search(query, ['track'], 'US', Math.min(searchLimit, 50) as any);
        },
        3 // retries
      );

      if (!searchResults.tracks?.items) {
        return [];
      }

      // Convert Spotify tracks to enhanced results
      return searchResults.tracks.items.map((track: SpotifyTrack) => 
        this.convertSpotifyTrack(track)
      );

    } catch (error) {
      if (error instanceof SpotifyAuthenticationError) {
        logger.warn('Spotify authentication failed for search', { 
          error: error.message,
          userId 
        });
      } else {
        logger.warn('Spotify search failed', { 
          error: (error as Error).message,
          query,
          userId 
        });
      }
      // Re-throw to let Promise.allSettled handle the rejection
      throw error;
    }
  }

  /**
   * Merge and deduplicate local and Spotify results
   */
  private mergeResults(
    localResults: EnhancedSearchResult[], 
    spotifyResults: EnhancedSearchResult[],
    limit: number
  ): EnhancedSearchResult[] {
    const mergedMap = new Map<string, EnhancedSearchResult>();
    
    // Add local results first (they have priority due to similarity scores)
    localResults.forEach(result => {
      const key = `${result.title.toLowerCase()}:${result.artist.toLowerCase()}`;
      mergedMap.set(key, result);
    });

    // Add Spotify results, enriching existing ones or adding new ones
    spotifyResults.forEach(spotifyResult => {
      const key = `${spotifyResult.title.toLowerCase()}:${spotifyResult.artist.toLowerCase()}`;
      
      if (mergedMap.has(key)) {
        // Enrich existing local result with Spotify data
        const existingResult = mergedMap.get(key)!;
        mergedMap.set(key, {
          ...existingResult,
          spotifyId: spotifyResult.spotifyId,
          previewUrl: spotifyResult.previewUrl,
          externalUrl: spotifyResult.externalUrl,
          audioFeatures: spotifyResult.audioFeatures,
          source: 'merged' as const,
        });
      } else {
        // Add new Spotify-only result
        mergedMap.set(key, spotifyResult);
      }
    });

    // Convert to array and sort by relevance
    const results = Array.from(mergedMap.values());
    
    // Sort by: local similarity first, then Spotify popularity
    results.sort((a, b) => {
      if (a.source === 'local' || a.source === 'merged') {
        if (b.source === 'spotify') return -1; // Local/merged results first
        return (b.similarity || 0) - (a.similarity || 0); // Higher similarity first
      }
      if (b.source === 'local' || b.source === 'merged') {
        return 1; // Local/merged results first
      }
      // Both Spotify results, sort by popularity
      return (b.popularity || 0) - (a.popularity || 0);
    });

    return results.slice(0, limit);
  }

  /**
   * Enhanced search with optional Spotify enrichment
   */
  async searchWithSpotifyEnrichment(
    query: string, 
    options: EnhancedSearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const startTime = Date.now();
    
    try {
      // Validate input
      this.validate_query(query);
      const validatedOptions = this.validate_options(options);
      const enhancedOptions = {
        ...validatedOptions,
        enableSpotify: options.enableSpotify || false,
      };

      // Generate cache key
      const cacheKey = this.generateCacheKey(query, enhancedOptions);

      // Check cache (unless fresh is requested)
      if (!options.fresh) {
        const cachedResults = await this.getCachedResults(cacheKey);
        if (cachedResults) {
          logger.info('Enhanced search cache hit', {
            query,
            cacheKey,
            results: cachedResults.length,
          });
          return cachedResults;
        }
      }

      // Execute searches in parallel when Spotify is enabled
      let localResults: EnhancedSearchResult[] = [];
      let spotifyResults: EnhancedSearchResult[] = [];

      if (enhancedOptions.enableSpotify && options.userId) {
        // Execute local and Spotify searches in parallel
        const [localSearchResults, spotifySearchResults] = await Promise.allSettled([
          this.search(query, validatedOptions),
          this.searchSpotify(query, validatedOptions.limit, options.userId),
        ]);

        // Handle local search results
        if (localSearchResults.status === 'fulfilled') {
          localResults = localSearchResults.value.map(r => this.convertLocalResult(r));
        } else {
          logger.error('Local search failed in enhanced search', {
            error: localSearchResults.reason?.message,
            query,
          });
        }

        // Handle Spotify search results
        if (spotifySearchResults.status === 'fulfilled') {
          spotifyResults = spotifySearchResults.value;
        } else {
          logger.warn('Spotify search failed', {
            error: spotifySearchResults.reason?.message,
            query,
            userId: options.userId,
          });
        }

        // If both searches failed, throw error
        if (localSearchResults.status === 'rejected' && spotifySearchResults.status === 'rejected') {
          throw new Error('Both local and Spotify searches failed');
        }
      } else {
        // Spotify disabled or no user ID - use local search only
        const localSearchResults = await this.search(query, validatedOptions);
        localResults = localSearchResults.map(r => this.convertLocalResult(r));
      }

      // Merge and deduplicate results
      const mergedResults = this.mergeResults(
        localResults, 
        spotifyResults, 
        validatedOptions.limit
      );

      // Cache results
      const ttl = enhancedOptions.enableSpotify ? this.SPOTIFY_CACHE_TTL : this.LOCAL_CACHE_TTL;
      await this.cacheResults(cacheKey, mergedResults, ttl);

      // Performance monitoring
      const processingTime = Date.now() - startTime;
      
      logger.info('Enhanced search completed', {
        query,
        processingTime,
        spotifyEnabled: enhancedOptions.enableSpotify,
        localResults: localResults.length,
        spotifyResults: spotifyResults.length,
        totalResults: mergedResults.length,
        cached: false,
      });

      // Warn if search exceeds performance target
      if (processingTime > this.PERFORMANCE_TARGET_MS) {
        logger.warn('Enhanced search exceeded performance target', {
          query,
          processingTime,
          target: this.PERFORMANCE_TARGET_MS,
          spotifyEnabled: enhancedOptions.enableSpotify,
        });
      }

      return mergedResults;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Enhanced search failed', {
        query,
        error: (error as Error).message,
        processingTime,
        options,
      });

      throw new Error('Search operation failed');
    }
  }

  /**
   * Enhanced search with backward compatibility
   * Uses the standard search interface but returns enhanced results when possible
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // If this is called directly on the enhanced service, provide basic functionality
    const baseResults = await super.search(query, options);
    return baseResults;
  }

  /**
   * Sync Spotify metadata for a specific track
   */
  async syncTrackMetadata(trackId: string, spotifyId: string): Promise<void> {
    try {
      const spotifyApi = this.spotifyClient.getSpotifyApi();
      
      // Get track details and audio features from Spotify
      const [trackDetails, audioFeatures] = await Promise.allSettled([
        this.spotifyClient.makeApiCall(() => spotifyApi.tracks.get(spotifyId)),
        this.spotifyClient.makeApiCall(() => (spotifyApi as any).audioFeatures.get(spotifyId)),
      ]);

      const updateData: any = {
        spotifyId,
        spotifyLastSync: new Date(),
      };

      // Update track details if available
      if (trackDetails.status === 'fulfilled') {
        const track = trackDetails.value;
        updateData.spotifyPopularity = track.popularity;
        updateData.spotifyPreviewUrl = track.preview_url;
        updateData.spotifyExternalUrl = track.external_urls.spotify;
      }

      // Update audio features if available
      if (audioFeatures.status === 'fulfilled') {
        const features = audioFeatures.value as any;
        updateData.acousticness = features.acousticness;
        updateData.danceability = features.danceability;
        updateData.energy = features.energy;
        updateData.valence = features.valence;
        updateData.speechiness = features.speechiness;
        updateData.liveness = features.liveness;
        updateData.loudness = features.loudness;
        updateData.audioFeaturesSynced = true;
      }

      // Update the database
      await prisma.song.update({
        where: { id: trackId },
        data: updateData,
      });

      logger.info('Track metadata synced successfully', {
        trackId,
        spotifyId,
        hasAudioFeatures: audioFeatures.status === 'fulfilled',
      });

    } catch (error) {
      logger.error('Failed to sync track metadata', {
        trackId,
        spotifyId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get enhanced search metadata including Spotify enrichment stats
   */
  async getEnhancedSearchMetadata(
    query: string, 
    options: EnhancedSearchOptions = {}
  ): Promise<{
    query: string;
    sanitizedQuery: string;
    totalResults: number;
    localResults: number;
    spotifyResults: number;
    processingTime: number;
    options: ValidatedSearchOptions & { enableSpotify: boolean };
    cached: boolean;
  }> {
    const startTime = Date.now();
    
    try {
      const sanitizedQuery = this.sanitize_query(query);
      const validatedOptions = this.validate_options(options);
      const enhancedOptions = {
        ...validatedOptions,
        enableSpotify: options.enableSpotify || false,
      };

      // Check if results are cached
      const cacheKey = this.generateCacheKey(query, enhancedOptions);
      const cachedResults = await this.getCachedResults(cacheKey);
      
      if (cachedResults) {
        return {
          query,
          sanitizedQuery,
          totalResults: cachedResults.length,
          localResults: cachedResults.filter(r => r.source === 'local' || r.source === 'merged').length,
          spotifyResults: cachedResults.filter(r => r.source === 'spotify').length,
          processingTime: Date.now() - startTime,
          options: enhancedOptions,
          cached: true,
        };
      }

      // Get actual search results to count them
      const results = await this.searchWithSpotifyEnrichment(query, options);
      
      return {
        query,
        sanitizedQuery,
        totalResults: results.length,
        localResults: results.filter(r => r.source === 'local' || r.source === 'merged').length,
        spotifyResults: results.filter(r => r.source === 'spotify').length,
        processingTime: Date.now() - startTime,
        options: enhancedOptions,
        cached: false,
      };

    } catch (error) {
      logger.error('Enhanced search metadata failed', {
        query,
        error: (error as Error).message,
      });
      
      return {
        query,
        sanitizedQuery: this.sanitize_query(query),
        totalResults: 0,
        localResults: 0,
        spotifyResults: 0,
        processingTime: Date.now() - startTime,
        options: { ...this.validate_options(options), enableSpotify: false },
        cached: false,
      };
    }
  }
}

// Export singleton instance for use across the application
export const enhancedSongSearchService = new EnhancedSongSearchService();