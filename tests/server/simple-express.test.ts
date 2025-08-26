import request from 'supertest';

describe('Simple Express Test', () => {
  it('should run without errors', () => {
    expect(1).toBe(1);
  });

  it('should import createApp', () => {
    const { createApp } = require('../../src/app');
    expect(createApp).toBeDefined();
  });
  
  it('should create app', () => {
    const { createApp } = require('../../src/app');  
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('should respond to root endpoint', async () => {
    const { createApp } = require('../../src/app');
    const app = createApp();
    
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });
});