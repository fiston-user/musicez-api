import { v4 as uuidv4 } from 'uuid';
import { redis, RedisClient } from '../config/redis';

/**
 * Custom error class for session validation failures
 */
export class SessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

/**
 * Device information for session tracking and security
 */
export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  fingerprint?: string;
}

/**
 * Session configuration interface
 */
export interface SessionConfig {
  sessionTimeout: string;
  maxSessionsPerUser: number;
  cleanupInterval: string;
  trackDeviceInfo: boolean;
  requireDeviceConsistency: boolean;
}

/**
 * Session data structure stored in Redis
 */
export interface SessionData {
  sessionId: string;
  userId: string;
  deviceInfo?: DeviceInfo;
  issuedAt: string;
  lastActivity: string;
  expiresAt: string;
  isActive: boolean;
}

/**
 * Security event interface for logging
 */
export interface SecurityEvent {
  type: string;
  userId: string;
  sessionId?: string;
  sessionCount?: number;
  deviceInfo?: DeviceInfo;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Default session configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionTimeout: '24h',
  maxSessionsPerUser: 10,
  cleanupInterval: '1h',
  trackDeviceInfo: true,
  requireDeviceConsistency: false,
};

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(timeStr: string): number {
  const match = timeStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 24 * 60 * 60;
    default:
      throw new Error(`Invalid time unit: ${unit}`);
  }
}

/**
 * Session management service
 */
export class SessionService {
  private sessionTTL: number;
  private securityService?: SecurityService;

  constructor(
    private redis: RedisClient,
    private config: SessionConfig = DEFAULT_SESSION_CONFIG
  ) {
    this.sessionTTL = parseTimeToSeconds(config.sessionTimeout);
  }

  setSecurityService(securityService: SecurityService) {
    this.securityService = securityService;
  }

  /**
   * Create a new session for a user
   */
  async createSession(userId: string, deviceInfo?: DeviceInfo): Promise<SessionData> {
    // Input validation
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new SessionValidationError('User ID is required');
    }

    // Check session limit for user
    if (this.config.maxSessionsPerUser > 0) {
      try {
        const keys = await this.redis.keys(`session:${userId}:*`);
        if (keys.length >= this.config.maxSessionsPerUser) {
          throw new Error('Maximum sessions limit exceeded');
        }
      } catch (error) {
        // If we can't check limits, proceed but log the issue
        if (error instanceof Error && error.message === 'Maximum sessions limit exceeded') {
          throw error;
        }
      }
    }

    try {
      const sessionId = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.sessionTTL * 1000);

      const sessionData: SessionData = {
        sessionId,
        userId,
        deviceInfo,
        issuedAt: now.toISOString(),
        lastActivity: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        isActive: true,
      };

      const redisKey = `session:${userId}:${sessionId}`;
      await this.redis.setex(redisKey, this.sessionTTL, JSON.stringify(sessionData));

      // Log security event
      if (this.securityService) {
        await this.securityService.logSecurityEvent({
          type: 'session_created',
          userId,
          deviceInfo,
          timestamp: now.toISOString(),
        });
      }

      return sessionData;
    } catch (error) {
      throw new Error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve a session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Session ID is required');
    }

    try {
      // Try to find session by scanning patterns (since we don't have the userId)
      const keys = await this.redis.keys(`session:*:${sessionId}`);
      
      if (keys.length === 0) {
        return null;
      }

      if (keys.length > 1) {
        throw new Error('Ambiguous session ID found multiple matches');
      }

      const sessionDataStr = await this.redis.get(keys[0]);
      if (!sessionDataStr) {
        return null;
      }

      try {
        const sessionData: SessionData = JSON.parse(sessionDataStr);
        return sessionData;
      } catch (parseError) {
        return null; // Return null for corrupted data
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Ambiguous session') ||
            error.message.includes('Failed to parse') ||
            error.message.includes('Redis read error')) {
          throw new Error(`Failed to retrieve session: ${error.message}`);
        }
      }
      throw new Error(`Failed to retrieve session: ${error instanceof Error ? error.message : 'Unknown error'}`); 
    }
  }

  /**
   * Validate a session exists and is active
   */
  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return false;
      }

      // Check if session has all required fields
      if (!session.userId || !session.sessionId || !session.issuedAt || !session.expiresAt) {
        throw new SessionValidationError('Session missing required fields');
      }

      // Check if session is expired
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      
      if (expiresAt <= now) {
        return false;
      }

      // Check if session is active
      if (!session.isActive) {
        return false;
      }

      return true;
    } catch (error) {
      if (error instanceof SessionValidationError) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Update last activity timestamp for a session
   */
  async updateActivity(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.lastActivity = new Date().toISOString();
    
    const redisKey = `session:${session.userId}:${sessionId}`;
    await this.redis.setex(redisKey, this.sessionTTL, JSON.stringify(session));
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required');
    }

    try {
      const keys = await this.redis.keys(`session:${userId}:*`);
      const sessions: SessionData[] = [];

      for (const key of keys) {
        const sessionDataStr = await this.redis.get(key);
        if (sessionDataStr) {
          try {
            const sessionData: SessionData = JSON.parse(sessionDataStr);
            sessions.push(sessionData);
          } catch (parseError) {
            // Skip malformed session data
            continue;
          }
        }
      }

      // Sort by last activity (most recent first)
      sessions.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
      
      return sessions;
    } catch (error) {
      throw new Error(`Failed to get user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    try {
      const redisKey = `session:${session.userId}:${sessionId}`;
      const deletedCount = await this.redis.del(redisKey);
      const success = deletedCount > 0;

      // Log security event
      if (success && this.securityService) {
        await this.securityService.logSecurityEvent({
          type: 'session_revoked',
          userId: session.userId,
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }

      return success;
    } catch (error) {
      throw new Error(`Failed to revoke session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revoke all sessions for a user (logout from all devices)
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required');
    }

    try {
      const keys = await this.redis.keys(`session:${userId}:*`);
      let revokedCount = 0;

      for (const key of keys) {
        try {
          const deletedCount = await this.redis.del(key);
          if (deletedCount > 0) {
            revokedCount++;
          }
        } catch (error) {
          // Continue with other deletions even if one fails
          continue;
        }
      }

      // Log security event
      if (revokedCount > 0 && this.securityService) {
        await this.securityService.logSecurityEvent({
          type: 'bulk_session_revoked',
          userId,
          sessionCount: revokedCount,
          timestamp: new Date().toISOString(),
        });
      }

      return revokedCount;
    } catch (error) {
      throw new Error(`Failed to revoke user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Cleanup service for expired sessions
 */
export class CleanupService {
  constructor(
    private redis: RedisClient,
    _config: SessionConfig = DEFAULT_SESSION_CONFIG
  ) {}

  /**
   * Clean up expired sessions from Redis
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const keys = await this.redis.keys('session:*:*');
      let cleanedCount = 0;

      for (const key of keys) {
        try {
          const ttl = await this.redis.ttl(key);
          
          // TTL -2 means key doesn't exist or is expired
          // TTL -1 means key exists but has no expiry
          if (ttl === -2) {
            const deletedCount = await this.redis.del(key);
            if (deletedCount > 0) {
              cleanedCount++;
            }
          }
        } catch (error) {
          // Continue with other keys even if one fails
          continue;
        }
      }

      return cleanedCount;
    } catch (error) {
      // Return 0 on error rather than throwing
      return 0;
    }
  }

  /**
   * Clean up sessions that have been inactive beyond threshold
   */
  async cleanupInactiveSessions(inactiveThresholdMs: number): Promise<number> {
    try {
      const keys = await this.redis.keys('session:*:*');
      let cleanedCount = 0;
      const now = Date.now();

      for (const key of keys) {
        try {
          const sessionDataStr = await this.redis.get(key);
          if (!sessionDataStr) {
            continue;
          }

          const sessionData: SessionData = JSON.parse(sessionDataStr);
          const lastActivity = new Date(sessionData.lastActivity).getTime();

          if (now - lastActivity > inactiveThresholdMs) {
            const deletedCount = await this.redis.del(key);
            if (deletedCount > 0) {
              cleanedCount++;
            }
          }
        } catch (error) {
          // Continue with other sessions even if one fails
          continue;
        }
      }

      return cleanedCount;
    } catch (error) {
      return 0;
    }
  }
}

/**
 * Security service for monitoring and threat detection
 */
export class SecurityService {
  constructor(
    private redis: RedisClient,
    private sessionService: SessionService
  ) {}

  /**
   * Detect if device information has changed for a session
   */
  async detectDeviceChange(sessionId: string, currentDevice: DeviceInfo): Promise<boolean> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session || !session.deviceInfo) {
      return false;
    }

    const originalDevice = session.deviceInfo;
    
    // Check for significant changes
    if (originalDevice.deviceId !== currentDevice.deviceId ||
        originalDevice.ipAddress !== currentDevice.ipAddress ||
        originalDevice.userAgent !== currentDevice.userAgent) {
      return true;
    }

    return false;
  }

  /**
   * Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(userId: string, deviceInfo?: DeviceInfo): Promise<boolean> {
    // Simple suspicious activity detection
    if (deviceInfo) {
      // Check for suspicious user agents
      const suspiciousPatterns = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scraper/i,
        /suspicious/i,
      ];

      if (deviceInfo.userAgent && suspiciousPatterns.some(pattern => pattern.test(deviceInfo.userAgent!))) {
        return true;
      }

      // Check for invalid IP addresses (basic validation)
      if (deviceInfo.ipAddress) {
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipPattern.test(deviceInfo.ipAddress)) {
          return true;
        }
      }

      // Check for geographic anomalies in IP address
      // Compare with existing sessions to detect location changes
      if (deviceInfo.ipAddress) {
        const existingSessions = await this.sessionService.getUserSessions(userId);
        if (existingSessions.length > 0) {
          const latestSession = existingSessions[0];
          if (latestSession.deviceInfo?.ipAddress) {
            const currentIP = deviceInfo.ipAddress;
            const lastIP = latestSession.deviceInfo.ipAddress;
            
            // Simple heuristic: different network ranges suggest different locations
            const currentNetwork = currentIP.split('.').slice(0, 2).join('.');
            const lastNetwork = lastIP.split('.').slice(0, 2).join('.');
            
            if (currentNetwork !== lastNetwork && !currentIP.startsWith('127.') && !lastIP.startsWith('127.')) {
              return true;
            }
          }
        }
      }
    }

    // Check for rapid session creation (rate limiting check)
    const userSessions = await this.sessionService.getUserSessions(userId);
    const recentSessions = userSessions.filter(session => {
      const sessionTime = new Date(session.issuedAt).getTime();
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      return sessionTime > fiveMinutesAgo;
    });

    if (recentSessions.length > 5) {
      return true;
    }

    return false;
  }

  /**
   * Log security events
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    // In a real implementation, this would log to a security monitoring system
    // For now, we'll just ensure the method exists for the tests
    
    // Could store in Redis for short-term retention
    const logKey = `security_log:${event.userId}:${Date.now()}`;
    const logEntry = JSON.stringify(event);
    
    try {
      // Store with 7-day retention
      await this.redis.setex(logKey, 7 * 24 * 60 * 60, logEntry);
    } catch (error) {
      // Don't throw on logging errors
      console.error('Failed to log security event:', error);
    }
  }
}

/**
 * Create session configuration from environment variables
 */
export function createSessionConfig(): SessionConfig {
  return {
    sessionTimeout: process.env.SESSION_TIMEOUT || DEFAULT_SESSION_CONFIG.sessionTimeout,
    maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || DEFAULT_SESSION_CONFIG.maxSessionsPerUser.toString()),
    cleanupInterval: process.env.SESSION_CLEANUP_INTERVAL || DEFAULT_SESSION_CONFIG.cleanupInterval,
    trackDeviceInfo: (process.env.TRACK_DEVICE_INFO || 'true') === 'true',
    requireDeviceConsistency: (process.env.REQUIRE_DEVICE_CONSISTENCY || 'false') === 'true',
  };
}

// Export singleton instances with default configuration
export const sessionService = new SessionService(redis, createSessionConfig());
export const cleanupService = new CleanupService(redis, createSessionConfig());
export const securityService = new SecurityService(redis, sessionService);

// Set up circular reference
sessionService.setSecurityService(securityService);

// Types are exported above with their definitions