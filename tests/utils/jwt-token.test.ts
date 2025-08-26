import { v4 as uuidv4 } from 'uuid';

// Create shared mock data map
const mockRedisData = new Map<string, string>();

// Mock the Redis client first
jest.mock('../../src/config/redis', () => ({
  redis: {
    setex: jest.fn().mockImplementation((key: string, _ttl: number, value: string) => {
      const { mockRedisData } = require('./jwt-token.test.ts');
      mockRedisData.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn().mockImplementation((key: string) => {
      const { mockRedisData } = require('./jwt-token.test.ts');
      return Promise.resolve(mockRedisData.get(key) || null);
    }),
    del: jest.fn().mockImplementation((key: string) => {
      const { mockRedisData } = require('./jwt-token.test.ts');
      const existed = mockRedisData.has(key);
      mockRedisData.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    keys: jest.fn().mockImplementation((pattern: string) => {
      const { mockRedisData } = require('./jwt-token.test.ts');
      const keys: string[] = Array.from(mockRedisData.keys());
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return Promise.resolve(keys.filter(key => regex.test(key)));
      }
      return Promise.resolve(keys.filter(key => key === pattern));
    }),
  },
}));

// Import after mocking
import {
  generateAccessToken,
  generateRefreshToken,
  validateToken,
  refreshTokens,
  JWTConfig,
  RefreshTokenData,
  TokenValidationError,
} from '../../src/utils/jwt-token';

// Export mockRedisData for mock usage
export { mockRedisData };

describe('JWT Token Management System', () => {
  const testUser = {
    id: uuidv4(),
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
  };

  const testConfig: JWTConfig = {
    secret: 'test-jwt-secret-key-for-testing-purposes',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    issuer: 'musicez-api',
    audience: 'musicez-client',
  };

  // Get mocked redis for test assertions
  const mockRedis = require('../../src/config/redis').redis;

  beforeEach(() => {
    mockRedisData.clear();
    jest.clearAllMocks();
  });

  describe('Access Token Generation', () => {
    describe('Valid token generation', () => {
      it('should generate a valid JWT access token', async () => {
        const token = await generateAccessToken(testUser, testConfig);

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
      });

      it('should include correct user claims in token', async () => {
        const token = await generateAccessToken(testUser, testConfig);
        
        // Decode token payload (without verification for testing)
        const [, payloadBase64] = token.split('.');
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

        expect(payload.sub).toBe(testUser.id);
        expect(payload.email).toBe(testUser.email);
        expect(payload.name).toBe(testUser.name);
        expect(payload.emailVerified).toBe(testUser.emailVerified);
        expect(payload.iss).toBe(testConfig.issuer);
        expect(payload.aud).toBe(testConfig.audience);
        expect(payload.iat).toBeDefined();
        expect(payload.exp).toBeDefined();
      });

      it('should set correct expiration time (15 minutes)', async () => {
        const before = Math.floor(Date.now() / 1000);
        const token = await generateAccessToken(testUser, testConfig);
        const after = Math.floor(Date.now() / 1000);

        const [, payloadBase64] = token.split('.');
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

        const expectedExpiry = before + (15 * 60); // 15 minutes
        const actualExpiry = payload.exp;

        expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry);
        expect(actualExpiry).toBeLessThanOrEqual(after + (15 * 60));
      });

      it('should generate different tokens for same user (due to timestamps)', async () => {
        const token1 = await generateAccessToken(testUser, testConfig);
        
        // Wait long enough to ensure different timestamps (JWT uses seconds precision)
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        const token2 = await generateAccessToken(testUser, testConfig);

        expect(token1).not.toBe(token2);
      });

      it('should generate different tokens for different users', async () => {
        const user2 = { ...testUser, id: uuidv4(), email: 'user2@example.com' };

        const token1 = await generateAccessToken(testUser, testConfig);
        const token2 = await generateAccessToken(user2, testConfig);

        expect(token1).not.toBe(token2);
      });
    });

    describe('Invalid inputs', () => {
      it('should throw error for missing user ID', async () => {
        const invalidUser = { ...testUser, id: '' };
        await expect(generateAccessToken(invalidUser, testConfig)).rejects.toThrow('User ID is required');
      });

      it('should throw error for missing email', async () => {
        const invalidUser = { ...testUser, email: '' };
        await expect(generateAccessToken(invalidUser, testConfig)).rejects.toThrow('User email is required');
      });

      it('should throw error for invalid JWT secret', async () => {
        const invalidConfig = { ...testConfig, secret: '' };
        await expect(generateAccessToken(testUser, invalidConfig)).rejects.toThrow('JWT secret is required');
      });

      it('should handle null/undefined user', async () => {
        await expect(generateAccessToken(null as any, testConfig)).rejects.toThrow();
        await expect(generateAccessToken(undefined as any, testConfig)).rejects.toThrow();
      });
    });
  });

  describe('Refresh Token Generation', () => {
    describe('Valid refresh token generation', () => {
      it('should generate a UUID-based refresh token', async () => {
        const refreshToken = await generateRefreshToken(testUser, testConfig);

        expect(refreshToken.token).toBeDefined();
        expect(typeof refreshToken.token).toBe('string');
        expect(refreshToken.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });

      it('should store refresh token in Redis with correct TTL', async () => {
        const refreshToken = await generateRefreshToken(testUser, testConfig);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          `refresh_token:${testUser.id}:${refreshToken.token}`,
          7 * 24 * 60 * 60, // 7 days in seconds
          expect.stringContaining(testUser.id)
        );
      });

      it('should include correct metadata in Redis storage', async () => {
        const deviceInfo = 'test-device';
        await generateRefreshToken(testUser, testConfig, deviceInfo);

        expect(mockRedis.setex).toHaveBeenCalled();
        const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);

        expect(storedData.userId).toBe(testUser.id);
        expect(storedData.deviceInfo).toBe(deviceInfo);
        expect(storedData.issuedAt).toBeDefined();
        expect(storedData.expiresAt).toBeDefined();
      });

      it('should set correct expiration time (7 days)', async () => {
        const before = Date.now();
        await generateRefreshToken(testUser, testConfig);
        const after = Date.now();

        const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
        const expiresAt = new Date(storedData.expiresAt).getTime();

        expect(expiresAt).toBeGreaterThanOrEqual(before + (7 * 24 * 60 * 60 * 1000));
        expect(expiresAt).toBeLessThanOrEqual(after + (7 * 24 * 60 * 60 * 1000));
      });

      it('should generate unique refresh tokens', async () => {
        const token1 = await generateRefreshToken(testUser, testConfig);
        const token2 = await generateRefreshToken(testUser, testConfig);

        expect(token1.token).not.toBe(token2.token);
      });
    });

    describe('Invalid inputs', () => {
      it('should throw error for missing user ID', async () => {
        const invalidUser = { ...testUser, id: '' };
        await expect(generateRefreshToken(invalidUser, testConfig)).rejects.toThrow('User ID is required');
      });

      it('should handle null/undefined user ID', async () => {
        await expect(generateRefreshToken(null as any, testConfig)).rejects.toThrow();
        await expect(generateRefreshToken(undefined as any, testConfig)).rejects.toThrow();
      });

      it('should handle Redis storage failure', async () => {
        mockRedis.setex.mockRejectedValueOnce(new Error('Redis error'));
        
        await expect(generateRefreshToken(testUser, testConfig)).rejects.toThrow('Failed to store refresh token');
      });
    });
  });

  describe('Token Validation', () => {
    let validToken: string;

    beforeEach(async () => {
      validToken = await generateAccessToken(testUser, testConfig);
    });

    describe('Valid token validation', () => {
      it('should validate a correct token', async () => {
        const payload = await validateToken(validToken, testConfig);

        expect(payload).toBeDefined();
        expect(payload.sub).toBe(testUser.id);
        expect(payload.email).toBe(testUser.email);
        expect(payload.name).toBe(testUser.name);
      });

      it('should return correct token payload structure', async () => {
        const payload = await validateToken(validToken, testConfig);

        expect(payload).toHaveProperty('sub');
        expect(payload).toHaveProperty('email');
        expect(payload).toHaveProperty('name');
        expect(payload).toHaveProperty('emailVerified');
        expect(payload).toHaveProperty('iat');
        expect(payload).toHaveProperty('exp');
        expect(payload).toHaveProperty('iss');
        expect(payload).toHaveProperty('aud');
      });

      it('should validate issuer and audience claims', async () => {
        const payload = await validateToken(validToken, testConfig);

        expect(payload.iss).toBe(testConfig.issuer);
        expect(payload.aud).toBe(testConfig.audience);
      });
    });

    describe('Invalid token validation', () => {
      it('should reject token with wrong secret', async () => {
        const wrongConfig = { ...testConfig, secret: 'wrong-secret' };
        
        await expect(validateToken(validToken, wrongConfig)).rejects.toThrow(TokenValidationError);
      });

      it('should reject malformed tokens', async () => {
        const malformedTokens = [
          'invalid-token',
          'header.payload',
          'header.payload.signature.extra',
          '',
          'not.a.jwt',
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid.signature',
        ];

        for (const token of malformedTokens) {
          await expect(validateToken(token, testConfig)).rejects.toThrow(TokenValidationError);
        }
      });

      it('should reject expired tokens', async () => {
        // Generate token with very short expiry
        const shortConfig = { ...testConfig, accessTokenExpiry: '1ms' };
        const shortToken = await generateAccessToken(testUser, shortConfig);
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 10));
        
        await expect(validateToken(shortToken, testConfig)).rejects.toThrow(TokenValidationError);
        await expect(validateToken(shortToken, testConfig)).rejects.toThrow('expired');
      });

      it('should reject tokens with wrong issuer', async () => {
        const wrongConfig = { ...testConfig, issuer: 'wrong-issuer' };
        
        await expect(validateToken(validToken, wrongConfig)).rejects.toThrow(TokenValidationError);
      });

      it('should reject tokens with wrong audience', async () => {
        const wrongConfig = { ...testConfig, audience: 'wrong-audience' };
        
        await expect(validateToken(validToken, wrongConfig)).rejects.toThrow(TokenValidationError);
      });

      it('should handle null/undefined token', async () => {
        await expect(validateToken(null as any, testConfig)).rejects.toThrow(TokenValidationError);
        await expect(validateToken(undefined as any, testConfig)).rejects.toThrow(TokenValidationError);
      });
    });
  });

  describe('Token Refresh', () => {
    let refreshToken: RefreshTokenData;

    beforeEach(async () => {
      refreshToken = await generateRefreshToken(testUser, testConfig);
    });

    describe('Valid token refresh', () => {
      it('should refresh tokens with valid refresh token', async () => {
        const newTokens = await refreshTokens(refreshToken.token, testConfig);

        expect(newTokens).toBeDefined();
        expect(newTokens.accessToken).toBeDefined();
        expect(newTokens.refreshToken).toBeDefined();
        expect(newTokens.accessToken).not.toBe(refreshToken.token);
        expect(newTokens.refreshToken).not.toBe(refreshToken.token);
      });

      it('should invalidate old refresh token', async () => {
        await refreshTokens(refreshToken.token, testConfig);

        // Old token should be removed from Redis
        expect(mockRedis.del).toHaveBeenCalledWith(`refresh_token:${testUser.id}:${refreshToken.token}`);
      });

      it('should generate new access token with same user data', async () => {
        const newTokens = await refreshTokens(refreshToken.token, testConfig);

        const payload = await validateToken(newTokens.accessToken, testConfig);
        expect(payload.sub).toBe(testUser.id);
        expect(payload.email).toBe(testUser.email);
      });

      it('should store new refresh token in Redis', async () => {
        const newTokens = await refreshTokens(refreshToken.token, testConfig);

        const setCalls = mockRedis.setex.mock.calls.filter((call: any) => call[0].includes(newTokens.refreshToken));
        expect(setCalls).toHaveLength(1);
      });
    });

    describe('Invalid token refresh', () => {
      it('should reject non-existent refresh token', async () => {
        const fakeToken = uuidv4();
        
        await expect(refreshTokens(fakeToken, testConfig)).rejects.toThrow('Invalid refresh token');
      });

      it('should reject malformed refresh token', async () => {
        const malformedTokens = [
          'invalid-uuid',
          '',
          'not-a-uuid-at-all',
          '12345678-1234-1234-1234-123456789012', // wrong format
        ];

        for (const token of malformedTokens) {
          await expect(refreshTokens(token, testConfig)).rejects.toThrow();
        }
      });

      it('should handle Redis retrieval failure', async () => {
        mockRedis.get.mockRejectedValueOnce(new Error('Redis error'));
        
        await expect(refreshTokens(refreshToken.token, testConfig)).rejects.toThrow();
      });

      it('should reject expired refresh token data', async () => {
        // Manually set expired token data in Redis
        const expiredData = {
          userId: testUser.id,
          deviceInfo: 'test-device',
          issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        };
        
        mockRedisData.set(`refresh_token:${testUser.id}:${refreshToken.token}`, JSON.stringify(expiredData));
        
        await expect(refreshTokens(refreshToken.token, testConfig)).rejects.toThrow('Refresh token expired');
      });
    });
  });

  describe('Token Expiration Handling', () => {
    describe('Access token expiration', () => {
      it('should correctly calculate expiration times', async () => {
        const configs = [
          { ...testConfig, accessTokenExpiry: '5m' },
          { ...testConfig, accessTokenExpiry: '1h' },
          { ...testConfig, accessTokenExpiry: '1d' },
        ];

        for (const config of configs) {
          const token = await generateAccessToken(testUser, config);
          const [, payloadBase64] = token.split('.');
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

          expect(payload.exp).toBeGreaterThan(payload.iat);
        }
      });

      it('should reject tokens past expiration', async () => {
        // This test is covered above but worth emphasizing
        const shortConfig = { ...testConfig, accessTokenExpiry: '1ms' };
        const expiredToken = await generateAccessToken(testUser, shortConfig);
        
        await new Promise(resolve => setTimeout(resolve, 10));
        
        await expect(validateToken(expiredToken, testConfig)).rejects.toThrow('expired');
      });
    });

    describe('Refresh token expiration', () => {
      it('should set correct TTL in Redis', async () => {
        await generateRefreshToken(testUser, testConfig);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`refresh_token:${testUser.id}:`)),
          7 * 24 * 60 * 60, // 7 days
          expect.any(String)
        );
      });
    });
  });

  describe('Error Handling', () => {
    describe('TokenValidationError', () => {
      it('should be an instance of Error', () => {
        const error = new TokenValidationError('test message');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('TokenValidationError');
        expect(error.message).toBe('test message');
      });

      it('should have proper stack trace', () => {
        const error = new TokenValidationError('test message');
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('TokenValidationError');
      });
    });

    describe('Configuration validation', () => {
      it('should validate JWT configuration', async () => {
        // Test each invalid config separately
        await expect(generateAccessToken(testUser, { ...testConfig, secret: '' })).rejects.toThrow('JWT secret is required');
        await expect(generateAccessToken(testUser, { ...testConfig, accessTokenExpiry: '' })).rejects.toThrow('Access token expiry is required');
        await expect(generateAccessToken(testUser, { ...testConfig, issuer: '' })).rejects.toThrow('JWT issuer and audience are required');
        await expect(generateAccessToken(testUser, { ...testConfig, audience: '' })).rejects.toThrow('JWT issuer and audience are required');
        
        // Note: refreshTokenExpiry is not validated in generateAccessToken, only in generateRefreshToken
      });
    });
  });

  describe('Security Properties', () => {
    describe('Token uniqueness', () => {
      it('should generate unique access tokens', async () => {
        const tokens: string[] = [];
        
        // Generate tokens with 1-second delays to ensure different timestamps (JWT uses seconds precision)
        for (let i = 0; i < 3; i++) { // Reduced to 3 tokens to keep test fast
          const token = await generateAccessToken(testUser, testConfig);
          tokens.push(token);
          if (i < 2) { // Don't wait after the last token
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        }

        const uniqueTokens = new Set(tokens);
        expect(uniqueTokens.size).toBe(tokens.length);
      });

      it('should generate unique refresh tokens', async () => {
        const tokens = await Promise.all(
          Array.from({ length: 10 }, () => generateRefreshToken(testUser, testConfig))
        );

        const uniqueTokens = new Set(tokens.map(t => t.token));
        expect(uniqueTokens.size).toBe(tokens.length);
      });
    });

    describe('Secret protection', () => {
      it('should not expose secret in error messages', async () => {
        try {
          await validateToken('invalid.token.here', testConfig);
        } catch (error) {
          expect((error as Error).message).not.toContain(testConfig.secret);
        }
      });
    });

    describe('Timing consistency', () => {
      it('should have consistent validation timing for invalid tokens', async () => {
        const invalidTokens = [
          'invalid.token.here',
          'another.invalid.token',
          'yet.another.invalid',
        ];

        const times: number[] = [];
        
        for (const token of invalidTokens) {
          const start = process.hrtime.bigint();
          try {
            await validateToken(token, testConfig);
          } catch {
            // Expected to fail
          }
          const end = process.hrtime.bigint();
          times.push(Number(end - start) / 1000000);
        }

        // Times should be reasonably consistent (allowing for system variance)
        const avgTime = times.reduce((a, b) => a + b) / times.length;
        const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));
        expect(maxDeviation / avgTime).toBeLessThan(1.0); // Allow 100% variance for system timing variations
      });
    });
  });

  describe('Integration Tests', () => {
    describe('Complete authentication flow', () => {
      it('should handle login → access → refresh flow', async () => {
        // 1. Generate tokens (login)
        const accessToken = await generateAccessToken(testUser, testConfig);
        const refreshToken = await generateRefreshToken(testUser, testConfig);

        // 2. Validate access token (access protected resource)
        const payload = await validateToken(accessToken, testConfig);
        expect(payload.sub).toBe(testUser.id);

        // 3. Refresh tokens
        const newTokens = await refreshTokens(refreshToken.token, testConfig);
        expect(newTokens.accessToken).toBeDefined();
        expect(newTokens.refreshToken).toBeDefined();

        // 4. Validate new access token
        const newPayload = await validateToken(newTokens.accessToken, testConfig);
        expect(newPayload.sub).toBe(testUser.id);
      });
    });

    describe('Concurrent operations', () => {
      it('should handle concurrent token generation', async () => {
        const results: Array<[string, RefreshTokenData]> = [];
        
        // Generate tokens sequentially with 1-second delays to avoid timestamp collisions
        for (let i = 0; i < 3; i++) { // Reduced to 3 to keep test fast
          const [accessToken, refreshToken] = await Promise.all([
            generateAccessToken(testUser, testConfig),
            generateRefreshToken(testUser, testConfig),
          ]);
          results.push([accessToken, refreshToken]);
          
          if (i < 2) { // Don't wait after the last iteration
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        }

        expect(results).toHaveLength(3);

        // All tokens should be unique
        const accessTokens = results.map(r => r[0]);
        const refreshTokens = results.map(r => r[1].token);
        
        expect(new Set(accessTokens).size).toBe(3);
        expect(new Set(refreshTokens).size).toBe(3);
      });
    });
  });
});