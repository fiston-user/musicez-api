import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Test setup file
process.env.NODE_ENV = 'test';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Global test database client
let globalPrisma: PrismaClient | undefined;

// Setup before all tests
beforeAll(async () => {
  // Use test database URL or fallback to dev database
  const databaseUrl = process.env.DATABASE_TEST_URL || process.env.DATABASE_URL;
  
  if (databaseUrl?.includes('musicez_dev')) {
    console.warn('⚠️  Using development database for tests. Consider setting DATABASE_TEST_URL.');
  }
  
  globalPrisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
    log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : [],
  });
  
  await globalPrisma.$connect();
  
  // Make Prisma client available globally for tests
  global.testPrisma = globalPrisma;
});

// Cleanup after all tests
afterAll(async () => {
  if (globalPrisma) {
    await globalPrisma.$disconnect();
  }
});

// Make Prisma client available globally for tests
declare global {
  var testPrisma: PrismaClient | undefined;
}

// Suppress console errors during tests unless in debug mode
if (process.env.DEBUG !== 'true') {
  global.console.error = jest.fn();
  global.console.warn = jest.fn();
}

// Add custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid UUID`
          : `Expected ${received} to be a valid UUID`,
    };
  },
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be within range ${floor} - ${ceiling}`
          : `Expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// TypeScript declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

export { globalPrisma };