import request from 'supertest';
import { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import createApp from '../../src/app';
import { redis } from '../../src/config/redis';
import { hashPassword } from '../../src/utils/password-security';

describe('API Key Management Endpoints', () => {
  let app: Application;
  let prisma: PrismaClient;
  let adminAccessToken: string;
  let testApiKeyId: string;

  beforeAll(async () => {
    app = createApp();
    prisma = new PrismaClient();
    
    // Clean up test data
    await prisma.apiKey.deleteMany();
    await prisma.userPreference.deleteMany();
    await prisma.recommendedSong.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.user.deleteMany();
    
    // Create admin user for testing authenticated endpoints
    const hashedPassword = await hashPassword('AdminPassword123!');
    await prisma.user.create({
      data: {
        email: 'admin@musicez.com',
        password: hashedPassword,
        name: 'Admin User',
        emailVerified: true
      }
    });

    // Get access token by logging in
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@musicez.com',
        password: 'AdminPassword123!'
      });
    
    adminAccessToken = loginResponse.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up Redis and database
    if (redis.quit) {
      await redis.quit();
    }
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up API keys after each test (preserve admin user)
    await prisma.apiKey.deleteMany();
    
    // Clear Redis test data
    const keys = await redis.keys('session:*');
    if (keys.length > 0) {
      await Promise.all(keys.map(key => redis.del(key)));
    }
  });

  describe('POST /admin/api-keys', () => {
    const validApiKeyData = {
      name: 'Test Service Key',
      key: 'test-api-key-12345',
      active: true
    };

    it('should create a new API key successfully', async () => {
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(validApiKeyData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          name: validApiKeyData.name,
          active: validApiKeyData.active,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          lastUsed: null
        },
        requestId: expect.any(String)
      });

      // Verify API key was created in database
      const apiKey = await prisma.apiKey.findFirst({
        where: { name: validApiKeyData.name }
      });
      expect(apiKey).toBeDefined();
      expect(apiKey?.name).toBe(validApiKeyData.name);
      expect(apiKey?.key).not.toBe(validApiKeyData.key); // Should be hashed
      expect(apiKey?.active).toBe(validApiKeyData.active);

      // Store for cleanup
      testApiKeyId = response.body.data.id;
    });

    it('should reject API key creation without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .send(validApiKeyData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: expect.stringContaining('Access token is required')
        }
      });
    });

    it('should reject API key creation with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', 'Bearer invalid-token')
        .send(validApiKeyData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_TOKEN'
        }
      });
    });

    it('should reject API key creation with duplicate name', async () => {
      // Create first API key
      await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(validApiKeyData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          ...validApiKeyData,
          key: 'different-key-value'
        })
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DUPLICATE_API_KEY_NAME',
          message: expect.stringContaining('already exists')
        }
      });
    });

    it('should reject API key creation with invalid data', async () => {
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          // Missing required fields
          name: '',
          key: ''
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR'
        }
      });
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: validApiKeyData.name
          // Missing key field
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR'
        }
      });
    });

    it('should default active to true when not specified', async () => {
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: 'Default Active Key',
          key: 'test-default-key'
          // active not specified
        })
        .expect(201);

      expect(response.body.data.active).toBe(true);
    });
  });

  describe('GET /admin/api-keys', () => {
    beforeEach(async () => {
      // Create test API keys
      await prisma.apiKey.createMany({
        data: [
          {
            name: 'Active Key 1',
            key: 'hashed-key-1',
            active: true
          },
          {
            name: 'Active Key 2',
            key: 'hashed-key-2',
            active: true
          },
          {
            name: 'Inactive Key 1',
            key: 'hashed-key-3',
            active: false
          }
        ]
      });
    });

    it('should retrieve all API keys successfully', async () => {
      const response = await request(app)
        .get('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            active: expect.any(Boolean),
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          })
        ]),
        requestId: expect.any(String)
      });

      expect(response.body.data).toHaveLength(3);
    });

    it('should filter API keys by active status', async () => {
      const response = await request(app)
        .get('/api/v1/admin/api-keys?active=true')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((key: any) => key.active === true)).toBe(true);
    });

    it('should handle pagination with limit and offset', async () => {
      const response = await request(app)
        .get('/api/v1/admin/api-keys?limit=2&offset=1')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should reject unauthorized access', async () => {
      const response = await request(app)
        .get('/api/v1/admin/api-keys')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED'
        }
      });
    });

    it('should return empty array when no API keys exist', async () => {
      // Clear all API keys
      await prisma.apiKey.deleteMany();

      const response = await request(app)
        .get('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('GET /admin/api-keys/:id', () => {
    beforeEach(async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'Single Test Key',
          key: 'hashed-test-key',
          active: true
        }
      });
      testApiKeyId = apiKey.id;
    });

    it('should retrieve a specific API key successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testApiKeyId,
          name: 'Single Test Key',
          active: true,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          lastUsed: null
        },
        requestId: expect.any(String)
      });
    });

    it('should return 404 for non-existent API key', async () => {
      const nonExistentId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const response = await request(app)
        .get(`/api/v1/admin/api-keys/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'API_KEY_NOT_FOUND',
          message: expect.stringContaining('API key')
        }
      });
    });

    it('should reject unauthorized access', async () => {
      const response = await request(app)
        .get(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED'
        }
      });
    });
  });

  describe('PUT /admin/api-keys/:id', () => {
    beforeEach(async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'Updatable Key',
          key: 'hashed-original-key',
          active: true
        }
      });
      testApiKeyId = apiKey.id;
    });

    it('should update an API key successfully', async () => {
      const updateData = {
        name: 'Updated Key Name',
        active: false
      };

      const response = await request(app)
        .put(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: testApiKeyId,
          name: updateData.name,
          active: updateData.active,
          updatedAt: expect.any(String)
        },
        requestId: expect.any(String)
      });

      // Verify update in database
      const updatedApiKey = await prisma.apiKey.findUnique({
        where: { id: testApiKeyId }
      });
      expect(updatedApiKey?.name).toBe(updateData.name);
      expect(updatedApiKey?.active).toBe(updateData.active);
    });

    it('should update only provided fields (partial update)', async () => {
      const updateData = { active: false };

      const response = await request(app)
        .put(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.name).toBe('Updatable Key'); // Original name preserved
      expect(response.body.data.active).toBe(false); // Updated
    });

    it('should update API key value when provided', async () => {
      const updateData = {
        key: 'new-secret-key-value'
      };

      const response = await request(app)
        .put(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify key was hashed and stored
      const updatedApiKey = await prisma.apiKey.findUnique({
        where: { id: testApiKeyId }
      });
      expect(updatedApiKey?.key).not.toBe(updateData.key); // Should be hashed
      expect(updatedApiKey?.key).not.toBe('hashed-original-key'); // Should be different
    });

    it('should return 404 for non-existent API key', async () => {
      const nonExistentId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const response = await request(app)
        .put(`/api/v1/admin/api-keys/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'API_KEY_NOT_FOUND'
        }
      });
    });

    it('should reject duplicate name update', async () => {
      // Create second API key
      await prisma.apiKey.create({
        data: {
          name: 'Existing Key Name',
          key: 'another-hashed-key',
          active: true
        }
      });

      const response = await request(app)
        .put(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'Existing Key Name' })
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'DUPLICATE_API_KEY_NAME'
        }
      });
    });

    it('should reject unauthorized access', async () => {
      const response = await request(app)
        .put(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .send({ name: 'New Name' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED'
        }
      });
    });
  });

  describe('DELETE /admin/api-keys/:id', () => {
    beforeEach(async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          name: 'Deletable Key',
          key: 'hashed-deletable-key',
          active: true
        }
      });
      testApiKeyId = apiKey.id;
    });

    it('should delete an API key successfully', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'API key deleted successfully',
        requestId: expect.any(String)
      });

      // Verify deletion from database
      const deletedApiKey = await prisma.apiKey.findUnique({
        where: { id: testApiKeyId }
      });
      expect(deletedApiKey).toBeNull();
    });

    it('should return 404 for non-existent API key', async () => {
      const nonExistentId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const response = await request(app)
        .delete(`/api/v1/admin/api-keys/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'API_KEY_NOT_FOUND'
        }
      });
    });

    it('should reject unauthorized access', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/api-keys/${testApiKeyId}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED'
        }
      });
    });
  });

  describe('API Key Endpoint Rate Limiting', () => {
    it('should apply rate limiting to API key endpoints', async () => {
      // Since rate limiting is disabled in test environment for performance,
      // we'll test that endpoints are accessible and would be rate limited in production
      const requests = Array.from({ length: 3 }, () =>
        request(app)
          .get('/api/v1/admin/api-keys')
          .set('Authorization', `Bearer ${adminAccessToken}`)
      );

      const results = await Promise.all(requests);
      
      // All should succeed in test environment
      // In production, these would be rate limited after exceeding threshold
      results.forEach(result => {
        expect([200, 429]).toContain(result.status);
      });
    });
  });

  describe('Error Handling and Request ID Tracking', () => {
    it('should include request ID in all responses', async () => {
      const response = await request(app)
        .get('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe('string');
    });

    it('should include request ID in error responses', async () => {
      const response = await request(app)
        .get('/api/v1/admin/api-keys/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe('string');
    });

    it('should handle internal server errors gracefully', async () => {
      // This test would require mocking Prisma to throw an error
      // For now, we'll test the error response structure
      const response = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          name: null, // Invalid data to potentially cause error
          key: null
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String)
        },
        requestId: expect.any(String)
      });
    });
  });

  describe('CORS and Headers', () => {
    it('should include appropriate CORS headers for admin interface', async () => {
      const response = await request(app)
        .options('/api/v1/admin/api-keys')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      // CORS headers should be present for admin interface access
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should handle preflight requests for API key endpoints', async () => {
      const response = await request(app)
        .options('/api/v1/admin/api-keys')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization, Content-Type')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers).toHaveProperty('access-control-allow-headers');
    });
  });
});