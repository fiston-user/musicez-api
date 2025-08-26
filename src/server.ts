import createApp from "./app";
import { config } from "./config/environment";
import { PrismaClient } from "@prisma/client";
import { initializeRedis, disconnectRedis } from "./config/redis";

const prisma = new PrismaClient();
const app = createApp();

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Close database connections
  await prisma.$disconnect();
  
  // Close Redis connection
  await disconnectRedis();

  // Close server
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000);
};

// Initialize services and start server
const startServer = async () => {
  try {
    // Initialize Redis connection
    await initializeRedis();
    
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
    
    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
let server: any;
startServer().then(s => server = s);

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

export { server, app, prisma };
