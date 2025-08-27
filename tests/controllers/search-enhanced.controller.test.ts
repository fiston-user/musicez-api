import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';

// Mock external dependencies before imports
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockEnhancedSearchService = {
  search: jest.fn(),
  searchWithSpotifyEnrichment: jest.fn(),
};

const mockRecommendationService = {
  generateRecommendations: jest.fn(),
};

// Mock the modules before imports
jest.mock('../../src/utils/logger', () => mockLogger);

jest.mock('../../src/config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../../src/utils/enhanced-search-service', () => ({
  EnhancedSongSearchService: jest.fn().mockImplementation(() => mockEnhancedSearchService),
}));

jest.mock('../../src/services/openai-recommendation.service', () => ({
  OpenAIRecommendationService: jest.fn().mockImplementation(() => mockRecommendationService),
}));

// Mock environment config
jest.mock('../../src/config/environment', () => ({
  config: {
    app: {
      isTest: true,
    },
  },
}));

// Import controller after mocks
import { SearchController } from '../../src/controllers/search.controller';

describe('SearchController - Enhanced Spotify Integration', () => {
  let controller: SearchController;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create new controller instance
    controller = new SearchController();

    // Set up request mock
    mockRequest = {
      user: { id: 'user-123', email: 'test@example.com' },
      validatedQuery: {
        q: 'beatles yesterday',
        limit: 20,
        threshold: 0.3,
        enrich: false,
        fresh: false,
        recommend: false,
      },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
      query: {},
    } as any;

    // Set up response mock
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      locals: { requestId: 'test-req-123' },
    };

    mockNext = jest.fn();

    // Setup default mock behaviors
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
  });

  describe('Enhanced Search Integration', () => {
    it('should call searchWithSpotifyEnrichment when enrich=true', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.enrich = true;
      const mockResults = [
        {
          id: 'song-1',
          title: 'Yesterday',
          artist: 'The Beatles',
          album: 'Help!',
          duration: 125,
          releaseYear: 1965,
          popularity: 89,
          similarity: 0.95,
          source: 'merged' as const,
          spotifyId: 'spotify-123',
          previewUrl: 'https://spotify.com/preview',
          externalUrl: 'https://spotify.com/track',
        },
      ];

      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockResults);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockEnhancedSearchService.searchWithSpotifyEnrichment).toHaveBeenCalledWith(
        'beatles yesterday',
        expect.objectContaining({
          limit: 20,
          threshold: 0.3,
          enableSpotify: true,
          fresh: false,
          userId: 'user-123',
        })
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            results: expect.arrayContaining([
              expect.objectContaining({
                source: 'merged',
                spotifyId: 'spotify-123',
              }),
            ]),
            metadata: expect.objectContaining({
              spotifyEnabled: true,
            }),
          }),
        })
      );
    });

    it('should use local search only when enrich=false', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.enrich = false;
      const mockResults = [
        {
          id: 'song-1',
          title: 'Yesterday',
          artist: 'The Beatles',
          album: 'Help!',
          duration: 125,
          releaseYear: 1965,
          popularity: 89,
          similarity: 0.95,
          source: 'local' as const,
        },
      ];

      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockResults);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockEnhancedSearchService.searchWithSpotifyEnrichment).toHaveBeenCalledWith(
        'beatles yesterday',
        expect.objectContaining({
          enableSpotify: false,
        })
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              spotifyEnabled: false,
            }),
          }),
        })
      );
    });

    it('should pass userId to enhanced search service for Spotify validation', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.enrich = true;
      mockRequest.user!.id = 'user-456';
      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue([]);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockEnhancedSearchService.searchWithSpotifyEnrichment).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: 'user-456',
        })
      );
    });

    it('should handle fresh parameter to bypass cache', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.fresh = true;
      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue([]);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockEnhancedSearchService.searchWithSpotifyEnrichment).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          fresh: true,
        })
      );
    });

    it('should preserve source information from enhanced search results', async () => {
      // Arrange
      const mockResults = [
        {
          id: 'local-1',
          title: 'Song 1',
          artist: 'Artist 1',
          album: 'Album 1',
          duration: 180,
          releaseYear: 2020,
          popularity: 70,
          source: 'local' as const,
          similarity: 0.9,
        },
        {
          id: 'spotify-1',
          title: 'Song 2',
          artist: 'Artist 2',
          album: 'Album 2',
          duration: 200,
          releaseYear: 2021,
          popularity: 80,
          source: 'spotify' as const,
          similarity: 0.8,
        },
        {
          id: 'merged-1',
          title: 'Song 3',
          artist: 'Artist 3',
          album: 'Album 3',
          duration: 160,
          releaseYear: 2019,
          popularity: 90,
          source: 'merged' as const,
          similarity: 0.95,
          spotifyId: 'sp-123',
        },
      ];

      (mockRequest as any).validatedQuery.enrich = true;
      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockResults);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.results).toHaveLength(3);
      expect(responseData.data.results[0].source).toBe('local');
      expect(responseData.data.results[1].source).toBe('spotify');
      expect(responseData.data.results[2].source).toBe('merged');
    });

    it('should handle errors from enhanced search service gracefully', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.enrich = true;
      const searchError = new Error('Spotify API failed');
      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockRejectedValue(searchError);

      // Act - This will catch the error and log warning instead of error
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert - The enhanced search service handles errors gracefully
      // and logs warnings, not errors, when search fails but can continue
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Enhanced search service error, results may be partial',
        expect.objectContaining({
          error: 'Spotify API failed',
        })
      );

      // Should still return success with empty results
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            results: [],
            metadata: expect.objectContaining({
              total: 0,
            }),
          }),
        })
      );
    });

    it('should include Spotify metadata in search results when available', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.enrich = true;
      const mockResults = [
        {
          id: 'song-1',
          title: 'Yesterday',
          artist: 'The Beatles',
          album: 'Help!',
          duration: 125,
          releaseYear: 1965,
          popularity: 89,
          source: 'merged' as const,
          similarity: 0.95,
          spotifyId: 'spotify-track-123',
          previewUrl: 'https://p.scdn.co/mp3-preview/abc',
          externalUrl: 'https://open.spotify.com/track/123',
          audioFeatures: {
            acousticness: 0.829,
            danceability: 0.342,
            energy: 0.183,
            valence: 0.348,
          },
        },
      ];

      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockResults);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      const result = responseData.data.results[0];
      expect(result).toMatchObject({
        spotifyId: 'spotify-track-123',
        previewUrl: 'https://p.scdn.co/mp3-preview/abc',
        externalUrl: 'https://open.spotify.com/track/123',
        audioFeatures: {
          acousticness: 0.829,
          danceability: 0.342,
          energy: 0.183,
          valence: 0.348,
        },
      });
    });

    it('should handle undefined userId gracefully', async () => {
      // Arrange
      mockRequest.user = undefined; // Unauthenticated request
      (mockRequest as any).validatedQuery.enrich = true;
      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue([]);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockEnhancedSearchService.searchWithSpotifyEnrichment).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: undefined,
        })
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should generate AI recommendations when recommend=true', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.recommend = true;
      mockRequest.user!.id = 'user-123';
      
      const mockSearchResults = [
        {
          id: 'song-1',
          title: 'Yesterday',
          artist: 'The Beatles',
          album: 'Help!',
          duration: 125,
          releaseYear: 1965,
          popularity: 89,
          source: 'local' as const,
          similarity: 0.95,
        },
      ];
      
      const mockAIRecommendations = {
        recommendations: [
          {
            song: {
              id: 'rec-1',
              title: 'Here Comes The Sun',
              artist: 'The Beatles',
              album: 'Abbey Road',
              duration: 185,
              releaseYear: 1969,
              popularity: 85,
              previewUrl: 'https://spotify.com/preview2',
            },
            score: 0.92,
            reason: 'Similar artist and musical style',
          },
        ],
        metadata: {
          tokensUsed: 150,
          processingTimeMs: 1200,
        },
      };

      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockSearchResults);
      mockRecommendationService.generateRecommendations.mockResolvedValue(mockAIRecommendations);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRecommendationService.generateRecommendations).toHaveBeenCalledWith(
        'song-1',
        expect.objectContaining({
          limit: 5,
          includeAnalysis: false,
        })
      );

      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.aiRecommendations).toBeDefined();
      expect(responseData.data.aiRecommendations.basedOnSongId).toBe('song-1');
      expect(responseData.data.aiRecommendations.recommendations).toHaveLength(1);
      expect(responseData.data.aiRecommendations.recommendations[0].song.title).toBe('Here Comes The Sun');
    });

    it('should handle AI recommendation errors gracefully', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.recommend = true;
      mockRequest.user!.id = 'user-123';
      
      const mockSearchResults = [
        {
          id: 'song-1',
          title: 'Yesterday',
          artist: 'The Beatles',
          source: 'local',
          similarity: 0.95,
        },
      ];

      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockSearchResults);
      mockRecommendationService.generateRecommendations.mockRejectedValue(new Error('AI service unavailable'));

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AI recommendations failed for search',
        expect.objectContaining({
          error: 'AI service unavailable',
        })
      );

      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.aiRecommendations).toBeUndefined();
      expect(responseData.success).toBe(true); // Should still succeed without AI
    });

    it('should not generate AI recommendations when user is not authenticated', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.recommend = true;
      mockRequest.user = undefined; // Unauthenticated
      
      const mockSearchResults = [
        {
          id: 'song-1',
          title: 'Yesterday',
          artist: 'The Beatles',
          source: 'local',
          similarity: 0.95,
        },
      ];

      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockResolvedValue(mockSearchResults);

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRecommendationService.generateRecommendations).not.toHaveBeenCalled();
      
      const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.aiRecommendations).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain existing functionality for basic search endpoint', async () => {
      // The basic searchSongs method should still work with EnhancedSongSearchService
      const mockResults = [
        {
          id: 'song-1',
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          duration: 180,
          releaseYear: 2020,
          popularity: 70,
          similarity: 0.85,
        },
      ];

      mockEnhancedSearchService.search.mockResolvedValue(mockResults);

      // Act
      await controller.searchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockEnhancedSearchService.search).toHaveBeenCalledWith(
        'beatles yesterday',
        expect.objectContaining({
          limit: 20,
          threshold: 0.3,
        })
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            results: mockResults,
          }),
        })
      );
    });

    it('should handle search validation errors appropriately', async () => {
      // Arrange
      const validationError = new Error('Query must be at least 2 characters long');
      mockEnhancedSearchService.search.mockRejectedValue(validationError);

      // Act
      await controller.searchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Query must be at least 2 characters long',
            field: 'query',
          }),
        })
      );
    });
  });

  describe('Search Suggestions', () => {
    it('should handle getSearchSuggestions endpoint', async () => {
      // Arrange
      mockRequest.query = { q: 'beat' };

      // Act
      await controller.getSearchSuggestions(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            suggestions: expect.any(Array),
            query: 'beat',
          }),
        })
      );
    });

    it('should validate query parameter for suggestions', async () => {
      // Arrange
      mockRequest.query = {}; // Missing query

      // Act
      await controller.getSearchSuggestions(
        mockRequest as any,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Query parameter is required',
            field: 'query',
          }),
        })
      );
    });
  });

  describe('Performance and Logging', () => {
    it('should log performance warnings for slow enhanced searches', async () => {
      // Arrange
      (mockRequest as any).validatedQuery.recommend = true;
      mockRequest.user!.id = 'user-123';
      
      // Mock a slow search by delaying the promise
      const mockResults = [{ id: 'song-1', title: 'Test', artist: 'Test', source: 'local', similarity: 0.9 }];
      
      mockEnhancedSearchService.searchWithSpotifyEnrichment.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockResults), 250))
      );

      // Act
      await controller.enhancedSearchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Enhanced search performance warning',
        expect.objectContaining({
          processingTime: expect.any(Number),
          targetTime: 200,
        })
      );
    });

    it('should log comprehensive search analytics', async () => {
      // Arrange
      const mockResults = [{ id: 'song-1', title: 'Test', artist: 'Test', similarity: 0.9 }];
      mockEnhancedSearchService.search.mockResolvedValue(mockResults);

      // Act
      await controller.searchSongs(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Search analytics',
        expect.objectContaining({
          type: 'search_query',
          query: 'beatles yesterday',
          resultsCount: 1,
          processingTime: expect.any(Number),
          userId: 'user-123',
          timestamp: expect.any(String),
        })
      );
    });
  });
});
