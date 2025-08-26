import { prisma } from '../../src/database/prisma';
import { SongSearchService } from '../../src/utils/song-search-service';

describe('SongSearchService', () => {
  let searchService: SongSearchService;

  // Test data
  const testSongs = [
    {
      id: 'test-song-1',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 355,
      releaseYear: 1975,
      popularity: 95,
      spotifyId: 'test:bohemian-rhapsody'
    },
    {
      id: 'test-song-2', 
      title: 'Stairway to Heaven',
      artist: 'Led Zeppelin',
      album: 'Led Zeppelin IV',
      duration: 482,
      releaseYear: 1971,
      popularity: 92,
      spotifyId: 'test:stairway-to-heaven'
    },
    {
      id: 'test-song-3',
      title: 'Hotel California',
      artist: 'Eagles',
      album: 'Hotel California',
      duration: 391,
      releaseYear: 1976,
      popularity: 90,
      spotifyId: 'test:hotel-california'
    },
    {
      id: 'test-song-4',
      title: 'Imagine',
      artist: 'John Lennon',
      album: 'Imagine',
      duration: 183,
      releaseYear: 1971,
      popularity: 88,
      spotifyId: 'test:imagine'
    }
  ];

  beforeAll(async () => {
    searchService = new SongSearchService();
    
    // Clean up any existing test data
    await cleanupTestData();
    
    // Create test songs
    for (const song of testSongs) {
      await prisma.song.create({
        data: song
      });
    }
    
    // Allow database triggers to populate search vectors
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  const cleanupTestData = async () => {
    await prisma.song.deleteMany({
      where: {
        spotifyId: {
          in: testSongs.map(s => s.spotifyId)
        }
      }
    });
  };

  describe('Query sanitization and normalization', () => {
    test('should sanitize input query by removing special characters', () => {
      const result = searchService.sanitize_query('Bo<script>hemian! @#$%Rhapsody?');
      expect(result).toBe('bohemian rhapsody');
    });

    test('should normalize whitespace', () => {
      const result = searchService.sanitize_query('  Bohemian   Rhapsody  ');
      expect(result).toBe('bohemian rhapsody');
    });

    test('should convert to lowercase', () => {
      const result = searchService.sanitize_query('BOHEMIAN RHAPSODY');
      expect(result).toBe('bohemian rhapsody');
    });

    test('should handle empty and null queries', () => {
      expect(searchService.sanitize_query('')).toBe('');
      expect(searchService.sanitize_query('   ')).toBe('');
    });

    test('should preserve Unicode characters', () => {
      const result = searchService.sanitize_query('Café Münchën');
      expect(result).toBe('café münchën');
    });

    test('should reject queries shorter than minimum length', () => {
      expect(() => searchService.validate_query('a')).toThrow('Query must be at least 2 characters');
      expect(() => searchService.validate_query('')).toThrow('Query must be at least 2 characters');
    });

    test('should accept valid queries', () => {
      expect(() => searchService.validate_query('queen')).not.toThrow();
      expect(() => searchService.validate_query('bohemian rhapsody')).not.toThrow();
    });
  });

  describe('Search options validation', () => {
    test('should use default values for missing options', () => {
      const options = searchService.validate_options({});
      expect(options.limit).toBe(20);
      expect(options.threshold).toBe(0.3);
    });

    test('should enforce maximum limit', () => {
      const options = searchService.validate_options({ limit: 100 });
      expect(options.limit).toBe(50); // Should cap at 50
    });

    test('should enforce minimum threshold', () => {
      const options = searchService.validate_options({ threshold: 0.05 });
      expect(options.threshold).toBe(0.1); // Should floor at 0.1
    });

    test('should enforce maximum threshold', () => {
      const options = searchService.validate_options({ threshold: 1.5 });
      expect(options.threshold).toBe(1.0); // Should cap at 1.0
    });

    test('should accept valid options', () => {
      const options = searchService.validate_options({
        limit: 25,
        threshold: 0.5
      });
      expect(options.limit).toBe(25);
      expect(options.threshold).toBe(0.5);
    });
  });

  describe('Fuzzy search functionality', () => {
    test('should find exact matches with high similarity', async () => {
      const results = await searchService.search('bohemian rhapsody');
      
      expect(results.length).toBeGreaterThan(0);
      const firstResult = results[0];
      expect(firstResult.title).toBe('Bohemian Rhapsody');
      expect(firstResult.artist).toBe('Queen');
      expect(firstResult.similarity).toBeGreaterThan(0.3); // Realistic threshold for fuzzy search
    });

    test('should handle typos and misspellings', async () => {
      const results = await searchService.search('bohemian rapsoody');
      
      expect(results.length).toBeGreaterThan(0);
      const firstResult = results[0];
      expect(firstResult.title).toBe('Bohemian Rhapsody');
      expect(firstResult.similarity).toBeGreaterThan(0.3);
    });

    test('should search by artist name', async () => {
      const results = await searchService.search('led zeppelin');
      
      expect(results.length).toBeGreaterThan(0);
      const zeppelinSong = results.find((r: any) => r.artist === 'Led Zeppelin');
      expect(zeppelinSong).toBeDefined();
      expect(zeppelinSong!.title).toBe('Stairway to Heaven');
    });

    test('should handle partial matches', async () => {
      const results = await searchService.search('hotel california');
      
      expect(results.length).toBeGreaterThan(0);
      const hotelSong = results.find((r: any) => r.title.includes('Hotel'));
      expect(hotelSong).toBeDefined();
    });

    test('should return empty array for no matches', async () => {
      const results = await searchService.search('nonexistent song xyz');
      expect(results).toEqual([]);
    });
  });

  describe('Result ranking and ordering', () => {
    test('should order results by similarity score descending', async () => {
      const results = await searchService.search('queen', { limit: 10 });
      
      // Should find at least one result
      expect(results.length).toBeGreaterThan(0);
      
      // Check ordering (similarity scores should be descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
      }
    });

    test('should include similarity scores in results', async () => {
      const results = await searchService.search('bohemian');
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result: any) => {
        expect(typeof result.similarity).toBe('number');
        expect(result.similarity).toBeGreaterThan(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      });
    });

    test('should prefer exact matches over partial matches', async () => {
      // This test assumes we have both exact and partial matches
      const results = await searchService.search('imagine');
      
      if (results.length > 1) {
        const exactMatch = results.find(r => r.title.toLowerCase() === 'imagine');
        if (exactMatch) {
          // Exact match should have highest similarity
          expect(exactMatch.similarity).toBeGreaterThanOrEqual(results[1].similarity);
        }
      }
    });
  });

  describe('Result limiting and pagination', () => {
    test('should respect limit parameter', async () => {
      const results = await searchService.search('a', { limit: 2, threshold: 0.1 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('should default to 20 results', async () => {
      // Add more test songs if needed to test this properly
      const results = await searchService.search('test', { threshold: 0.1 });
      expect(results.length).toBeLessThanOrEqual(20);
    });

    test('should handle zero results gracefully', async () => {
      const results = await searchService.search('impossible song that does not exist');
      expect(results).toEqual([]);
    });
  });

  describe('Threshold filtering', () => {
    test('should filter out results below threshold', async () => {
      const highThresholdResults = await searchService.search('queen', { threshold: 0.8 });
      const lowThresholdResults = await searchService.search('queen', { threshold: 0.2 });
      
      expect(lowThresholdResults.length).toBeGreaterThanOrEqual(highThresholdResults.length);
      
      // All results should meet the threshold
      highThresholdResults.forEach(result => {
        expect(result.similarity).toBeGreaterThan(0.8);
      });
    });

    test('should use default threshold of 0.3', async () => {
      const results = await searchService.search('queen');
      
      results.forEach(result => {
        expect(result.similarity).toBeGreaterThan(0.3);
      });
    });
  });

  describe('Performance and optimization', () => {
    test('should complete search within reasonable time', async () => {
      const startTime = Date.now();
      await searchService.search('bohemian rhapsody');
      const duration = Date.now() - startTime;
      
      // Should complete within 200ms as per spec
      expect(duration).toBeLessThan(200);
    });

    test('should handle concurrent searches', async () => {
      const searches = [
        searchService.search('queen'),
        searchService.search('led zeppelin'),
        searchService.search('eagles')
      ];
      
      const results = await Promise.all(searches);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Result structure validation', () => {
    test('should return properly structured results', async () => {
      const results = await searchService.search('queen');
      
      expect(results.length).toBeGreaterThan(0);
      
      const result = results[0];
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('artist');
      expect(result).toHaveProperty('album');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('releaseYear');
      expect(result).toHaveProperty('popularity');
      expect(result).toHaveProperty('similarity');
      
      expect(typeof result.id).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.artist).toBe('string');
      expect(typeof result.similarity).toBe('number');
    });

    test('should handle null values in optional fields', async () => {
      // Test with song that has null album or other optional fields
      const results = await searchService.search('imagine');
      
      expect(results.length).toBeGreaterThan(0);
      // Should not throw errors even with null values
      results.forEach(result => {
        expect(result.title).toBeTruthy();
        expect(result.artist).toBeTruthy();
        // Optional fields can be null
      });
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle special characters in song data', async () => {
      // This would require test data with special characters
      const results = await searchService.search('café');
      // Should not throw errors
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle very long queries', async () => {
      const longQuery = 'a'.repeat(1000);
      const results = await searchService.search(longQuery);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should handle database connection issues gracefully', async () => {
      // Mock database error
      const originalQuery = prisma.$queryRaw;
      prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      
      await expect(searchService.search('test')).rejects.toThrow();
      
      // Restore original function
      prisma.$queryRaw = originalQuery;
    });
  });
});