import { v4 as uuidv4 } from 'uuid';

// Create shared mock data map
const mockRedisData = new Map<string, string>();

// Mock the Redis client first
jest.mock('../../src/config/redis', () => ({
  redis: {
    setex: jest.fn().mockImplementation((key: string, ttl: number, value: string) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      mockRedisData.set(key, value);
      // Simulate TTL by removing key after specified time in tests
      if (ttl > 0 && ttl < 10) { // Only for very short TTLs in tests
        setTimeout(() => mockRedisData.delete(key), ttl * 1000);
      }
      return Promise.resolve('OK');
    }),
    get: jest.fn().mockImplementation((key: string) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      return Promise.resolve(mockRedisData.get(key) || null);
    }),
    del: jest.fn().mockImplementation((key: string) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      const existed = mockRedisData.has(key);
      mockRedisData.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    keys: jest.fn().mockImplementation((pattern: string) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      const keys: string[] = Array.from(mockRedisData.keys());
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        return Promise.resolve(keys.filter(key => regex.test(key)));
      }
      return Promise.resolve(keys.filter(key => key === pattern));
    }),
    exists: jest.fn().mockImplementation((key: string) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      return Promise.resolve(mockRedisData.has(key) ? 1 : 0);
    }),
    expire: jest.fn().mockImplementation((key: string, ttl: number) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      if (mockRedisData.has(key)) {
        // Simulate expiration for test TTLs
        if (ttl > 0 && ttl < 10) {
          setTimeout(() => mockRedisData.delete(key), ttl * 1000);
        }
        return Promise.resolve(1);
      }
      return Promise.resolve(0);
    }),
    ttl: jest.fn().mockImplementation((key: string) => {
      const { mockRedisData } = require('./redis-session.test.ts');
      return Promise.resolve(mockRedisData.has(key) ? 3600 : -2);
    }),
  },
}));

// Import after mocking
import {
  SessionService,
  SessionData,
  DeviceInfo,
  SessionConfig,
  CleanupService,
  SecurityService,
  SessionValidationError,
} from '../../src/utils/redis-session';

// Export mockRedisData for mock usage
export { mockRedisData };

describe('Redis Session Management System', () => {
  let sessionService: SessionService;
  let cleanupService: CleanupService;
  let securityService: SecurityService;

  const testUser = {
    id: uuidv4(),
    email: 'test@example.com',
    name: 'Test User',
  };

  const testConfig: SessionConfig = {
    sessionTimeout: '24h',
    maxSessionsPerUser: 5,
    cleanupInterval: '1h',
    trackDeviceInfo: true,
    requireDeviceConsistency: false,
  };

  const testDevice: DeviceInfo = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    ipAddress: '127.0.0.1',
    deviceId: 'test-device-id',
  };

  // Get mocked redis for test assertions
  const mockRedis = require('../../src/config/redis').redis;

  beforeEach(() => {
    mockRedisData.clear();
    jest.clearAllMocks();
    sessionService = new SessionService(mockRedis, testConfig);
    cleanupService = new CleanupService(mockRedis, testConfig);
    securityService = new SecurityService(mockRedis, sessionService);
    
    // Set up circular reference for logging
    sessionService.setSecurityService(securityService);
  });

  describe('Session Creation and Storage', () => {
    describe('Valid session creation', () => {
      it('should create a new session with correct Redis key pattern', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);

        expect(session).toBeDefined();
        expect(session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(session.userId).toBe(testUser.id);
        expect(session.deviceInfo).toEqual(testDevice);

        // Verify Redis storage with correct key pattern
        expect(mockRedis.setex).toHaveBeenCalledWith(
          `session:${testUser.id}:${session.sessionId}`,
          expect.any(Number), // TTL
          expect.stringContaining(testUser.id)
        );
      });

      it('should store session with correct TTL (24 hours)', async () => {
        await sessionService.createSession(testUser.id, testDevice);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.any(String),
          24 * 60 * 60, // 24 hours in seconds
          expect.any(String)
        );
      });

      it('should include comprehensive session metadata', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);

        expect(session.issuedAt).toBeDefined();
        expect(session.lastActivity).toBeDefined();
        expect(session.expiresAt).toBeDefined();
        expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());

        // Verify stored data structure
        const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
        expect(storedData.userId).toBe(testUser.id);
        expect(storedData.deviceInfo).toEqual(testDevice);
        expect(storedData.isActive).toBe(true);
      });

      it('should create multiple unique sessions for same user', async () => {
        const session1 = await sessionService.createSession(testUser.id, testDevice);
        const session2 = await sessionService.createSession(testUser.id, testDevice);

        expect(session1.sessionId).not.toBe(session2.sessionId);
        expect(mockRedis.setex).toHaveBeenCalledTimes(2);
      });

      it('should handle sessions without device info', async () => {
        const session = await sessionService.createSession(testUser.id);

        expect(session.deviceInfo).toBeUndefined();
        expect(session.userId).toBe(testUser.id);
        expect(mockRedis.setex).toHaveBeenCalled();
      });
    });

    describe('Session creation validation', () => {
      it('should throw error for invalid user ID', async () => {
        await expect(sessionService.createSession('', testDevice)).rejects.toThrow('User ID is required');
        await expect(sessionService.createSession(' ', testDevice)).rejects.toThrow('User ID is required');
      });

      it('should handle Redis storage failures', async () => {
        mockRedis.setex.mockRejectedValueOnce(new Error('Redis connection failed'));

        await expect(sessionService.createSession(testUser.id, testDevice)).rejects.toThrow('Failed to create session');
      });

      it('should enforce maximum sessions per user limit', async () => {
        const limitedConfig = { ...testConfig, maxSessionsPerUser: 2 };
        const limitedService = new SessionService(mockRedis, limitedConfig);

        // Create maximum allowed sessions
        await limitedService.createSession(testUser.id, testDevice);
        await limitedService.createSession(testUser.id, testDevice);

        // Mock Redis keys response for existing sessions
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:session1`,
          `session:${testUser.id}:session2`,
        ]);

        await expect(limitedService.createSession(testUser.id, testDevice)).rejects.toThrow('Maximum sessions limit exceeded');
      });
    });
  });

  describe('Session Retrieval and Validation', () => {
    let testSession: SessionData;

    beforeEach(async () => {
      testSession = await sessionService.createSession(testUser.id, testDevice);
    });

    describe('Valid session retrieval', () => {
      it('should retrieve existing session by ID', async () => {
        const retrieved = await sessionService.getSession(testSession.sessionId);

        expect(retrieved).toBeDefined();
        expect(retrieved!.sessionId).toBe(testSession.sessionId);
        expect(retrieved!.userId).toBe(testUser.id);
        expect(retrieved!.deviceInfo).toEqual(testDevice);
      });

      it('should validate session is active and not expired', async () => {
        const isValid = await sessionService.validateSession(testSession.sessionId);

        expect(isValid).toBe(true);
        expect(mockRedis.get).toHaveBeenCalledWith(`session:${testUser.id}:${testSession.sessionId}`);
      });

      it('should update last activity timestamp', async () => {
        const originalActivity = testSession.lastActivity;
        
        // Wait a small amount to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));
        
        await sessionService.updateActivity(testSession.sessionId);

        const updated = await sessionService.getSession(testSession.sessionId);
        expect(updated!.lastActivity).not.toBe(originalActivity);
      });

      it('should retrieve all sessions for a user', async () => {
        // Create additional sessions
        await sessionService.createSession(testUser.id, testDevice);
        await sessionService.createSession(testUser.id, testDevice);

        const userSessions = await sessionService.getUserSessions(testUser.id);

        expect(userSessions).toHaveLength(3);
        expect(userSessions.every(s => s.userId === testUser.id)).toBe(true);
      });
    });

    describe('Invalid session handling', () => {
      it('should return null for non-existent session', async () => {
        const nonExistentId = uuidv4();
        const result = await sessionService.getSession(nonExistentId);

        expect(result).toBeNull();
      });

      it('should return false for validation of non-existent session', async () => {
        const nonExistentId = uuidv4();
        const isValid = await sessionService.validateSession(nonExistentId);

        expect(isValid).toBe(false);
      });

      it('should handle expired sessions', async () => {
        // Create session with very short TTL
        const shortConfig = { ...testConfig, sessionTimeout: '1s' };
        const shortService = new SessionService(mockRedis, shortConfig);
        const shortSession = await shortService.createSession(testUser.id, testDevice);

        // Mock Redis to return null (expired)
        mockRedis.get.mockResolvedValueOnce(null);

        const result = await shortService.getSession(shortSession.sessionId);
        expect(result).toBeNull();
      });

      it('should handle corrupted session data', async () => {
        // Mock Redis to return invalid JSON
        mockRedis.get.mockResolvedValueOnce('invalid-json');

        await expect(sessionService.getSession(testSession.sessionId)).rejects.toThrow('Failed to parse session data');
      });

      it('should validate session format and required fields', async () => {
        // Mock incomplete session data
        const incompleteData = {
          userId: testUser.id,
          // Missing required fields
        };
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(incompleteData));

        await expect(sessionService.validateSession(testSession.sessionId)).rejects.toThrow(SessionValidationError);
      });
    });
  });

  describe('Session Cleanup and Expiration', () => {
    beforeEach(async () => {
      // Create multiple test sessions
      await sessionService.createSession(testUser.id, testDevice);
      await sessionService.createSession(testUser.id, testDevice);
      await sessionService.createSession('user2', testDevice);
    });

    describe('Expired session cleanup', () => {
      it('should identify and clean expired sessions', async () => {
        // Mock Redis to return expired sessions
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:expired1`,
          `session:${testUser.id}:expired2`,
          `session:user2:expired3`,
        ]);

        // Mock TTL to return -2 (expired) for all sessions
        mockRedis.ttl.mockResolvedValue(-2);

        const cleanedCount = await cleanupService.cleanupExpiredSessions();

        expect(cleanedCount).toBe(3);
        expect(mockRedis.del).toHaveBeenCalledTimes(3);
      });

      it('should preserve active sessions during cleanup', async () => {
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:active1`,
          `session:${testUser.id}:expired1`,
        ]);

        // Mock TTL responses: active session has positive TTL, expired has -2
        mockRedis.ttl.mockImplementation((key: string) => {
          if (key.includes('active')) return Promise.resolve(3600);
          if (key.includes('expired')) return Promise.resolve(-2);
          return Promise.resolve(-2);
        });

        const cleanedCount = await cleanupService.cleanupExpiredSessions();

        expect(cleanedCount).toBe(1); // Only expired session cleaned
        expect(mockRedis.del).toHaveBeenCalledWith(`session:${testUser.id}:expired1`);
      });

      it('should handle cleanup errors gracefully', async () => {
        mockRedis.keys.mockRejectedValueOnce(new Error('Redis error'));

        const cleanedCount = await cleanupService.cleanupExpiredSessions();

        expect(cleanedCount).toBe(0);
        // Should not throw error, should handle gracefully
      });
    });

    describe('Inactive session cleanup', () => {
      it('should clean sessions inactive beyond threshold', async () => {
        const inactiveThreshold = 60 * 60 * 1000; // 1 hour
        const now = Date.now();

        // Mock sessions with different activity times
        const activeSession = {
          sessionId: 'active',
          userId: testUser.id,
          lastActivity: new Date(now - 30 * 60 * 1000).toISOString(), // 30 min ago
          isActive: true,
        };

        const inactiveSession = {
          sessionId: 'inactive',
          userId: testUser.id,
          lastActivity: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          isActive: true,
        };

        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:active`,
          `session:${testUser.id}:inactive`,
        ]);

        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes('active')) return Promise.resolve(JSON.stringify(activeSession));
          if (key.includes('inactive')) return Promise.resolve(JSON.stringify(inactiveSession));
          return Promise.resolve(null);
        });

        const cleanedCount = await cleanupService.cleanupInactiveSessions(inactiveThreshold);

        expect(cleanedCount).toBe(1);
        expect(mockRedis.del).toHaveBeenCalledWith(`session:${testUser.id}:inactive`);
      });
    });
  });

  describe('Token Revocation and Logout', () => {
    let testSession1: SessionData;
    let testSession2: SessionData;

    beforeEach(async () => {
      testSession1 = await sessionService.createSession(testUser.id, testDevice);
      testSession2 = await sessionService.createSession(testUser.id, testDevice);
    });

    describe('Single session logout', () => {
      it('should revoke specific session', async () => {
        const success = await sessionService.revokeSession(testSession1.sessionId);

        expect(success).toBe(true);
        expect(mockRedis.del).toHaveBeenCalledWith(`session:${testUser.id}:${testSession1.sessionId}`);

        // Verify session is no longer valid
        const isValid = await sessionService.validateSession(testSession1.sessionId);
        expect(isValid).toBe(false);
      });

      it('should return false for non-existent session revocation', async () => {
        const nonExistentId = uuidv4();
        mockRedis.del.mockResolvedValueOnce(0); // Redis del returns 0 for non-existent key

        const success = await sessionService.revokeSession(nonExistentId);

        expect(success).toBe(false);
      });
    });

    describe('Multi-device logout', () => {
      it('should revoke all user sessions', async () => {
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:${testSession1.sessionId}`,
          `session:${testUser.id}:${testSession2.sessionId}`,
        ]);

        const revokedCount = await sessionService.revokeAllUserSessions(testUser.id);

        expect(revokedCount).toBe(2);
        expect(mockRedis.del).toHaveBeenCalledTimes(2);
        expect(mockRedis.del).toHaveBeenCalledWith(`session:${testUser.id}:${testSession1.sessionId}`);
        expect(mockRedis.del).toHaveBeenCalledWith(`session:${testUser.id}:${testSession2.sessionId}`);
      });

      it('should handle user with no sessions', async () => {
        mockRedis.keys.mockResolvedValueOnce([]);

        const revokedCount = await sessionService.revokeAllUserSessions('nonexistent-user');

        expect(revokedCount).toBe(0);
        expect(mockRedis.del).not.toHaveBeenCalled();
      });

      it('should handle Redis errors during bulk revocation', async () => {
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:${testSession1.sessionId}`,
          `session:${testUser.id}:${testSession2.sessionId}`,
        ]);

        mockRedis.del.mockResolvedValueOnce(1); // First deletion succeeds
        mockRedis.del.mockRejectedValueOnce(new Error('Redis error')); // Second fails

        const revokedCount = await sessionService.revokeAllUserSessions(testUser.id);

        expect(revokedCount).toBe(1); // Only successful deletions counted
      });
    });
  });

  describe('Device Tracking and Security', () => {
    describe('Device information tracking', () => {
      it('should track device fingerprint data', async () => {
        const detailedDevice: DeviceInfo = {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)',
          ipAddress: '192.168.1.100',
          deviceId: 'mobile-device-123',
          fingerprint: 'screen:390x844,timezone:America/New_York,lang:en-US',
        };

        const session = await sessionService.createSession(testUser.id, detailedDevice);

        expect(session.deviceInfo).toEqual(detailedDevice);

        const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
        expect(storedData.deviceInfo).toEqual(detailedDevice);
      });

      it('should detect device changes for security monitoring', async () => {
        const originalDevice = { ...testDevice, deviceId: 'original-device' };
        const newDevice = { ...testDevice, deviceId: 'new-device', ipAddress: '192.168.1.200' };

        const session = await sessionService.createSession(testUser.id, originalDevice);

        const hasDeviceChanged = await securityService.detectDeviceChange(session.sessionId, newDevice);

        expect(hasDeviceChanged).toBe(true);
      });

      it('should track suspicious login patterns', async () => {
        const suspiciousDevice: DeviceInfo = {
          userAgent: 'SuspiciousBot/1.0',
          ipAddress: '123.456.789.0', // Invalid IP format
          deviceId: 'bot-device',
        };

        const isSuspicious = await securityService.detectSuspiciousActivity(testUser.id, suspiciousDevice);

        expect(isSuspicious).toBe(true);
      });
    });

    describe('Security event logging', () => {
      it('should log session creation events', async () => {
        const logSpy = jest.spyOn(securityService, 'logSecurityEvent');

        await sessionService.createSession(testUser.id, testDevice);

        expect(logSpy).toHaveBeenCalledWith({
          type: 'session_created',
          userId: testUser.id,
          deviceInfo: testDevice,
          timestamp: expect.any(String),
        });
      });

      it('should log session revocation events', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);
        const logSpy = jest.spyOn(securityService, 'logSecurityEvent');

        await sessionService.revokeSession(session.sessionId);

        expect(logSpy).toHaveBeenCalledWith({
          type: 'session_revoked',
          userId: testUser.id,
          sessionId: session.sessionId,
          timestamp: expect.any(String),
        });
      });

      it('should log bulk revocation events', async () => {
        await sessionService.createSession(testUser.id, testDevice);
        await sessionService.createSession(testUser.id, testDevice);
        const logSpy = jest.spyOn(securityService, 'logSecurityEvent');

        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:session1`,
          `session:${testUser.id}:session2`,
        ]);

        await sessionService.revokeAllUserSessions(testUser.id);

        expect(logSpy).toHaveBeenCalledWith({
          type: 'bulk_session_revoked',
          userId: testUser.id,
          sessionCount: 2,
          timestamp: expect.any(String),
        });
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    describe('SessionValidationError', () => {
      it('should be an instance of Error', () => {
        const error = new SessionValidationError('test message');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('SessionValidationError');
        expect(error.message).toBe('test message');
      });

      it('should have proper stack trace', () => {
        const error = new SessionValidationError('test message');
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('SessionValidationError');
      });
    });

    describe('Redis connection failures', () => {
      it('should handle Redis connection failures gracefully', async () => {
        mockRedis.setex.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(sessionService.createSession(testUser.id, testDevice)).rejects.toThrow('Failed to create session');
      });

      it('should handle Redis read failures', async () => {
        mockRedis.get.mockRejectedValueOnce(new Error('Redis read error'));

        await expect(sessionService.getSession('any-id')).rejects.toThrow('Failed to retrieve session');
      });
    });

    describe('Concurrent operations', () => {
      it('should handle concurrent session operations safely', async () => {
        const promises = Array.from({ length: 5 }, (_, i) =>
          sessionService.createSession(`user-${i}`, testDevice)
        );

        const sessions = await Promise.all(promises);

        expect(sessions).toHaveLength(5);
        expect(new Set(sessions.map(s => s.sessionId)).size).toBe(5); // All unique
        expect(mockRedis.setex).toHaveBeenCalledTimes(5);
      });
    });
  });

  describe('Performance and Scalability', () => {
    describe('Batch operations', () => {
      it('should handle large-scale cleanup operations efficiently', async () => {
        // Mock large number of sessions
        const sessionKeys = Array.from({ length: 1000 }, (_, i) => `session:user${i}:session${i}`);
        mockRedis.keys.mockResolvedValueOnce(sessionKeys);
        mockRedis.ttl.mockResolvedValue(-2); // All expired

        const cleanedCount = await cleanupService.cleanupExpiredSessions();

        expect(cleanedCount).toBe(1000);
        expect(mockRedis.del).toHaveBeenCalledTimes(1000);
      });

      it('should process cleanup in reasonable time', async () => {
        const start = Date.now();
        
        // Mock moderate number of sessions
        const sessionKeys = Array.from({ length: 100 }, (_, i) => `session:user${i}:session${i}`);
        mockRedis.keys.mockResolvedValueOnce(sessionKeys);
        mockRedis.ttl.mockResolvedValue(-2);

        await cleanupService.cleanupExpiredSessions();

        const duration = Date.now() - start;
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
      });
    });

    describe('Memory efficiency', () => {
      it('should not leak memory during session operations', async () => {
        const initialMemory = process.memoryUsage();

        // Create and clean many sessions
        for (let i = 0; i < 100; i++) {
          await sessionService.createSession(`user-${i}`, testDevice);
          await sessionService.revokeSession(`session-${i}`);
        }

        const finalMemory = process.memoryUsage();
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

        // Memory increase should be reasonable (less than 10MB for 100 operations)
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      });
    });
  });
});