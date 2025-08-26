import request from 'supertest';
import { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import createApp from '../app';
import { v4 as uuidv4 } from 'uuid';

export interface TestContext {
  app: Application;
  prisma: PrismaClient;
  apiKey?: string;
  authToken?: string;
}

/**
 * Creates a test application instance with database
 */
export async function createTestContext(): Promise<TestContext> {
  const app = createApp();
  const prisma = new PrismaClient({
    log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : [],
  });

  await prisma.$connect();

  return { app, prisma };
}

/**
 * Cleans up test context
 */
export async function cleanupTestContext(context: TestContext): Promise<void> {
  await context.prisma.$disconnect();
}

/**
 * Creates an authenticated test context with API key
 */
export async function createAuthenticatedContext(): Promise<TestContext> {
  const context = await createTestContext();
  
  // Create API key
  const apiKey = await context.prisma.apiKey.create({
    data: {
      key: `test_${uuidv4().replace(/-/g, '')}`,
      name: 'Integration Test Key',
      active: true,
    },
  });

  context.apiKey = apiKey.key;
  
  return context;
}

/**
 * Makes an authenticated request
 */
export function authenticatedRequest(
  app: Application,
  apiKey: string
): request.SuperTest<request.Test> {
  return request(app).set('X-API-Key', apiKey) as any;
}

/**
 * Helper to make GET requests
 */
export async function makeGetRequest(
  context: TestContext,
  path: string,
  authenticated = false
) {
  const req = authenticated && context.apiKey
    ? request(context.app).get(path).set('X-API-Key', context.apiKey)
    : request(context.app).get(path);
  
  return req;
}

/**
 * Helper to make POST requests
 */
export async function makePostRequest(
  context: TestContext,
  path: string,
  data: any,
  authenticated = false
) {
  const req = authenticated && context.apiKey
    ? request(context.app).post(path).set('X-API-Key', context.apiKey)
    : request(context.app).post(path);
  
  return req.send(data);
}

/**
 * Helper to make PUT requests
 */
export async function makePutRequest(
  context: TestContext,
  path: string,
  data: any,
  authenticated = false
) {
  const req = authenticated && context.apiKey
    ? request(context.app).put(path).set('X-API-Key', context.apiKey)
    : request(context.app).put(path);
  
  return req.send(data);
}

/**
 * Helper to make DELETE requests
 */
export async function makeDeleteRequest(
  context: TestContext,
  path: string,
  authenticated = false
) {
  const req = authenticated && context.apiKey
    ? request(context.app).delete(path).set('X-API-Key', context.apiKey)
    : request(context.app).delete(path);
  
  return req;
}

/**
 * Waits for async operations to complete
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}

/**
 * Creates a test user with authentication
 */
export async function createAuthenticatedUser(
  context: TestContext,
  userData?: Partial<{
    email: string;
    name: string;
  }>
) {
  const user = await context.prisma.user.create({
    data: {
      email: userData?.email ?? `test${Date.now()}@test.com`,
      name: userData?.name ?? 'Test User',
      favoriteGenres: ['rock', 'pop'],
    },
  });

  // In a real app, you'd generate a JWT token here
  const authToken = `test-token-${user.id}`;
  
  return { user, authToken };
}

/**
 * Asserts API response structure
 */
export function assertApiResponse(
  response: request.Response,
  expectedStatus: number,
  expectedProperties?: string[]
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.headers['content-type']).toMatch(/json/);
  
  if (expectedProperties) {
    expectedProperties.forEach(prop => {
      expect(response.body).toHaveProperty(prop);
    });
  }
}

/**
 * Asserts error response structure
 */
export function assertErrorResponse(
  response: request.Response,
  expectedStatus: number,
  expectedMessage?: string
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('error');
  
  if (expectedMessage) {
    expect(response.body.error).toContain(expectedMessage);
  }
}

/**
 * Creates test data in batch
 */
export async function seedIntegrationTestData(context: TestContext) {
  // Create users
  const users = await Promise.all([
    context.prisma.user.create({
      data: {
        email: 'user1@test.com',
        name: 'User One',
        favoriteGenres: ['rock'],
      },
    }),
    context.prisma.user.create({
      data: {
        email: 'user2@test.com',
        name: 'User Two',
        favoriteGenres: ['pop'],
      },
    }),
  ]);

  // Create songs
  const songs = await Promise.all([
    context.prisma.song.create({
      data: {
        title: 'Song One',
        artist: 'Artist One',
        genre: 'rock',
        tempo: 120,
      },
    }),
    context.prisma.song.create({
      data: {
        title: 'Song Two',
        artist: 'Artist Two',
        genre: 'pop',
        tempo: 128,
      },
    }),
  ]);

  return { users, songs };
}