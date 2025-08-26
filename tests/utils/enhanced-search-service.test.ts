import { EnhancedSongSearchService } from '../../src/utils/enhanced-search-service';
import SpotifyApiClient from '../../src/utils/spotify-client';
import { redis } from '../../src/config/redis';
import logger from '../../src/utils/logger';

// Mock dependencies
jest.mock('../../src/database/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    songs: {
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../../src/utils/spotify-client');
jest.mock('../../src/config/redis');
jest.mock('../../src/utils/logger');

import { prisma } from '../../src/database/prisma';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockLogger = logger as jest.Mocked<typeof logger>;

// Mock SpotifyApiClient
const mockSpotifyClientInstance = {
  makeApiCall: jest.fn(),
  getSpotifyApi: jest.fn(),
  hasValidConnection: jest.fn().mockResolvedValue(false),
};

(SpotifyApiClient.getInstance as jest.MockedFunction<typeof SpotifyApiClient.getInstance>)
  .mockReturnValue(mockSpotifyClientInstance as any);

describe('EnhancedSongSearchService', () => {
  let enhancedSearchService: EnhancedSongSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    enhancedSearchService = new EnhancedSongSearchService();
    
    // Setup default Redis mocks
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
  });

  describe('Basic Search Functionality', () => {
    it('should inherit basic search functionality from parent class', async () => {
      const mockResults = [
        {
          id: '1',
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          duration: 355,
          releaseYear: 1975,
          popularity: 95,
          similarity: 0.95,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const results = await enhancedSearchService.search('bohemian rhapsody');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expect.objectContaining({
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        similarity: 0.95,
      }));
    });

    it('should validate query parameters like parent class', async () => {
      await expect(enhancedSearchService.search('')).rejects.toThrow('Query must be at least 2 characters');
      await expect(enhancedSearchService.search('a')).rejects.toThrow('Query must be at least 2 characters');
    });
  });

  describe('Spotify Enhancement Options', () => {
    it('should accept enableSpotify option in search parameters', async () => {
      const mockResults = [
        {
          id: '1',
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 80,
          similarity: 0.8,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should accept fresh option to bypass cache', async () => {
      const mockResults = [
        {
          id: '1',
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 80,
          similarity: 0.8,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        fresh: true,
      });

      // Should not try to get from cache when fresh=true
      expect(mockRedis.get).not.toHaveBeenCalledWith(expect.stringContaining('spotify_search:'));
    });

    it('should fall back to local search when Spotify is disabled', async () => {
      const mockResults = [
        {
          id: '1',
          title: 'Local Song',
          artist: 'Local Artist',
          album: 'Local Album',
          duration: 180,
          releaseYear: 2021,
          popularity: 70,
          similarity: 0.9,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('local', {
        enableSpotify: false,
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Local Song');
      expect(mockSpotifyClientInstance.makeApiCall).not.toHaveBeenCalled();
    });
  });

  describe('Spotify API Integration', () => {
    it('should call Spotify API when enhancement is enabled and user has connection', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);
      
      const mockSpotifyApi = {
        search: jest.fn().mockResolvedValue({
          tracks: {
            items: [
              {
                id: 'spotify123',
                name: 'Spotify Song',
                artists: [{ name: 'Spotify Artist' }],
                album: { name: 'Spotify Album', release_date: '2022-01-15' },
                duration_ms: 240000,
                popularity: 85,
                preview_url: 'https://p.scdn.co/mp3-preview/test',
                external_urls: { spotify: 'https://open.spotify.com/track/test' },
                audio_features: null,
              },
            ],
          },
        }),
      };

      mockSpotifyClientInstance.getSpotifyApi.mockReturnValue(mockSpotifyApi);
      mockSpotifyClientInstance.makeApiCall.mockImplementation(async (apiCall) => apiCall());

      // Mock local search results
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await enhancedSearchService.searchWithSpotifyEnrichment('spotify song', {
        enableSpotify: true,
        userId: 'user123',
      });

      expect(mockSpotifyClientInstance.hasValidConnection).toHaveBeenCalledWith('user123');
      expect(mockSpotifyClientInstance.makeApiCall).toHaveBeenCalled();
      expect(mockSpotifyApi.search).toHaveBeenCalledWith(
        'spotify song',
        ['track'],
        'US',
        20
      );
    });

    it('should handle Spotify API failures gracefully', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);
      mockSpotifyClientInstance.makeApiCall.mockRejectedValue(new Error('Spotify API error'));

      // Mock local search results as fallback
      const mockLocalResults = [
        {
          id: '1',
          title: 'Fallback Song',
          artist: 'Fallback Artist',
          album: 'Fallback Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 75,
          similarity: 0.7,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockLocalResults);

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        userId: 'user123',
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fallback Song');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Spotify search failed',
        expect.objectContaining({ error: 'Spotify API error' })
      );
    });

    it('should skip Spotify enhancement when user has no connection', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(false);

      const mockLocalResults = [
        {
          id: '1',
          title: 'Local Only Song',
          artist: 'Local Artist',
          album: 'Local Album',
          duration: 190,
          releaseYear: 2019,
          popularity: 60,
          similarity: 0.85,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockLocalResults);

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        userId: 'user123',
      });

      expect(results).toHaveLength(1);
      expect(mockSpotifyClientInstance.makeApiCall).not.toHaveBeenCalled();
    });
  });

  describe('Result Merging and Deduplication', () => {
    it('should merge local and Spotify results without duplicates', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);

      // Mock local results
      const mockLocalResults = [
        {
          id: '1',
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          duration: 355,
          releaseYear: 1975,
          popularity: 95,
          similarity: 0.95,
        },
        {
          id: '2',
          title: 'Different Song',
          artist: 'Different Artist',
          album: 'Different Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 70,
          similarity: 0.8,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockLocalResults);

      // Mock Spotify results (one duplicate, one new)
      const mockSpotifyApi = {
        search: jest.fn().mockResolvedValue({
          tracks: {
            items: [
              {
                id: 'spotify1',
                name: 'Bohemian Rhapsody', // Duplicate
                artists: [{ name: 'Queen' }],
                album: { name: 'A Night at the Opera', release_date: '1975-10-31' },
                duration_ms: 355000,
                popularity: 95,
                preview_url: 'https://p.scdn.co/mp3-preview/bohemian',
                external_urls: { spotify: 'https://open.spotify.com/track/bohemian' },
              },
              {
                id: 'spotify2',
                name: 'New Spotify Song', // New song
                artists: [{ name: 'Spotify Artist' }],
                album: { name: 'Spotify Album', release_date: '2023-01-01' },
                duration_ms: 180000,
                popularity: 88,
                preview_url: 'https://p.scdn.co/mp3-preview/new',
                external_urls: { spotify: 'https://open.spotify.com/track/new' },
              },
            ],
          },
        }),
      };

      mockSpotifyClientInstance.getSpotifyApi.mockReturnValue(mockSpotifyApi);
      mockSpotifyClientInstance.makeApiCall.mockImplementation(async (apiCall) => apiCall());

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        userId: 'user123',
        limit: 10,
      });

      // Should have 3 results: 2 local + 1 new Spotify (1 duplicate removed)
      expect(results).toHaveLength(3);
      
      const titles = results.map(r => r.title);
      expect(titles).toContain('Bohemian Rhapsody');
      expect(titles).toContain('Different Song');
      expect(titles).toContain('New Spotify Song');

      // Check that the local Bohemian Rhapsody has preview URL from Spotify
      const bohemianResult = results.find(r => r.title === 'Bohemian Rhapsody');
      expect(bohemianResult?.previewUrl).toBe('https://p.scdn.co/mp3-preview/bohemian');
    });

    it('should prioritize local results in merged output', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);

      const mockLocalResults = [
        {
          id: '1',
          title: 'High Similarity Local',
          artist: 'Local Artist',
          album: 'Local Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 80,
          similarity: 0.95, // High local similarity
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockLocalResults);

      const mockSpotifyApi = {
        search: jest.fn().mockResolvedValue({
          tracks: {
            items: [
              {
                id: 'spotify1',
                name: 'Spotify Song',
                artists: [{ name: 'Spotify Artist' }],
                album: { name: 'Spotify Album', release_date: '2023-01-01' },
                duration_ms: 180000,
                popularity: 90, // High Spotify popularity
                preview_url: 'https://p.scdn.co/mp3-preview/spotify',
              },
            ],
          },
        }),
      };

      mockSpotifyClientInstance.getSpotifyApi.mockReturnValue(mockSpotifyApi);
      mockSpotifyClientInstance.makeApiCall.mockImplementation(async (apiCall) => apiCall());

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        userId: 'user123',
        limit: 10,
      });

      // Local result should come first due to higher similarity
      expect(results[0].title).toBe('High Similarity Local');
      expect(results[0].similarity).toBe(0.95);
    });
  });

  describe('Caching Strategy', () => {
    it('should cache Spotify-enhanced search results separately', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);
      
      const mockLocalResults = [
        {
          id: '1',
          title: 'Cached Song',
          artist: 'Cached Artist',
          album: 'Cached Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 80,
          similarity: 0.9,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockLocalResults);

      const mockSpotifyApi = {
        search: jest.fn().mockResolvedValue({
          tracks: { items: [] },
        }),
      };

      mockSpotifyClientInstance.getSpotifyApi.mockReturnValue(mockSpotifyApi);
      mockSpotifyClientInstance.makeApiCall.mockImplementation(async (apiCall) => apiCall());

      await enhancedSearchService.searchWithSpotifyEnrichment('cache test', {
        enableSpotify: true,
        userId: 'user123',
        limit: 10,
        threshold: 0.3,
      });

      const expectedCacheKey = expect.stringMatching(/^spotify_search:/);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expectedCacheKey,
        3600, // 1 hour TTL for Spotify-enhanced results
        expect.any(String)
      );
    });

    it('should return cached results when available', async () => {
      const cachedResults = [
        {
          id: 'cached1',
          title: 'Cached Song',
          artist: 'Cached Artist',
          album: 'Cached Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 80,
          similarity: 0.9,
          previewUrl: 'https://cached.preview.url',
        },
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResults));

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('cached query', {
        enableSpotify: true,
        userId: 'user123',
      });

      expect(results).toEqual(cachedResults);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockSpotifyClientInstance.makeApiCall).not.toHaveBeenCalled();
    });

    it('should use different cache keys for different enhancement options', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(false);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      // First call with Spotify enabled
      await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        limit: 10,
        threshold: 0.3,
      });

      // Second call with Spotify disabled
      await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: false,
        limit: 10,
        threshold: 0.3,
      });

      // Should have checked different cache keys
      const getCalls = mockRedis.get.mock.calls;
      expect(getCalls).toHaveLength(2);
      expect(getCalls[0][0]).not.toBe(getCalls[1][0]); // Different cache keys
    });
  });

  describe('Performance Monitoring', () => {
    it('should track processing time for enhanced searches', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(false);

      await enhancedSearchService.searchWithSpotifyEnrichment('performance test', {
        enableSpotify: true,
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced search completed',
        expect.objectContaining({
          query: 'performance test',
          processingTime: expect.any(Number),
          spotifyEnabled: true,
          localResults: 0,
          spotifyResults: 0,
          totalResults: 0,
        })
      );
    });

    it('should warn when search exceeds performance target', async () => {
      // Mock slow operation by delaying the promise
      mockPrisma.$queryRaw.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 250)) as any
      );
      
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(false);

      await enhancedSearchService.searchWithSpotifyEnrichment('slow query', {
        enableSpotify: true,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Enhanced search exceeded performance target',
        expect.objectContaining({
          query: 'slow query',
          processingTime: expect.any(Number),
          target: 200,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(false);

      await expect(
        enhancedSearchService.searchWithSpotifyEnrichment('error test', {
          enableSpotify: true,
        })
      ).rejects.toThrow('Search operation failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Enhanced search failed',
        expect.objectContaining({
          error: 'Search operation failed',
        })
      );
    });

    it('should validate enhanced search options', async () => {
      await expect(
        enhancedSearchService.searchWithSpotifyEnrichment('test', {
          limit: 100, // Exceeds maximum
        })
      ).rejects.toThrow();

      await expect(
        enhancedSearchService.searchWithSpotifyEnrichment('test', {
          threshold: 2.0, // Exceeds maximum
        })
      ).rejects.toThrow();
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should fall back to local search when Spotify is unavailable', async () => {
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);
      mockSpotifyClientInstance.makeApiCall.mockRejectedValue(new Error('Spotify service unavailable'));

      const mockLocalResults = [
        {
          id: '1',
          title: 'Fallback Song',
          artist: 'Fallback Artist',
          album: 'Fallback Album',
          duration: 200,
          releaseYear: 2020,
          popularity: 75,
          similarity: 0.8,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockLocalResults);

      const results = await enhancedSearchService.searchWithSpotifyEnrichment('test', {
        enableSpotify: true,
        userId: 'user123',
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fallback Song');
    });

    it('should return empty results when both local and Spotify searches fail', async () => {
      // Mock both searches to fail
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database error'));
      mockSpotifyClientInstance.hasValidConnection.mockResolvedValue(true);
      mockSpotifyClientInstance.makeApiCall.mockRejectedValue(new Error('Spotify error'));

      await expect(
        enhancedSearchService.searchWithSpotifyEnrichment('test', {
          enableSpotify: true,
          userId: 'user123',
        })
      ).rejects.toThrow('Search operation failed');
    });
  });
});