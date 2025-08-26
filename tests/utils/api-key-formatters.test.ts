import { ApiKey } from '@prisma/client';
import {
  formatApiKeyResponse,
  formatApiKeyListResponse,
  formatApiKeySuccessResponse,
  formatApiKeyDeleteResponse,
  formatApiKeyErrorResponse,
  apiKeyErrorResponses,
  maskApiKey,
  formatApiKeyWithMask,
  formatDuplicateNameError,
  formatPaginatedApiKeyResponse,
  getHttpStatusForError,
} from '../../src/utils/api-key-formatters';

describe('API Key Formatters', () => {
  const mockApiKey: ApiKey = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    key: 'sk_test_abcdefghijklmnop123456789',
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

  describe('formatApiKeyResponse', () => {
    it('should format API key response excluding sensitive data', () => {
      const response = formatApiKeyResponse(mockApiKey);

      expect(response).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
        active: mockApiKey.active,
        createdAt: mockApiKey.createdAt,
        updatedAt: mockApiKey.updatedAt,
        lastUsed: mockApiKey.lastUsed,
      });
      expect(response).not.toHaveProperty('key');
    });

    it('should handle null lastUsed date', () => {
      const response = formatApiKeyResponse(mockInactiveApiKey);

      expect(response.lastUsed).toBeNull();
      expect(response.active).toBe(false);
    });
  });

  describe('formatApiKeyListResponse', () => {
    it('should format multiple API keys', () => {
      const apiKeys = [mockApiKey, mockInactiveApiKey];
      const requestId = 'test-req-123';

      const response = formatApiKeyListResponse(apiKeys, requestId);

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.data[0].id).toBe(mockApiKey.id);
      expect(response.data[1].id).toBe(mockInactiveApiKey.id);
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeDefined();
    });

    it('should format empty API key list', () => {
      const response = formatApiKeyListResponse([]);

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(0);
      expect(response.requestId).toBeUndefined();
    });
  });

  describe('formatApiKeySuccessResponse', () => {
    it('should format single API key success response', () => {
      const requestId = 'test-req-456';

      const response = formatApiKeySuccessResponse(mockApiKey, requestId);

      expect(response.success).toBe(true);
      expect(response.data.id).toBe(mockApiKey.id);
      expect(response.data.name).toBe(mockApiKey.name);
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeDefined();
    });

    it('should format success response without request ID', () => {
      const response = formatApiKeySuccessResponse(mockApiKey);

      expect(response.success).toBe(true);
      expect(response.requestId).toBeUndefined();
    });
  });

  describe('formatApiKeyDeleteResponse', () => {
    it('should format delete success response with custom message', () => {
      const message = 'API key successfully removed';
      const requestId = 'test-req-789';

      const response = formatApiKeyDeleteResponse(message, requestId);

      expect(response.success).toBe(true);
      expect(response.message).toBe(message);
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeDefined();
    });

    it('should format delete success response with default message', () => {
      const response = formatApiKeyDeleteResponse();

      expect(response.success).toBe(true);
      expect(response.message).toBe('API key deleted successfully');
      expect(response.requestId).toBeUndefined();
    });
  });

  describe('formatApiKeyErrorResponse', () => {
    it('should format validation error response', () => {
      const response = formatApiKeyErrorResponse(
        'VALIDATION_ERROR',
        'Name is required',
        {
          field: 'name',
          details: [{ field: 'name', message: 'Name is required' }],
          requestId: 'test-req-error',
        }
      );

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Name is required');
      expect(response.error.field).toBe('name');
      expect(response.error.details).toBeDefined();
      expect(response.requestId).toBe('test-req-error');
      expect(response.timestamp).toBeDefined();
    });

    it('should format simple error response', () => {
      const response = formatApiKeyErrorResponse(
        'API_KEY_NOT_FOUND',
        'API key not found'
      );

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('API_KEY_NOT_FOUND');
      expect(response.error.message).toBe('API key not found');
      expect(response.error.field).toBeUndefined();
      expect(response.requestId).toBeUndefined();
    });
  });

  describe('apiKeyErrorResponses', () => {
    it('should create not found error', () => {
      const requestId = 'test-req-404';
      const response = apiKeyErrorResponses.notFound(requestId);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('API_KEY_NOT_FOUND');
      expect(response.requestId).toBe(requestId);
    });

    it('should create duplicate name error', () => {
      const name = 'Duplicate API';
      const response = apiKeyErrorResponses.duplicateName(name);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('DUPLICATE_API_KEY_NAME');
      expect(response.error.message).toContain(name);
      expect(response.error.field).toBe('name');
    });

    it('should create unauthorized error', () => {
      const response = apiKeyErrorResponses.unauthorized();

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('UNAUTHORIZED');
      expect(response.error.message).toContain('Admin authentication required');
    });

    it('should create internal error', () => {
      const response = apiKeyErrorResponses.internalError();

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should create rate limit error', () => {
      const response = apiKeyErrorResponses.rateLimitExceeded();

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should create validation error', () => {
      const response = apiKeyErrorResponses.validationError(
        'Invalid input',
        'name',
        ['field is required'],
        'test-req'
      );

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Invalid input');
      expect(response.error.field).toBe('name');
      expect(response.error.details).toEqual(['field is required']);
      expect(response.requestId).toBe('test-req');
    });
  });

  describe('maskApiKey', () => {
    it('should mask a long API key', () => {
      const key = 'sk_test_1234567890abcdefghijklmnopqrstuvwxyz';
      const masked = maskApiKey(key);

      expect(masked.startsWith('sk_t')).toBe(true);
      expect(masked.endsWith('wxyz')).toBe(true);
      expect(masked.includes('*')).toBe(true);
      expect(masked.length).toBeLessThanOrEqual(key.length);
    });

    it('should mask a short API key', () => {
      const key = 'short';
      const masked = maskApiKey(key);

      expect(masked).toBe('*****');
      expect(masked.length).toBe(key.length);
    });

    it('should mask a medium API key', () => {
      const key = 'medium_key';
      const masked = maskApiKey(key);

      expect(masked.startsWith('medi')).toBe(true);
      expect(masked.endsWith('_key')).toBe(true);
      expect(masked.includes('*')).toBe(true);
    });
  });

  describe('formatApiKeyWithMask', () => {
    it('should include masked key in response', () => {
      const response = formatApiKeyWithMask(mockApiKey);

      expect(response.id).toBe(mockApiKey.id);
      expect(response.name).toBe(mockApiKey.name);
      expect(response.maskedKey).toBeDefined();
      expect(response.maskedKey.includes('*')).toBe(true);
      expect(response.maskedKey).not.toBe(mockApiKey.key);
    });
  });

  describe('formatDuplicateNameError', () => {
    it('should format duplicate name error', () => {
      const name = 'Duplicate Name';
      const requestId = 'test-req-dup';

      const response = formatDuplicateNameError(name, requestId);

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('DUPLICATE_API_KEY_NAME');
      expect(response.error.message).toContain(name);
      expect(response.error.field).toBe('name');
      expect(response.requestId).toBe(requestId);
    });
  });

  describe('formatPaginatedApiKeyResponse', () => {
    it('should format paginated response', () => {
      const apiKeys = [mockApiKey];
      const total = 10;
      const limit = 20;
      const offset = 0;
      const requestId = 'test-req-page';

      const response = formatPaginatedApiKeyResponse(
        apiKeys,
        total,
        limit,
        offset,
        requestId
      );

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.pagination.total).toBe(total);
      expect(response.pagination.limit).toBe(limit);
      expect(response.pagination.offset).toBe(offset);
      expect(response.pagination.hasMore).toBe(true);
      expect(response.requestId).toBe(requestId);
    });

    it('should indicate no more results when at end', () => {
      const apiKeys = [mockApiKey];
      const total = 1;
      const limit = 20;
      const offset = 0;

      const response = formatPaginatedApiKeyResponse(
        apiKeys,
        total,
        limit,
        offset
      );

      expect(response.pagination.hasMore).toBe(false);
    });
  });

  describe('getHttpStatusForError', () => {
    it('should return correct status codes for each error type', () => {
      expect(getHttpStatusForError('VALIDATION_ERROR')).toBe(400);
      expect(getHttpStatusForError('UNAUTHORIZED')).toBe(401);
      expect(getHttpStatusForError('API_KEY_NOT_FOUND')).toBe(404);
      expect(getHttpStatusForError('DUPLICATE_API_KEY_NAME')).toBe(409);
      expect(getHttpStatusForError('RATE_LIMIT_EXCEEDED')).toBe(429);
      expect(getHttpStatusForError('INTERNAL_SERVER_ERROR')).toBe(500);
    });
  });
});