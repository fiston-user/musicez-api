import {
  apiKeyRequestSchema,
  apiKeyUpdateRequestSchema,
  apiKeyResponseSchema,
  apiKeySuccessResponseSchema,
  apiKeyListResponseSchema,
  apiKeyErrorResponseSchema,
  validateApiKeyRequest,
} from '../../src/schemas/api-key.schemas';

describe('API Key Schemas', () => {
  describe('apiKeyRequestSchema', () => {
    it('should validate a valid API key request', () => {
      const validRequest = {
        name: 'Spotify Web API',
        key: 'spotify_api_key_123456789',
        active: true,
      };

      const result = apiKeyRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Spotify Web API');
        expect(result.data.key).toBe('spotify_api_key_123456789');
        expect(result.data.active).toBe(true);
      }
    });

    it('should validate with default active=true when not provided', () => {
      const validRequest = {
        name: 'OpenAI API',
        key: 'sk-openai_key_abcdef123456',
      };

      const result = apiKeyRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.active).toBe(true);
      }
    });

    it('should reject request with missing name', () => {
      const invalidRequest = {
        key: 'test_key_123',
        active: true,
      };

      const result = apiKeyRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
      }
    });

    it('should reject request with missing key', () => {
      const invalidRequest = {
        name: 'Test API',
        active: true,
      };

      const result = apiKeyRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
      }
    });

    it('should reject name that is too short', () => {
      const invalidRequest = {
        name: 'A',
        key: 'test_key_123',
      };

      const result = apiKeyRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('should reject name that is too long', () => {
      const invalidRequest = {
        name: 'A'.repeat(101),
        key: 'test_key_123',
      };

      const result = apiKeyRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('not exceed 100 characters');
      }
    });

    it('should reject key that is too short', () => {
      const invalidRequest = {
        name: 'Test API',
        key: 'short',
      };

      const result = apiKeyRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 8 characters');
      }
    });

    it('should reject key with invalid characters', () => {
      const invalidRequest = {
        name: 'Test API',
        key: 'invalid key with spaces!@#',
      };

      const result = apiKeyRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('alphanumeric characters');
      }
    });

    it('should trim whitespace from name', () => {
      const requestWithWhitespace = {
        name: '  Spotify Web API  ',
        key: 'spotify_key_123',
      };

      const result = apiKeyRequestSchema.safeParse(requestWithWhitespace);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Spotify Web API');
      }
    });
  });

  describe('apiKeyUpdateRequestSchema', () => {
    it('should validate partial update with name only', () => {
      const updateRequest = {
        name: 'Updated API Name',
      };

      const result = apiKeyUpdateRequestSchema.safeParse(updateRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated API Name');
        expect(result.data.key).toBeUndefined();
        expect(result.data.active).toBeUndefined();
      }
    });

    it('should validate partial update with key only', () => {
      const updateRequest = {
        key: 'new_api_key_456789',
      };

      const result = apiKeyUpdateRequestSchema.safeParse(updateRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('new_api_key_456789');
      }
    });

    it('should validate partial update with active status only', () => {
      const updateRequest = {
        active: false,
      };

      const result = apiKeyUpdateRequestSchema.safeParse(updateRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.active).toBe(false);
      }
    });

    it('should validate full update request', () => {
      const updateRequest = {
        name: 'Updated API',
        key: 'updated_key_123456',
        active: false,
      };

      const result = apiKeyUpdateRequestSchema.safeParse(updateRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated API');
        expect(result.data.key).toBe('updated_key_123456');
        expect(result.data.active).toBe(false);
      }
    });

    it('should reject empty update request', () => {
      const emptyRequest = {};

      const result = apiKeyUpdateRequestSchema.safeParse(emptyRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('At least one field');
      }
    });

    it('should apply same validation rules as create schema', () => {
      const invalidUpdate = {
        name: 'A',
        key: 'short',
      };

      const result = apiKeyUpdateRequestSchema.safeParse(invalidUpdate);
      expect(result.success).toBe(false);
    });
  });

  describe('apiKeyResponseSchema', () => {
    it('should validate a complete API key response', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Spotify Web API',
        active: true,
        createdAt: new Date('2025-08-26T10:00:00Z'),
        updatedAt: new Date('2025-08-26T10:00:00Z'),
        lastUsed: new Date('2025-08-26T14:30:00Z'),
      };

      const result = apiKeyResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate response with null lastUsed', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'OpenAI API',
        active: true,
        createdAt: new Date('2025-08-26T10:00:00Z'),
        updatedAt: new Date('2025-08-26T10:00:00Z'),
        lastUsed: null,
      };

      const result = apiKeyResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject response with invalid UUID', () => {
      const response = {
        id: 'invalid-uuid',
        name: 'Test API',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsed: null,
      };

      const result = apiKeyResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('apiKeySuccessResponseSchema', () => {
    it('should validate successful API response with data', () => {
      const successResponse = {
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Spotify Web API',
          active: true,
          createdAt: new Date('2025-08-26T10:00:00Z'),
          updatedAt: new Date('2025-08-26T10:00:00Z'),
          lastUsed: null,
        },
        timestamp: '2025-08-26T10:00:00Z',
      };

      const result = apiKeySuccessResponseSchema.safeParse(successResponse);
      expect(result.success).toBe(true);
    });

    it('should validate response with optional requestId', () => {
      const successResponse = {
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test API',
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsed: null,
        },
        timestamp: '2025-08-26T10:00:00Z',
        requestId: 'req-123-456',
      };

      const result = apiKeySuccessResponseSchema.safeParse(successResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('apiKeyListResponseSchema', () => {
    it('should validate list response with multiple API keys', () => {
      const listResponse = {
        success: true,
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Spotify Web API',
            active: true,
            createdAt: new Date('2025-08-26T10:00:00Z'),
            updatedAt: new Date('2025-08-26T10:00:00Z'),
            lastUsed: new Date('2025-08-26T14:30:00Z'),
          },
          {
            id: '123e4567-e89b-12d3-a456-426614174001',
            name: 'OpenAI API',
            active: false,
            createdAt: new Date('2025-08-26T11:00:00Z'),
            updatedAt: new Date('2025-08-26T12:00:00Z'),
            lastUsed: null,
          },
        ],
        timestamp: '2025-08-26T15:00:00Z',
      };

      const result = apiKeyListResponseSchema.safeParse(listResponse);
      expect(result.success).toBe(true);
    });

    it('should validate empty list response', () => {
      const emptyListResponse = {
        success: true,
        data: [],
        timestamp: '2025-08-26T15:00:00Z',
      };

      const result = apiKeyListResponseSchema.safeParse(emptyListResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('apiKeyErrorResponseSchema', () => {
    it('should validate error response with validation error', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name is required',
          field: 'name',
        },
        timestamp: '2025-08-26T15:00:00Z',
      };

      const result = apiKeyErrorResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);
    });

    it('should validate error response with API key not found', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'API_KEY_NOT_FOUND',
          message: 'API key with the specified ID was not found',
        },
        timestamp: '2025-08-26T15:00:00Z',
      };

      const result = apiKeyErrorResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);
    });

    it('should validate error response with duplicate name', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'DUPLICATE_API_KEY_NAME',
          message: 'An API key with this name already exists',
          field: 'name',
        },
        timestamp: '2025-08-26T15:00:00Z',
        requestId: 'req-error-123',
      };

      const result = apiKeyErrorResponseSchema.safeParse(errorResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('validateApiKeyRequest middleware', () => {
    it('should return middleware function', () => {
      const middleware = validateApiKeyRequest(apiKeyRequestSchema);
      expect(typeof middleware).toBe('function');
    });

    it('should pass valid request to next middleware', () => {
      const middleware = validateApiKeyRequest(apiKeyRequestSchema);
      const req = {
        body: {
          name: 'Test API',
          key: 'test_key_123456789',
        },
      };
      const res = {
        locals: { requestId: 'test-req-123' },
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req.body as any).active).toBe(true); // Default value applied
    });

    it('should return validation error for invalid request', () => {
      const middleware = validateApiKeyRequest(apiKeyRequestSchema);
      const req = {
        body: {
          name: '', // Invalid: empty name
          key: 'test_key_123456789',
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        locals: { requestId: 'test-req-123' },
      };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});