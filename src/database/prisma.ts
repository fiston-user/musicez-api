import { PrismaClient } from '@prisma/client';
import { config } from '../config/environment';

// Singleton pattern for Prisma Client
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: config.app.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Prevent multiple instances of Prisma Client in development
export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (config.app.isDevelopment) {
  globalThis.prisma = prisma;
}

// Graceful shutdown
export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('Database disconnected');
  } catch (error) {
    console.error('Error disconnecting database:', error);
  }
}

// Health check query
export async function checkDatabaseHealth() {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;
    
    return {
      connected: true,
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