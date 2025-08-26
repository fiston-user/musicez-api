import { config } from './environment';
import Redis from 'ioredis';

// Redis client interface for dependency injection and testing
export interface RedisClient {
  setex(key: string, ttl: number, value: string): Promise<string>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  exists(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  ttl(key: string): Promise<number>;
  quit?(): Promise<void>;
}

// Mock Redis implementation for testing
class MockRedis implements RedisClient {
  private data = new Map<string, string>();

  async setex(key: string, ttl: number, value: string): Promise<string> {
    this.data.set(key, value);
    
    // Simulate TTL by removing key after specified time
    setTimeout(() => {
      this.data.delete(key);
    }, ttl * 1000);
    
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    this.data.delete(key);
    return existed ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const keys = Array.from(this.data.keys());
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return keys.filter(key => regex.test(key));
    }
    return keys.filter(key => key === pattern);
  }

  async exists(key: string): Promise<number> {
    return this.data.has(key) ? 1 : 0;
  }

  async expire(key: string, ttl: number): Promise<number> {
    if (this.data.has(key)) {
      // Simulate expiration by removing key after TTL
      setTimeout(() => {
        this.data.delete(key);
      }, ttl * 1000);
      return 1;
    }
    return 0;
  }

  async ttl(key: string): Promise<number> {
    // For mock implementation, return positive TTL if key exists, -2 if not exists
    return this.data.has(key) ? 3600 : -2;
  }
}

// Real Redis implementation using ioredis
class RealRedis implements RedisClient {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // Handle connection events
    this.client.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    this.client.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
    });
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    const result = await this.client.setex(key, ttl, value);
    return result;
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async exists(key: string): Promise<number> {
    return await this.client.exists(key);
  }

  async expire(key: string, ttl: number): Promise<number> {
    return await this.client.expire(key, ttl);
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Creates Redis client based on configuration
 * Uses real Redis client when URL is configured, otherwise falls back to mock for testing
 */
function createRedisClient(): RedisClient {
  // In test environment or when Redis URL is not configured, use mock
  if (config.app.isTest || !config.redis.url) {
    console.log('📝 Using Mock Redis client for testing/development');
    return new MockRedis();
  }
  
  // Use real Redis client when URL is configured
  console.log('🔗 Connecting to Redis at:', config.redis.url);
  return new RealRedis(config.redis.url);
}

// Export Redis client instance
export const redis = createRedisClient();

// Health check for Redis connection
export async function checkRedisHealth() {
  try {
    const startTime = Date.now();
    await redis.setex('health_check', 10, 'ok');
    const result = await redis.get('health_check');
    await redis.del('health_check');
    const latency = Date.now() - startTime;
    
    return {
      connected: result === 'ok',
      latency,
    };
  } catch (error) {
    return {
      connected: false,
      latency: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Graceful shutdown for Redis
export async function disconnectRedis() {
  try {
    if (redis.quit) {
      await redis.quit();
      console.log('Redis disconnected gracefully');
    }
  } catch (error) {
    console.error('Error disconnecting Redis:', error);
  }
}