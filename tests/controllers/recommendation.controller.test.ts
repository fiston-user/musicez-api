import { Response, NextFunction } from 'express';

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

// Mock the modules before imports
jest.mock('../../src/utils/logger', () => mockLogger);

jest.mock('../../src/config/redis', () => ({
  redis: mockRedis,
}));

jest.mock('../../src/services/openai-recommendation.service');

import { RecommendationController } from '../../src/controllers/recommendation.controller';
import { OpenAIRecommendationService } from '../../src/services/openai-recommendation.service';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';

describe('RecommendationController', () => {
  let controller: RecommendationController;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockOpenAIService: jest.Mocked<OpenAIRecommendationService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockSong = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    genre: 'Pop',
    releaseYear: 2023,
    tempo: 120.0,
    key: 'C Major',
    energy: 0.8,
    danceability: 0.7,
    valence: 0.6,
    acousticness: 0.2,
    instrumentalness: 0.1,
    popularity: 85,
    previewUrl: 'https://example.com/preview.mp3',
  };

  const mockRecommendations = [
    {
      song: {
        id: '223e4567-e89b-12d3-a456-426614174001',
        title: 'Similar Song 1',
        artist: 'Similar Artist 1',
        album: 'Similar Album 1',
        genre: 'Pop',
        releaseYear: 2022,
        tempo: 125.0,
        key: 'D Major',
        energy: 0.75,
        danceability: 0.65,
        valence: 0.58,
        acousticness: 0.25,
        instrumentalness: 0.15,
        popularity: 80,
        previewUrl: 'https://example.com/preview1.mp3',
      },
      score: 0.85,
      reason: 'Similar tempo and energy levels',
    },
    {
      song: {
        id: '323e4567-e89b-12d3-a456-426614174002',
        title: 'Similar Song 2',
        artist: 'Similar Artist 2',
        album: 'Similar Album 2',
        genre: 'Pop',
        releaseYear: 2021,
        tempo: 118.0,
        key: 'A Major',
        energy: 0.72,
        danceability: 0.68,
        valence: 0.62,
        acousticness: 0.18,
        instrumentalness: 0.08,
        popularity: 75,
        previewUrl: 'https://example.com/preview2.mp3',
      },
      score: 0.78,
      reason: 'Same genre and similar danceability',
    },
  ];

  const mockOpenAIResponse = {
    recommendations: mockRecommendations,
    metadata: {
      inputSong: {
        id: mockSong.id,
        title: mockSong.title,
        artist: mockSong.artist,
      },
      totalRecommendations: 2,
      processingTimeMs: 1500,
      cacheHit: false,
      tokensUsed: 150,
    },
  };

  beforeEach(() => {
    controller = new RecommendationController();
    jest.clearAllMocks();

    // Mock OpenAI service
    mockOpenAIService = new OpenAIRecommendationService() as jest.Mocked<OpenAIRecommendationService>;
    (OpenAIRecommendationService as jest.Mock).mockImplementation(() => mockOpenAIService);

    // Setup request mock
    mockReq = {
      body: {
        songId: mockSong.id,
        limit: 10,
        includeAnalysis: false,
        forceRefresh: false,
      },
      user: mockUser,
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
    };

    // Setup response mock
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      locals: { requestId: 'test-req-123' },
    };

    mockNext = jest.fn();

    // Setup default mock behaviors
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK' as any);
  });

  describe('constructor', () => {
    it('should initialize without parameters', () => {
      expect(controller).toBeInstanceOf(RecommendationController);
    });
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations for valid request', async () => {
      // Arrange
      mockOpenAIService.generateRecommendations.mockResolvedValue(mockOpenAIResponse);

      // Act
      await controller.generateRecommendations(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Assert
      expect(mockOpenAIService.generateRecommendations).toHaveBeenCalledWith(
        mockSong.id,
        {
          limit: 10,
          includeAnalysis: false,
          forceRefresh: false,
        }
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Recommendation generation initiated',
        expect.objectContaining({
          songId: mockSong.id,
          limit: 10,
          userId: mockUser.id,
          requestId: 'test-req-123',
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Recommendation generation completed',
        expect.objectContaining({
          songId: mockSong.id,
          totalRecommendations: 2,
          processingTimeMs: expect.any(Number),
          requestId: 'test-req-123',
        })
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            recommendations: expect.arrayContaining([
              expect.objectContaining({
                song: expect.objectContaining({ id: mockRecommendations[0].song.id }),
                score: 0.85,
                reason: 'Similar tempo and energy levels',
              }),
            ]),
            metadata: expect.objectContaining({
              inputSong: expect.objectContaining({ id: mockSong.id }),
              totalRecommendations: 2,
              cacheHit: false,
            }),
          }),
          timestamp: expect.any(String),
          requestId: 'test-req-123',
        })
      );
    });

    it('should handle OpenAI service errors gracefully', async () => {
      // Arrange
      const error = new Error('OpenAI API timeout');
      mockOpenAIService.generateRecommendations.mockRejectedValue(error);

      // Act
      await controller.generateRecommendations(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Recommendation generation failed',
        expect.objectContaining({
          error: 'OpenAI API timeout',
          songId: mockSong.id,
          userId: mockUser.id,
          processingTimeMs: expect.any(Number),
          requestId: 'test-req-123',
        })
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred while generating recommendations',
          }),
          requestId: 'test-req-123',
        })
      );
    });

    it('should handle missing song ID', async () => {
      // Arrange
      mockReq.body = { limit: 10 }; // Missing songId

      // Act
      await controller.generateRecommendations(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Song ID is required',
          }),
        })
      );
    });

    it('should handle service returning empty recommendations', async () => {
      // Arrange
      const emptyResponse = {
        ...mockOpenAIResponse,
        recommendations: [],
        metadata: {
          ...mockOpenAIResponse.metadata,
          totalRecommendations: 0,
        },
      };
      mockOpenAIService.generateRecommendations.mockResolvedValue(emptyResponse);

      // Act
      await controller.generateRecommendations(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            recommendations: [],
            metadata: expect.objectContaining({
              totalRecommendations: 0,
            }),
          }),
        })
      );
    });
  });

  describe('generateBatchRecommendations', () => {
    const batchRequest = {
      songIds: [mockSong.id, '223e4567-e89b-12d3-a456-426614174001'],
      limit: 5,
      includeAnalysis: false,
    };

    it('should generate batch recommendations for valid request', async () => {
      // Arrange
      mockReq.body = batchRequest;
      const batchResponse = {
        results: [
          {
            inputSongId: mockSong.id,
            success: true,
            recommendations: mockRecommendations.slice(0, 1),
          },
          {
            inputSongId: '223e4567-e89b-12d3-a456-426614174001',
            success: true,
            recommendations: mockRecommendations.slice(1, 2),
          },
        ],
        metadata: {
          processed: 2,
          failed: 0,
          totalProcessingTime: 3000,
        },
      };

      (controller as any).processBatchRecommendations = jest.fn().mockResolvedValue(batchResponse);

      // Act
      await controller.generateBatchRecommendations(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Batch recommendation generation initiated',
        expect.objectContaining({
          songIds: batchRequest.songIds,
          limit: 5,
          userId: mockUser.id,
        })
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: batchResponse,
          timestamp: expect.any(String),
          requestId: 'test-req-123',
        })
      );
    });
  });
});