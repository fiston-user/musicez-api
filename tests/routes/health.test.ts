import request from 'supertest';
import { Application } from 'express';
import createApp from '../../src/app';
import { PrismaClient } from '@prisma/client';

describe('Health Check Endpoint', () => {
  let app: Application;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = createApp();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /health', () => {
    it('should return healthy status when all systems are operational', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service', 'musicez-api');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('redis');
    });

    it('should return database connection status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.database).toHaveProperty('connected');
      expect(response.body.database).toHaveProperty('latency');
      expect(response.body.database.connected).toBe(true);
      expect(response.body.database.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return redis connection status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.redis).toHaveProperty('connected');
      expect(response.body.redis).toHaveProperty('latency');
      // Redis might not be configured in test environment
      expect(typeof response.body.redis.connected).toBe('boolean');
    });

    it('should return correct service name', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.service).toBe('musicez-api');
    });

    it('should return valid timestamp in ISO format', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('should return uptime in seconds', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle database connection errors gracefully', async () => {
      // Note: In production, this would return 503 if database is truly down
      // For now, we're testing that the endpoint doesn't crash
      const response = await request(app).get('/health');

      // Should still return a response
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(['healthy', 'unhealthy']).toContain(response.body.status);
    });

    it('should respond quickly (under 1000ms)', async () => {
      const startTime = Date.now();
      await request(app).get('/health');
      const responseTime = Date.now() - startTime;

      expect(responseTime).toBeLessThan(1000);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should be accessible without authentication', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      // Should not require API key or authentication
    });
  });

  describe('Health Check Monitoring', () => {
    it('should provide consistent response structure', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health'),
      ]);

      const keys = Object.keys(responses[0].body);
      responses.forEach(response => {
        expect(Object.keys(response.body)).toEqual(keys);
      });
    });

    it('should show increasing uptime', async () => {
      const response1 = await request(app).get('/health');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response2 = await request(app).get('/health');

      expect(response2.body.uptime).toBeGreaterThanOrEqual(response1.body.uptime);
    });
  });
});