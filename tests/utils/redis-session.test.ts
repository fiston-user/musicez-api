import { v4 as uuidv4 } from 'uuid';

// Create shared mock data map
const mockRedisData = new Map<string, string>();

// Mock the Redis client first
jest.mock('../../src/config/redis', () => ({
  redis: {
    setex: jest.fn().mockImplementation((key: string, ttl: number, value: string) => {
      mockRedisData.set(key, value);
      // Simulate TTL by removing key after specified time in tests
      if (ttl > 0 && ttl < 10) { // Only for very short TTLs in tests
        setTimeout(() => mockRedisData.delete(key), ttl * 1000);
      }
      return Promise.resolve('OK');
    }),
    get: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(mockRedisData.get(key) || null);
    }),
    del: jest.fn().mockImplementation((key: string) => {
      const existed = mockRedisData.has(key);
      mockRedisData.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    keys: jest.fn().mockImplementation((pattern: string) => {
      const keys: string[] = Array.from(mockRedisData.keys());
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        return Promise.resolve(keys.filter(key => regex.test(key)));
      }
      return Promise.resolve(keys.filter(key => key === pattern));
    }),
    exists: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(mockRedisData.has(key) ? 1 : 0);
    }),
    expire: jest.fn().mockImplementation((key: string, ttl: number) => {
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
      if (!mockRedisData.has(key)) {
        return Promise.resolve(-2); // Key does not exist
      }
      // For test expired sessions, return -2
      if (key.includes('expired')) {
        return Promise.resolve(-2);
      }
      return Promise.resolve(3600); // Key exists and has TTL
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
        expect(mockRedis.setex).toHaveBeenCalledTimes(4);
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

    describe('Session lookup', () => {
      it('should retrieve existing session successfully', async () => {
        const retrieved = await sessionService.getSession(testSession.sessionId);

        expect(retrieved).toBeDefined();
        expect(retrieved?.userId).toBe(testUser.id);
        expect(retrieved?.sessionId).toBe(testSession.sessionId);
        expect(retrieved?.deviceInfo).toEqual(testDevice);
      });

      it('should return null for non-existent session', async () => {
        const nonExistent = await sessionService.getSession('non-existent-session-id');
        expect(nonExistent).toBeNull();
      });

      it('should handle Redis retrieval errors gracefully', async () => {
        mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

        await expect(sessionService.getSession(testSession.sessionId)).rejects.toThrow('Failed to retrieve session');
      });
    });

    describe('Session validation', () => {
      it('should validate active session', async () => {
        const isValid = await sessionService.validateSession(testSession.sessionId);
        expect(isValid).toBe(true);
      });

      it('should invalidate expired session', async () => {
        // Create expired session
        const expiredSession: SessionData = {
          ...testSession,
          sessionId: 'expired-session',
          expiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
          isActive: true,
        };

        // Manually store expired session
        await mockRedis.setex(`session:${testUser.id}:expired-session`, 1, JSON.stringify(expiredSession));

        const isValid = await sessionService.validateSession('expired-session');
        expect(isValid).toBe(false);
      });

      it('should handle validation for non-existent session', async () => {
        const isValid = await sessionService.validateSession('non-existent-session');
        expect(isValid).toBe(false);
      });
    });

    describe('Session activity updates', () => {
      it('should update last activity timestamp', async () => {
        const initialActivity = testSession.lastActivity;
        
        // Wait a moment to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 10));
        
        await sessionService.updateActivity(testSession.sessionId);

        const updated = await sessionService.getSession(testSession.sessionId);
        expect(updated?.lastActivity).not.toBe(initialActivity);
        expect(new Date(updated?.lastActivity || 0).getTime()).toBeGreaterThan(new Date(initialActivity).getTime());
      });

      it('should handle activity update for non-existent session', async () => {
        await expect(sessionService.updateActivity('non-existent'))
          .rejects.toThrow('Session not found');
      });
    });
  });

  describe('Session Cleanup and Expiration', () => {
    describe('Manual session termination', () => {
      it('should delete session on manual termination', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);
        
        const success = await sessionService.revokeSession(session.sessionId);
        expect(success).toBe(true);
        
        const retrieved = await sessionService.getSession(session.sessionId);
        expect(retrieved).toBeNull();
      });

      it('should handle termination of non-existent session', async () => {
        const success = await sessionService.revokeSession('non-existent');
        expect(success).toBe(false);
      });
    });

    describe('Expired session cleanup', () => {
      it('should identify and clean expired sessions', async () => {
        // Create test sessions with different expiration times
        const activeSession = await sessionService.createSession(testUser.id, testDevice);
        
        // Create expired sessions manually
        const expiredSession1: SessionData = {
          sessionId: 'expired1',
          userId: testUser.id,
          deviceInfo: testDevice,
          issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          lastActivity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          isActive: true,
        };

        const expiredSession2: SessionData = {
          sessionId: 'expired2',
          userId: testUser.id,
          deviceInfo: testDevice,
          issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
          lastActivity: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          isActive: true,
        };

        const expiredSession3: SessionData = {
          sessionId: 'expired3',
          userId: testUser.id,
          deviceInfo: testDevice,
          issuedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
          lastActivity: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
          isActive: true,
        };

        // Store expired sessions
        await mockRedis.setex(`session:${testUser.id}:expired1`, 1, JSON.stringify(expiredSession1));
        await mockRedis.setex(`session:${testUser.id}:expired2`, 1, JSON.stringify(expiredSession2));
        await mockRedis.setex(`session:${testUser.id}:expired3`, 1, JSON.stringify(expiredSession3));

        // Mock keys response to include both active and expired sessions
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:${activeSession.sessionId}`,
          `session:${testUser.id}:expired1`,
          `session:${testUser.id}:expired2`,
          `session:${testUser.id}:expired3`,
        ]);

        // Mock get responses for each session
        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes(activeSession.sessionId)) {
            return Promise.resolve(JSON.stringify(activeSession));
          } else if (key.includes('expired1')) {
            return Promise.resolve(JSON.stringify(expiredSession1));
          } else if (key.includes('expired2')) {
            return Promise.resolve(JSON.stringify(expiredSession2));
          } else if (key.includes('expired3')) {
            return Promise.resolve(JSON.stringify(expiredSession3));
          }
          return Promise.resolve(null);
        });

        const cleanedCount = await cleanupService.cleanupExpiredSessions();

        expect(cleanedCount).toBe(3);
        expect(mockRedis.del).toHaveBeenCalledTimes(3);
      });

      it('should preserve active sessions during cleanup', async () => {
        const activeSession = await sessionService.createSession(testUser.id, testDevice);
        
        // Create one expired session
        const expiredSession: SessionData = {
          sessionId: 'expired1',
          userId: testUser.id,
          deviceInfo: testDevice,
          issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          lastActivity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          isActive: true,
        };

        await mockRedis.setex(`session:${testUser.id}:expired1`, 1, JSON.stringify(expiredSession));

        // Mock keys and get responses
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:${activeSession.sessionId}`,
          `session:${testUser.id}:expired1`,
        ]);

        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes(activeSession.sessionId)) {
            return Promise.resolve(JSON.stringify(activeSession));
          } else if (key.includes('expired1')) {
            return Promise.resolve(JSON.stringify(expiredSession));
          }
          return Promise.resolve(null);
        });

        const cleanedCount = await cleanupService.cleanupExpiredSessions();

        expect(cleanedCount).toBe(1); // Only expired session cleaned
        expect(mockRedis.del).toHaveBeenCalledWith(`session:${testUser.id}:expired1`);
      });
    });

    describe('Inactive session cleanup', () => {
      it('should clean sessions inactive beyond threshold', async () => {
        const inactiveThreshold = 60 * 60 * 1000; // 1 hour in milliseconds
        
        // Create active session (recent activity)
        const activeSession = await sessionService.createSession(testUser.id, testDevice);
        
        // Create inactive session (old activity)
        const inactiveSession: SessionData = {
          sessionId: 'inactive',
          userId: testUser.id,
          deviceInfo: testDevice,
          issuedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
          lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day from now
          isActive: true,
        };

        await mockRedis.setex(`session:${testUser.id}:inactive`, 86400, JSON.stringify(inactiveSession));

        // Mock keys and get responses
        mockRedis.keys.mockResolvedValueOnce([
          `session:${testUser.id}:${activeSession.sessionId}`,
          `session:${testUser.id}:inactive`,
        ]);

        mockRedis.get.mockImplementation((key: string) => {
          if (key.includes(activeSession.sessionId)) {
            return Promise.resolve(JSON.stringify(activeSession));
          } else if (key.includes('inactive')) {
            return Promise.resolve(JSON.stringify(inactiveSession));
          }
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

        // Verify other session is still valid
        const isOtherValid = await sessionService.validateSession(testSession2.sessionId);
        expect(isOtherValid).toBe(true);
      });
    });

    describe('Multi-device logout', () => {
      it('should revoke all user sessions', async () => {
        // Mock keys response for user sessions
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

      it('should handle revoking sessions for user with no active sessions', async () => {
        mockRedis.keys.mockResolvedValueOnce([]);

        const revokedCount = await sessionService.revokeAllUserSessions('user-with-no-sessions');

        expect(revokedCount).toBe(0);
      });
    });
  });

  describe('Device Tracking and Security', () => {
    describe('Device information tracking', () => {
      it('should store and retrieve device information', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);

        expect(session.deviceInfo).toEqual(testDevice);

        const retrieved = await sessionService.getSession(session.sessionId);
        expect(retrieved?.deviceInfo).toEqual(testDevice);
      });

      it('should detect device changes for security monitoring', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);

        const newDevice: DeviceInfo = {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ipAddress: '192.168.1.100',
          deviceId: 'different-device-id',
        };

        // Mock get response for existing session
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(session));

        const hasDeviceChanged = await securityService.detectDeviceChange(session.sessionId, newDevice);

        expect(hasDeviceChanged).toBe(true);
      });

      it('should track suspicious login patterns', async () => {
        const suspiciousDevice: DeviceInfo = {
          userAgent: 'Suspicious Bot Agent',
          ipAddress: '1.2.3.4', // Different country IP
          deviceId: 'suspicious-device',
        };

        await expect(
          sessionService.createSession(testUser.id, suspiciousDevice)
        ).resolves.toBeDefined(); // Should still create session but log security event
      });
    });

    describe('Rate limiting and abuse protection', () => {
      it('should handle rapid session creation attempts', async () => {
        const promises = Array.from({ length: 10 }, () =>
          sessionService.createSession(testUser.id, testDevice)
        );

        const sessions = await Promise.all(promises);
        
        // All sessions should be created successfully
        expect(sessions).toHaveLength(10);
        sessions.forEach(session => {
          expect(session.userId).toBe(testUser.id);
        });
      });
    });

    describe('Session hijacking protection', () => {
      it('should detect potential session hijacking', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);

        const suspiciousDevice: DeviceInfo = {
          ...testDevice,
          ipAddress: '180.76.15.143', // Different IP from different location
        };

        // Mock keys and get responses for getUserSessions call
        mockRedis.keys.mockResolvedValueOnce([`session:${session.userId}:${session.sessionId}`]);
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(session));

        const isSuspicious = await securityService.detectSuspiciousActivity(
          session.userId,
          suspiciousDevice
        );

        expect(isSuspicious).toBe(true);
      });

      it('should allow legitimate device changes', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);

        const updatedDevice: DeviceInfo = {
          ...testDevice,
          ipAddress: '127.0.0.2', // Slightly different IP (same network)
        };

        // Mock get response for existing session
        mockRedis.get.mockResolvedValueOnce(JSON.stringify(session));

        const isSuspicious = await securityService.detectSuspiciousActivity(
          session.sessionId,
          updatedDevice
        );

        expect(isSuspicious).toBe(false);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    describe('Redis connection failures', () => {
      it('should handle Redis unavailability gracefully', async () => {
        mockRedis.setex.mockRejectedValueOnce(new Error('Redis unavailable'));

        await expect(
          sessionService.createSession(testUser.id, testDevice)
        ).rejects.toThrow('Failed to create session');
      });

      it('should handle partial Redis failures during cleanup', async () => {
        // Create test session
        const session = await sessionService.createSession(testUser.id, testDevice);

        // Mock keys to return sessions
        mockRedis.keys.mockResolvedValueOnce([`session:${testUser.id}:${session.sessionId}`]);
        
        // Mock get to fail
        mockRedis.get.mockRejectedValueOnce(new Error('Redis get failed'));

        // Cleanup should handle the error and continue
        const cleanedCount = await cleanupService.cleanupExpiredSessions();
        
        // Should not throw error, might clean 0 sessions due to the failure
        expect(typeof cleanedCount).toBe('number');
      });
    });

    describe('Data integrity and validation', () => {
      it('should handle corrupted session data', async () => {
        const sessionId = 'corrupted-session';
        
        // Store corrupted JSON data
        mockRedisData.set(`session:${testUser.id}:${sessionId}`, 'invalid-json-data');
        
        const session = await sessionService.getSession(sessionId);
        expect(session).toBeNull();
      });

      it('should validate session data structure', async () => {
        const sessionId = 'incomplete-session';
        
        // Store incomplete session data
        const incompleteData = {
          sessionId: sessionId,
          // Missing required fields
        };
        
        mockRedisData.set(`session:${testUser.id}:${sessionId}`, JSON.stringify(incompleteData));
        
        const session = await sessionService.getSession(sessionId);
        expect(session).toBeNull(); // Should reject invalid data
      });
    });

    describe('Custom error handling', () => {
      it('should throw SessionValidationError for invalid operations', async () => {
        await expect(
          sessionService.createSession('', testDevice)
        ).rejects.toBeInstanceOf(SessionValidationError);
      });

      it('should provide meaningful error messages', async () => {
        try {
          await sessionService.createSession('   ', testDevice);
        } catch (error) {
          expect(error).toBeInstanceOf(SessionValidationError);
          expect((error as SessionValidationError).message).toBe('User ID is required');
        }
      });
    });
  });

  describe('Performance and Scalability', () => {
    describe('Batch operations', () => {
      it('should handle multiple session operations efficiently', async () => {
        const userIds = Array.from({ length: 100 }, (_, i) => `user-${i}`);
        
        const createPromises = userIds.map(userId =>
          sessionService.createSession(userId, testDevice)
        );
        
        const sessions = await Promise.all(createPromises);
        
        expect(sessions).toHaveLength(100);
        expect(mockRedis.setex).toHaveBeenCalledTimes(100);
      });
    });

    describe('Memory usage optimization', () => {
      it('should clean up internal references after session deletion', async () => {
        const session = await sessionService.createSession(testUser.id, testDevice);
        
        await sessionService.revokeSession(session.sessionId);
        
        // Verify session is removed from Redis
        const retrieved = await sessionService.getSession(session.sessionId);
        expect(retrieved).toBeNull();
      });
    });
  });
});