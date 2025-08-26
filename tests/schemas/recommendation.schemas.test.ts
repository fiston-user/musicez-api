import { Request, Response, NextFunction } from 'express';
import {
  recommendationRequestSchema,
  batchRecommendationRequestSchema,
  validateRecommendationRequest,
  validateBatchRecommendationRequest,
  RecommendationRequest,
  BatchRecommendationRequest,
} from '../../src/schemas/recommendation.schemas';

describe('Recommendation Schemas', () => {
  describe('recommendationRequestSchema', () => {
    it('should validate valid recommendation request', () => {
      const validRequest = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 10,
        includeAnalysis: true,
        forceRefresh: false,
      };

      const result = recommendationRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should apply default values for optional fields', () => {
      const minimalRequest = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = recommendationRequestSchema.parse(minimalRequest);
      expect(result).toEqual({
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 10,
        includeAnalysis: false,
        forceRefresh: false,
      });
    });

    it('should validate limit bounds', () => {
      const requestWithValidLimit = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 25,
      };

      expect(() => recommendationRequestSchema.parse(requestWithValidLimit)).not.toThrow();

      const requestWithInvalidLimitLow = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 0,
      };

      expect(() => recommendationRequestSchema.parse(requestWithInvalidLimitLow)).toThrow(
        'Limit must be at least 1'
      );

      const requestWithInvalidLimitHigh = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 51,
      };

      expect(() => recommendationRequestSchema.parse(requestWithInvalidLimitHigh)).toThrow(
        'Limit cannot exceed 50'
      );
    });

    it('should reject invalid UUID format for songId', () => {
      const invalidRequest = {
        songId: 'invalid-uuid',
        limit: 10,
      };

      expect(() => recommendationRequestSchema.parse(invalidRequest)).toThrow(
        'Song ID must be a valid UUID'
      );
    });

    it('should reject missing songId', () => {
      const invalidRequest = {
        limit: 10,
      };

      expect(() => recommendationRequestSchema.parse(invalidRequest)).toThrow();
    });

    it('should validate boolean fields', () => {
      const validRequest = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        includeAnalysis: 'true' as any, // Invalid type
      };

      expect(() => recommendationRequestSchema.parse(validRequest)).toThrow();
    });

    it('should validate limit as integer', () => {
      const invalidRequest = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 10.5, // Should be integer
      };

      expect(() => recommendationRequestSchema.parse(invalidRequest)).toThrow();
    });
  });

  describe('batchRecommendationRequestSchema', () => {
    it('should validate valid batch recommendation request', () => {
      const validRequest = {
        songIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '223e4567-e89b-12d3-a456-426614174001',
        ],
        limit: 5,
        includeAnalysis: true,
      };

      const result = batchRecommendationRequestSchema.parse(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should apply default values for optional fields', () => {
      const minimalRequest = {
        songIds: ['123e4567-e89b-12d3-a456-426614174000'],
      };

      const result = batchRecommendationRequestSchema.parse(minimalRequest);
      expect(result).toEqual({
        songIds: ['123e4567-e89b-12d3-a456-426614174000'],
        limit: 5,
        includeAnalysis: false,
      });
    });

    it('should validate songIds array bounds', () => {
      const emptyRequest = { songIds: [] };
      expect(() => batchRecommendationRequestSchema.parse(emptyRequest)).toThrow(
        'At least one song ID is required'
      );

      const tooManyRequest = {
        songIds: Array(11).fill('123e4567-e89b-12d3-a456-426614174000'),
      };
      expect(() => batchRecommendationRequestSchema.parse(tooManyRequest)).toThrow(
        'Cannot process more than 10 songs at once'
      );
    });

    it('should validate each songId as UUID', () => {
      const invalidRequest = {
        songIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          'invalid-uuid',
        ],
      };

      expect(() => batchRecommendationRequestSchema.parse(invalidRequest)).toThrow(
        'Each song ID must be a valid UUID'
      );
    });

    it('should validate limit bounds for batch requests', () => {
      const validRequest = {
        songIds: ['123e4567-e89b-12d3-a456-426614174000'],
        limit: 15,
      };

      expect(() => batchRecommendationRequestSchema.parse(validRequest)).not.toThrow();

      const invalidLimitLow = {
        songIds: ['123e4567-e89b-12d3-a456-426614174000'],
        limit: 0,
      };

      expect(() => batchRecommendationRequestSchema.parse(invalidLimitLow)).toThrow(
        'Limit must be at least 1'
      );

      const invalidLimitHigh = {
        songIds: ['123e4567-e89b-12d3-a456-426614174000'],
        limit: 21,
      };

      expect(() => batchRecommendationRequestSchema.parse(invalidLimitHigh)).toThrow(
        'Limit per song cannot exceed 20'
      );
    });
  });

  describe('validateRecommendationRequest middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        body: {},
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        locals: { requestId: 'test-req-123' },
      };

      mockNext = jest.fn();
    });

    it('should pass validation for valid request', () => {
      mockReq.body = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 10,
      };

      validateRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body).toEqual({
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 10,
        includeAnalysis: false,
        forceRefresh: false,
      });
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should return validation error for invalid request', () => {
      mockReq.body = {
        songId: 'invalid-uuid',
        limit: 10,
      };

      validateRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Song ID must be a valid UUID',
          field: 'songId',
          details: expect.any(Array),
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should handle missing requestId gracefully', () => {
      mockRes.locals = {};
      mockReq.body = {
        songId: 'invalid-uuid',
      };

      validateRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        })
      );
    });

    it('should handle non-Zod errors', () => {
      // Mock parse to throw a non-Zod error
      const originalParse = recommendationRequestSchema.parse;
      recommendationRequestSchema.parse = jest.fn(() => {
        throw new Error('Unexpected error');
      });

      validateRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Request validation failed',
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });

      // Restore original method
      recommendationRequestSchema.parse = originalParse;
    });
  });

  describe('validateBatchRecommendationRequest middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        body: {},
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        locals: { requestId: 'test-req-123' },
      };

      mockNext = jest.fn();
    });

    it('should pass validation for valid batch request', () => {
      mockReq.body = {
        songIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '223e4567-e89b-12d3-a456-426614174001',
        ],
        limit: 5,
      };

      validateBatchRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.body).toEqual({
        songIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '223e4567-e89b-12d3-a456-426614174001',
        ],
        limit: 5,
        includeAnalysis: false,
      });
    });

    it('should return validation error for invalid batch request', () => {
      mockReq.body = {
        songIds: [], // Empty array should fail
      };

      validateBatchRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one song ID is required',
          field: 'songIds',
          details: expect.any(Array),
        },
        timestamp: expect.any(String),
        requestId: 'test-req-123',
      });
    });

    it('should validate field path for nested errors', () => {
      mockReq.body = {
        songIds: ['invalid-uuid'],
      };

      validateBatchRecommendationRequest(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            field: 'songIds.0',
          }),
        })
      );
    });
  });

  describe('TypeScript types', () => {
    it('should infer correct types from schemas', () => {
      // This test verifies that TypeScript types are correctly inferred
      const validRequest: RecommendationRequest = {
        songId: '123e4567-e89b-12d3-a456-426614174000',
        limit: 10,
        includeAnalysis: false,
        forceRefresh: true,
      };

      const validBatchRequest: BatchRecommendationRequest = {
        songIds: ['123e4567-e89b-12d3-a456-426614174000'],
        limit: 5,
        includeAnalysis: true,
      };

      // If these compile without errors, the types are correctly defined
      expect(validRequest.songId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(validBatchRequest.songIds).toHaveLength(1);
    });
  });
});