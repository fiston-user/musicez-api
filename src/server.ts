import { createApp } from './app';
import { config } from './config/environment';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = createApp();

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Close database connections
  await prisma.$disconnect();
  
  // Close server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Start server
const server = app.listen(config.app.port, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║           MusicEZ API Server              ║
╠═══════════════════════════════════════════╣
║  Environment: ${config.app.env.padEnd(27)} ║
║  Port:        ${String(config.app.port).padEnd(27)} ║
║  Version:     ${config.app.version.padEnd(27)} ║
║  API Docs:    http://localhost:${config.app.port}/api-docs ║
║  Health:      http://localhost:${config.app.port}/health   ║
╚═══════════════════════════════════════════╝
  `);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export { server, app, prisma };