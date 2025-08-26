// Mock all external dependencies at the module level
const mockPrisma = {
  song: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  aIRecommendation: {
    createMany: jest.fn(),
  },
};

const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
};

// Mock the modules
jest.mock('../../src/database/prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('../../src/utils/logger', () => mockLogger);

jest.mock('../../src/config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => mockOpenAI);
});

import { OpenAIRecommendationService } from '../../src/services/openai-recommendation.service';

describe('OpenAIRecommendationService', () => {
  let service: OpenAIRecommendationService;

  const mockSong = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    genre: 'Pop',
    tempo: 120.0,
    key: 'C Major',
    energy: 0.8,
    danceability: 0.7,
    valence: 0.6,
    acousticness: 0.2,
    instrumentalness: 0.1,
    popularity: 85,
    releaseYear: 2023,
  };

  const mockRecommendationSongs = [
    {
      id: '223e4567-e89b-12d3-a456-426614174001',
      title: 'Similar Song 1',
      artist: 'Similar Artist 1',
      genre: 'Pop',
      tempo: 125.0,
      album: 'Similar Album 1',
      releaseYear: 2022,
      energy: 0.75,
      danceability: 0.65,
      valence: 0.58,
      popularity: 80,
      previewUrl: 'https://example.com/preview1.mp3',
    },
  ];

  const mockOpenAIResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            recommendations: [
              {
                title: 'Similar Song 1',
                artist: 'Similar Artist 1',
                reason: 'Similar tempo and energy levels',
                score: 0.85,
              },
            ],
          }),
        },
      },
    ],
    usage: {
      total_tokens: 150,
    },
  };

  beforeEach(() => {
    service = new OpenAIRecommendationService();
    jest.clearAllMocks();
    
    // Setup default mock behaviors
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.aIRecommendation.createMany.mockResolvedValue({ count: 1 });
  });

  describe('constructor', () => {
    it('should initialize with Prisma client', () => {
      expect(service).toBeInstanceOf(OpenAIRecommendationService);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations for valid song ID', async () => {
      // Arrange
      mockPrisma.song.findUnique.mockResolvedValue(mockSong);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockOpenAIResponse);
      mockPrisma.song.findMany.mockResolvedValue(mockRecommendationSongs);

      // Act
      const result = await service.generateRecommendations(mockSong.id, { limit: 10 });

      // Assert
      expect(mockPrisma.song.findUnique).toHaveBeenCalledWith({
        where: { id: mockSong.id },
        select: expect.objectContaining({
          id: true,
          title: true,
          artist: true,
        }),
      });
      
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
            }),
            expect.objectContaining({
              role: 'user',
            }),
          ]),
        })
      );
      
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]).toEqual(
        expect.objectContaining({
          song: expect.objectContaining({ id: mockRecommendationSongs[0].id }),
          score: 0.85,
          reason: 'Similar tempo and energy levels',
        })
      );
      
      expect(result.metadata).toEqual(
        expect.objectContaining({
          inputSong: mockSong,
          totalRecommendations: 1,
          processingTimeMs: expect.any(Number),
          cacheHit: false,
          tokensUsed: 150,
        })
      );
    });

    it('should return cached recommendations when available', async () => {
      // Arrange
      const cachedResult = {
        recommendations: [{ song: mockRecommendationSongs[0], score: 0.85, reason: 'cached' }],
        metadata: { cacheHit: true },
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      // Act
      const result = await service.generateRecommendations(mockSong.id);

      // Assert
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
      expect(result.metadata.cacheHit).toBe(true);
    });

    it('should handle song not found', async () => {
      // Arrange
      mockPrisma.song.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.generateRecommendations('invalid-id')).rejects.toThrow(
        'Song not found'
      );
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Song not found for recommendation generation',
        expect.objectContaining({
          songId: 'invalid-id',
        })
      );
    });

    it('should handle OpenAI API timeout', async () => {
      // Arrange
      mockPrisma.song.findUnique.mockResolvedValue(mockSong);
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockOpenAI.chat.completions.create.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(
        service.generateRecommendations(mockSong.id)
      ).rejects.toThrow('OpenAI API request timeout');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'OpenAI API timeout during recommendation generation',
        expect.objectContaining({
          songId: mockSong.id,
          error: 'Request timeout',
        })
      );
    });

    it('should validate recommendation limit bounds', async () => {
      // Act & Assert
      await expect(
        service.generateRecommendations(mockSong.id, { limit: 0 })
      ).rejects.toThrow('Limit must be between 1 and 50');

      await expect(
        service.generateRecommendations(mockSong.id, { limit: 51 })
      ).rejects.toThrow('Limit must be between 1 and 50');
    });

    it('should handle malformed OpenAI response', async () => {
      // Arrange
      mockPrisma.song.findUnique.mockResolvedValue(mockSong);
      const malformedResponse = {
        choices: [{ message: { content: 'invalid json' } }],
        usage: { total_tokens: 50 },
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(malformedResponse);

      // Act & Assert
      await expect(
        service.generateRecommendations(mockSong.id)
      ).rejects.toThrow('Invalid OpenAI response format');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse OpenAI recommendation response',
        expect.objectContaining({
          songId: mockSong.id,
          response: 'invalid json',
        })
      );
    });
  });

  describe('buildPrompt', () => {
    it('should create structured prompt with song metadata', () => {
      // Act
      const prompt = (service as any).buildPrompt(mockSong, { limit: 10 });

      // Assert
      expect(prompt).toContain('Test Song');
      expect(prompt).toContain('Test Artist');
      expect(prompt).toContain('Pop');
      expect(prompt).toContain('120 BPM');
      expect(prompt).toContain('C Major');
      expect(prompt).toContain('10 songs');
    });

    it('should handle missing optional fields gracefully', () => {
      // Arrange
      const minimalSong = {
        id: 'minimal-id',
        title: 'Minimal Song',
        artist: 'Minimal Artist',
        album: null,
        genre: null,
        tempo: null,
        key: null,
        energy: null,
        danceability: null,
        valence: null,
        acousticness: null,
        instrumentalness: null,
        popularity: null,
        releaseYear: null,
      };

      // Act
      const prompt = (service as any).buildPrompt(minimalSong, { limit: 5 });

      // Assert
      expect(prompt).toContain('Minimal Song');
      expect(prompt).toContain('Minimal Artist');
      expect(prompt).not.toContain('null');
      expect(prompt).toContain('5 songs');
    });
  });

  describe('parseRecommendationResponse', () => {
    it('should parse valid OpenAI response', () => {
      // Act
      const result = (service as any).parseRecommendationResponse(
        mockOpenAIResponse.choices[0].message.content,
        mockSong.id
      );

      // Assert
      expect(result).toEqual({
        recommendations: [
          {
            title: 'Similar Song 1',
            artist: 'Similar Artist 1',
            reason: 'Similar tempo and energy levels',
            score: 0.85,
          },
        ],
      });
    });

    it('should throw error for invalid JSON', () => {
      // Act & Assert
      expect(() =>
        (service as any).parseRecommendationResponse('invalid json', 'song-id')
      ).toThrow('Invalid OpenAI response format');
    });
  });

  describe('matchRecommendationsToSongs', () => {
    it('should match AI recommendations to database songs', async () => {
      // Arrange
      const aiRecommendations = [
        {
          title: 'Similar Song 1',
          artist: 'Similar Artist 1',
          reason: 'Similar tempo',
          score: 0.85,
        },
      ];

      mockPrisma.song.findMany.mockResolvedValue(mockRecommendationSongs);

      // Act
      const result = await (service as any).matchRecommendationsToSongs(
        aiRecommendations
      );

      // Assert
      expect(mockPrisma.song.findMany).toHaveBeenCalledWith({
        where: {
          OR: expect.arrayContaining([
            expect.objectContaining({
              AND: [
                { title: { contains: 'Similar Song 1', mode: 'insensitive' } },
                { artist: { contains: 'Similar Artist 1', mode: 'insensitive' } },
              ],
            }),
          ]),
        },
        select: expect.objectContaining({
          id: true,
          title: true,
          artist: true,
        }),
      });

      expect(result).toEqual([
        {
          song: mockRecommendationSongs[0],
          score: 0.85,
          reason: 'Similar tempo',
        },
      ]);
    });

    it('should handle no matching songs found', async () => {
      // Arrange
      const aiRecommendations = [
        {
          title: 'Unknown Song',
          artist: 'Unknown Artist',
          reason: 'Test reason',
          score: 0.5,
        },
      ];

      mockPrisma.song.findMany.mockResolvedValue([]);

      // Act
      const result = await (service as any).matchRecommendationsToSongs(
        aiRecommendations
      );

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No matching songs found for AI recommendations',
        expect.objectContaining({
          unmatchedRecommendations: aiRecommendations,
        })
      );
    });
  });
});