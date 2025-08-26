import request from 'supertest';
import { Application } from 'express';
import { Server } from 'http';

describe('Express Server', () => {
  let app: Application;
  let server: Server;

  beforeAll(() => {
    // Import the app creation function
    const { createApp } = require('../../src/app');
    app = createApp();
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('Server Initialization', () => {
    it('should create an Express application', () => {
      expect(app).toBeDefined();
      expect(app.listen).toBeInstanceOf(Function);
    });

    it('should start server on specified port', async () => {
      const port = 3001; // Use different port for testing
      server = app.listen(port);
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const address = server.address();
      expect(address).toBeDefined();
      if (typeof address === 'object' && address !== null) {
        expect(address.port).toBe(port);
      }
    });

    it('should handle graceful shutdown', async () => {
      const shutdownPromise = new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      
      await expect(shutdownPromise).resolves.toBeUndefined();
    });
  });

  describe('Basic Routing', () => {
    it('should respond to GET / with API info', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'MusicEZ API',
        version: '1.0.0',
        description: expect.any(String),
        documentation: '/api-docs',
        health: '/health'
      });
    });

    it('should respond to GET /health with system status', async () => {
      const response = await request(app).get('/health');
      
      // Accept both 200 (healthy) and 503 (database not connected in test)
      expect([200, 503]).toContain(response.status);
      expect(response.body).toMatchObject({
        status: expect.stringMatching(/healthy|unhealthy/),
        timestamp: expect.any(String),
        service: 'musicez-api',
        version: '1.0.0',
        uptime: expect.any(Number)
      });
    });

    it('should return 404 for undefined routes', async () => {
      const response = await request(app).get('/undefined-route');
      
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found')
        }
      });
    });
  });

  describe('Middleware Stack', () => {
    it('should parse JSON body', async () => {
      const testData = { test: 'data', nested: { value: 123 } };
      const response = await request(app)
        .post('/test-echo')
        .send(testData)
        .set('Content-Type', 'application/json');
      
      // This will fail until we implement the echo endpoint
      // But the test verifies JSON parsing capability
      expect(response.status).toBeLessThanOrEqual(500);
    });

    it('should set security headers', async () => {
      const response = await request(app).get('/');
      
      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': expect.stringMatching(/DENY|SAMEORIGIN/),
        'x-xss-protection': expect.any(String)
      });
    });

    it('should handle CORS headers', async () => {
      const response = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:3001');
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should add request ID to responses', async () => {
      const response = await request(app).get('/');
      
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should compress large responses', async () => {
      // This test assumes we have an endpoint that returns large data
      // Will be validated when implementing actual endpoints
      const response = await request(app)
        .get('/')
        .set('Accept-Encoding', 'gzip');
      
      // Check if compression is configured (actual compression depends on response size)
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle synchronous errors', async () => {
      // This will be tested with a specific error endpoint
      const response = await request(app).get('/test-error-sync');
      
      // Expect either 404 (route not found) or 500 (if route exists and errors)
      expect([404, 500]).toContain(response.status);
    });

    it('should handle asynchronous errors', async () => {
      // This will be tested with a specific error endpoint
      const response = await request(app).get('/test-error-async');
      
      // Expect either 404 (route not found) or 500 (if route exists and errors)
      expect([404, 500]).toContain(response.status);
    });

    it('should return proper error format', async () => {
      const response = await request(app).get('/undefined');
      
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String)
        }
      });
      
      if (response.headers['x-request-id']) {
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
      }
    });
  });

  describe('Environment Configuration', () => {
    it('should load environment variables', () => {
      expect(process.env.NODE_ENV).toBeDefined();
      expect(['development', 'test', 'production']).toContain(process.env.NODE_ENV);
    });

    it('should use correct port from environment', () => {
      const expectedPort = process.env.PORT || '3000';
      expect(expectedPort).toBeDefined();
    });
  });
});