import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import routers
import { healthRouter } from './routes/health.routes';
import { rootRouter } from './routes/root.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';

// Import configuration
import { config } from './config/environment';

export function createApp(): Application {
  const app = express();

  // Request ID middleware (should be first)
  app.use(requestIdMiddleware);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for API
  }));

  // CORS configuration
  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compression middleware
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024, // Only compress responses larger than 1KB
  }));

  // Request logging
  if (config.app.env !== 'test') {
    const logFormat = config.app.env === 'production' ? 'combined' : 'dev';
    app.use(morgan(logFormat, {
      skip: (req) => req.path === '/health', // Don't log health checks
      stream: {
        write: (message: string) => {
          console.log(message.trim());
        },
      },
    }));
  }

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
        },
        requestId: res.locals.requestId,
      });
    },
  });

  // Apply rate limiting to all routes except health
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      return next();
    }
    return limiter(req, res, next);
  });

  // Trust proxy
  app.set('trust proxy', 1);

  // Routes
  app.use('/', rootRouter);
  app.use('/health', healthRouter);

  // API routes will be mounted here
  // app.use('/api/v1', apiV1Routes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

export default createApp;