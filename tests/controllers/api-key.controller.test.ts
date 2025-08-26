import { Request, Response, NextFunction } from 'express';
import { ApiKey } from '@prisma/client';
import { ApiKeyController } from '../../src/controllers/api-key.controller';
import { hashApiKey } from '../../src/utils/api-key-security';
import {
  formatApiKeySuccessResponse,
  formatApiKeyListResponse,
  formatApiKeyDeleteResponse,
  apiKeyErrorResponses,
  getHttpStatusForError,
} from '../../src/utils/api-key-formatters';
import logger from '../../src/utils/logger';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/api-key-security');
jest.mock('../../src/utils/api-key-formatters');

// Mock prisma with manual implementation
jest.mock('../../src/database/prisma', () => ({
  prisma: {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Import mocked prisma
import { prisma } from '../../src/database/prisma';

const mockHashApiKey = hashApiKey as jest.MockedFunction<typeof hashApiKey>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFormatApiKeySuccessResponse = formatApiKeySuccessResponse as jest.MockedFunction<typeof formatApiKeySuccessResponse>;
const mockFormatApiKeyListResponse = formatApiKeyListResponse as jest.MockedFunction<typeof formatApiKeyListResponse>;
const mockFormatApiKeyDeleteResponse = formatApiKeyDeleteResponse as jest.MockedFunction<typeof formatApiKeyDeleteResponse>;
const mockApiKeyErrorResponses = apiKeyErrorResponses as jest.Mocked<typeof apiKeyErrorResponses>;
const mockGetHttpStatusForError = getHttpStatusForError as jest.MockedFunction<typeof getHttpStatusForError>;


describe('ApiKeyController', () => {
  let controller: ApiKeyController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  const mockApiKey: ApiKey = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    key: 'hashed_api_key_value',
    name: 'Test API Key',
    active: true,
    createdAt: new Date('2025-08-26T10:00:00Z'),
    updatedAt: new Date('2025-08-26T10:00:00Z'),
    lastUsed: new Date('2025-08-26T14:30:00Z'),
  };

  const mockInactiveApiKey: ApiKey = {
    ...mockApiKey,
    id: '123e4567-e89b-12d3-a456-426614174001',
    name: 'Inactive API Key',
    active: false,
    lastUsed: null,
  };

  beforeEach(() => {
    controller = new ApiKeyController();

    mockReq = {
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent') as any,
    } as Partial<Request>;

    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
      locals: { requestId: 'test-req-123' },
    } as Partial<Response>;

    mockNext = jest.fn();

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockApiKeyErrorResponses.duplicateName.mockReturnValue({
      success: false,
      error: { code: 'DUPLICATE_API_KEY_NAME', message: 'Duplicate name' },
      timestamp: '2025-08-26T10:00:00Z',
    } as any);

    mockApiKeyErrorResponses.internalError.mockReturnValue({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' },
      timestamp: '2025-08-26T10:00:00Z',
    } as any);

    mockApiKeyErrorResponses.notFound.mockReturnValue({
      success: false,
      error: { code: 'API_KEY_NOT_FOUND', message: 'Not found' },
      timestamp: '2025-08-26T10:00:00Z',
    } as any);

    // Setup getHttpStatusForError mock
    mockGetHttpStatusForError.mockImplementation((code) => {
      switch (code) {
        case 'DUPLICATE_API_KEY_NAME':
          return 409;
        case 'API_KEY_NOT_FOUND':
          return 404;
        case 'INTERNAL_SERVER_ERROR':
        default:
          return 500;
      }
    });
  });

  describe('createApiKey', () => {
    const validCreateRequest = {
      name: 'Spotify Web API',
      key: 'sk_test_spotify_12345',
      active: true,
    };

    beforeEach(() => {
      mockReq.body = validCreateRequest;
    });

    it('should create API key successfully', async () => {
      const hashedKey = 'hashed_spotify_key';
      mockHashApiKey.mockResolvedValue(hashedKey);
      mockPrisma.apiKey.findFirst.mockResolvedValue(null); // No duplicate name
      mockPrisma.apiKey.create.mockResolvedValue(mockApiKey);
      
      const mockSuccessResponse = {
        success: true,
        data: mockApiKey,
        timestamp: '2025-08-26T10:00:00Z',
      };
      mockFormatApiKeySuccessResponse.mockReturnValue(mockSuccessResponse as any);

      await controller.createApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockHashApiKey).toHaveBeenCalledWith('sk_test_spotify_12345');
      expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { name: 'Spotify Web API' },
      });
      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          name: 'Spotify Web API',
          key: hashedKey,
          active: true,
        },
      });
      expect(mockFormatApiKeySuccessResponse).toHaveBeenCalledWith(mockApiKey, 'test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(mockSuccessResponse);
    });

    it('should handle duplicate API key name', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(mockApiKey);
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'DUPLICATE_API_KEY_NAME', message: 'Duplicate name' },
      };
      mockApiKeyErrorResponses.duplicateName.mockReturnValue(mockErrorResponse as any);

      await controller.createApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
      expect(mockApiKeyErrorResponses.duplicateName).toHaveBeenCalledWith(
        'Spotify Web API',
        'test-req-123'
      );
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(mockErrorResponse);
    });

    it('should handle API key hashing failure', async () => {
      mockHashApiKey.mockRejectedValue(new Error('Hashing failed'));
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' },
      };
      mockApiKeyErrorResponses.internalError.mockReturnValue(mockErrorResponse as any);

      await controller.createApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
      expect(mockApiKeyErrorResponses.internalError).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle database creation error', async () => {
      const hashedKey = 'hashed_key';
      mockHashApiKey.mockResolvedValue(hashedKey);
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      mockPrisma.apiKey.create.mockRejectedValue(new Error('Database error'));
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' },
      };
      mockApiKeyErrorResponses.internalError.mockReturnValue(mockErrorResponse as any);

      await controller.createApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockApiKeyErrorResponses.internalError).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAllApiKeys', () => {
    beforeEach(() => {
      // Simulate query validation middleware transformation
      (mockReq as any).query = { active: true, limit: 20, offset: 0 };
    });

    it('should get all API keys successfully', async () => {
      const apiKeys = [mockApiKey, mockInactiveApiKey];
      mockPrisma.apiKey.findMany.mockResolvedValue(apiKeys);
      
      const mockListResponse = {
        success: true,
        data: apiKeys,
        timestamp: '2025-08-26T10:00:00Z',
      };
      mockFormatApiKeyListResponse.mockReturnValue(mockListResponse as any);

      await controller.getAllApiKeys(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { active: true },
        take: 20,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
      expect(mockFormatApiKeyListResponse).toHaveBeenCalledWith(apiKeys, 'test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockListResponse);
    });

    it('should filter by active status', async () => {
      (mockReq as any).query = { active: false };
      mockPrisma.apiKey.findMany.mockResolvedValue([mockInactiveApiKey]);

      await controller.getAllApiKeys(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { active: false },
        take: 20,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle no filters (get all)', async () => {
      (mockReq as any).query = {};
      mockPrisma.apiKey.findMany.mockResolvedValue([mockApiKey, mockInactiveApiKey]);

      await controller.getAllApiKeys(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: {},
        take: 20,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle database error', async () => {
      mockPrisma.apiKey.findMany.mockRejectedValue(new Error('Database error'));
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' },
      };
      mockApiKeyErrorResponses.internalError.mockReturnValue(mockErrorResponse as any);

      await controller.getAllApiKeys(mockReq as Request, mockRes as Response, mockNext);

      expect(mockApiKeyErrorResponses.internalError).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getApiKeyById', () => {
    beforeEach(() => {
      mockReq.params = { id: mockApiKey.id };
    });

    it('should get API key by ID successfully', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      
      const mockSuccessResponse = {
        success: true,
        data: mockApiKey,
        timestamp: '2025-08-26T10:00:00Z',
      };
      mockFormatApiKeySuccessResponse.mockReturnValue(mockSuccessResponse as any);

      await controller.getApiKeyById(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: mockApiKey.id },
      });
      expect(mockFormatApiKeySuccessResponse).toHaveBeenCalledWith(mockApiKey, 'test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockSuccessResponse);
    });

    it('should handle API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'API_KEY_NOT_FOUND', message: 'Not found' },
      };
      mockApiKeyErrorResponses.notFound.mockReturnValue(mockErrorResponse as any);

      await controller.getApiKeyById(mockReq as Request, mockRes as Response, mockNext);

      expect(mockApiKeyErrorResponses.notFound).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(mockErrorResponse);
    });

    it('should handle database error', async () => {
      mockPrisma.apiKey.findUnique.mockRejectedValue(new Error('Database error'));
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' },
      };
      mockApiKeyErrorResponses.internalError.mockReturnValue(mockErrorResponse as any);

      await controller.getApiKeyById(mockReq as Request, mockRes as Response, mockNext);

      expect(mockApiKeyErrorResponses.internalError).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateApiKey', () => {
    const updateRequest = {
      name: 'Updated API Name',
      active: false,
    };

    beforeEach(() => {
      mockReq.params = { id: mockApiKey.id };
      mockReq.body = updateRequest;
    });

    it('should update API key successfully', async () => {
      const updatedApiKey = { ...mockApiKey, ...updateRequest };
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.findFirst.mockResolvedValue(null); // No name conflict
      mockPrisma.apiKey.update.mockResolvedValue(updatedApiKey);
      
      const mockSuccessResponse = {
        success: true,
        data: updatedApiKey,
        timestamp: '2025-08-26T10:00:00Z',
      };
      mockFormatApiKeySuccessResponse.mockReturnValue(mockSuccessResponse as any);

      await controller.updateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: mockApiKey.id },
        data: updateRequest,
      });
      expect(mockFormatApiKeySuccessResponse).toHaveBeenCalledWith(updatedApiKey, 'test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockSuccessResponse);
    });

    it('should handle API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'API_KEY_NOT_FOUND', message: 'Not found' },
      };
      mockApiKeyErrorResponses.notFound.mockReturnValue(mockErrorResponse as any);

      await controller.updateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
      expect(mockApiKeyErrorResponses.notFound).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should handle duplicate name when updating', async () => {
      const conflictingApiKey = { ...mockInactiveApiKey, name: 'Updated API Name' };
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.findFirst.mockResolvedValue(conflictingApiKey);
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'DUPLICATE_API_KEY_NAME', message: 'Duplicate name' },
      };
      mockApiKeyErrorResponses.duplicateName.mockReturnValue(mockErrorResponse as any);

      await controller.updateApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
      expect(mockApiKeyErrorResponses.duplicateName).toHaveBeenCalledWith(
        'Updated API Name',
        'test-req-123'
      );
      expect(mockRes.status).toHaveBeenCalledWith(409);
    });
  });

  describe('deleteApiKey', () => {
    beforeEach(() => {
      mockReq.params = { id: mockApiKey.id };
    });

    it('should delete API key successfully', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.delete.mockResolvedValue(mockApiKey);
      
      const mockDeleteResponse = {
        success: true,
        message: 'API key deleted successfully',
        timestamp: '2025-08-26T10:00:00Z',
      };
      mockFormatApiKeyDeleteResponse.mockReturnValue(mockDeleteResponse as any);

      await controller.deleteApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.delete).toHaveBeenCalledWith({
        where: { id: mockApiKey.id },
      });
      expect(mockFormatApiKeyDeleteResponse).toHaveBeenCalledWith(
        'API key deleted successfully',
        'test-req-123'
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockDeleteResponse);
    });

    it('should handle API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'API_KEY_NOT_FOUND', message: 'Not found' },
      };
      mockApiKeyErrorResponses.notFound.mockReturnValue(mockErrorResponse as any);

      await controller.deleteApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPrisma.apiKey.delete).not.toHaveBeenCalled();
      expect(mockApiKeyErrorResponses.notFound).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should handle database deletion error', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.delete.mockRejectedValue(new Error('Database error'));
      
      const mockErrorResponse = {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' },
      };
      mockApiKeyErrorResponses.internalError.mockReturnValue(mockErrorResponse as any);

      await controller.deleteApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(mockApiKeyErrorResponses.internalError).toHaveBeenCalledWith('test-req-123');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('logging and audit trail', () => {
    it('should log successful API key creation', async () => {
      mockReq.body = {
        name: 'Test API',
        key: 'test_key_123',
        active: true,
      };

      mockHashApiKey.mockResolvedValue('hashed_key');
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);
      mockPrisma.apiKey.create.mockResolvedValue(mockApiKey);
      mockFormatApiKeySuccessResponse.mockReturnValue({} as any);

      await controller.createApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith('API key creation initiated', {
        name: 'Test API',
        ip: '127.0.0.1',
        userAgent: 'test-user-agent',
        requestId: 'test-req-123',
      });

      expect(logger.info).toHaveBeenCalledWith('API key created successfully', 
        expect.objectContaining({
          id: mockApiKey.id,
          name: mockApiKey.name,
          active: mockApiKey.active,
          ip: '127.0.0.1',
          requestId: 'test-req-123',
        })
      );
    });

    it('should log API key deletion', async () => {
      mockReq.params = { id: mockApiKey.id };

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.delete.mockResolvedValue(mockApiKey);
      mockFormatApiKeyDeleteResponse.mockReturnValue({} as any);

      await controller.deleteApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.info).toHaveBeenCalledWith('API key deleted successfully', 
        expect.objectContaining({
          id: mockApiKey.id,
          name: mockApiKey.name,
          ip: '127.0.0.1',
          requestId: 'test-req-123',
        })
      );
    });

    it('should log errors appropriately', async () => {
      mockReq.body = {
        name: 'Test API',
        key: 'test_key_123',
      };

      const error = new Error('Database connection failed');
      mockHashApiKey.mockResolvedValue('hashed_key');
      mockPrisma.apiKey.findFirst.mockRejectedValue(error);
      mockApiKeyErrorResponses.internalError.mockReturnValue({
        error: { code: 'INTERNAL_ERROR' }
      } as any);

      await controller.createApiKey(mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('API key creation failed', expect.objectContaining({
        error: 'Database connection failed',
        stack: expect.any(String),
        name: 'Test API',
        processingTime: expect.any(Number),
        ip: '127.0.0.1',
        requestId: 'test-req-123',
      }));
    });
  });
});