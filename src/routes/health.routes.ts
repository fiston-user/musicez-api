import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/environment';

const router = Router();
const prisma = new PrismaClient();
const startTime = Date.now();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Check database connectivity
    let databaseStatus = { connected: false, latency: 0 };
    const dbStartTime = Date.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseStatus = {
        connected: true,
        latency: Date.now() - dbStartTime,
      };
    } catch (error) {
      databaseStatus = {
        connected: false,
        latency: 0,
      };
    }

    // Check Redis connectivity (if configured)
    let redisStatus = { connected: false, latency: 0 };
    if (config.redis.url) {
      // TODO: Implement Redis health check when Redis client is added
      redisStatus = {
        connected: false,
        latency: 0,
      };
    }

    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: config.app.name.toLowerCase().replace(' ', '-'),
      version: config.app.version,
      uptime: Math.floor((Date.now() - startTime) / 1000), // in seconds
      database: databaseStatus,
      redis: redisStatus,
    };

    // Determine overall health
    const isHealthy = databaseStatus.connected;
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: config.app.name.toLowerCase().replace(' ', '-'),
      version: config.app.version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      error: 'Health check failed',
    });
  }
});

export { router as healthRouter };