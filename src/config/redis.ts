import { config } from './environment';

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

// Real Redis implementation (to be implemented when Redis is fully integrated)
class RealRedis implements RedisClient {
  async setex(key: string, ttl: number, value: string): Promise<string> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }

  async get(key: string): Promise<string | null> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }

  async del(key: string): Promise<number> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }

  async keys(pattern: string): Promise<string[]> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }

  async exists(key: string): Promise<number> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }

  async expire(key: string, ttl: number): Promise<number> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }

  async ttl(key: string): Promise<number> {
    // TODO: Implement real Redis connection
    throw new Error('Real Redis implementation not yet available. Use REDIS_URL environment variable to configure.');
  }
}

/**
 * Creates Redis client based on configuration
 * For now, uses mock implementation. Will be replaced with real Redis client in Task 4.
 */
function createRedisClient(): RedisClient {
  // In test environment or when Redis URL is not configured, use mock
  if (config.app.isTest || !config.redis.url) {
    return new MockRedis();
  }
  
  // For production, would use real Redis client
  return new RealRedis();
}

// Export Redis client instance
export const redis = createRedisClient();

// Export types for use in other modules
export type { RedisClient };