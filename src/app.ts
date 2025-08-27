import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import routers
import { healthRouter } from './routes/health.routes';
import { rootRouter } from './routes/root.routes';
import authRouter from './routes/auth.routes';
import songsRouter from './routes/songs.routes';
import apiKeyRouter from './routes/api-key.routes';
import spotifyAuthRouter from './routes/spotify-auth.routes';
import userSpotifyDataRouter from './routes/user-spotify-data.routes';
import adminSpotifySyncRouter from './routes/admin-spotify-sync.routes';
import recommendationsRouter from './routes/recommendations.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';

// Import configuration
import { config } from './config/environment';

// Import logging
import logger from './utils/logger';

/**
 * Create and configure Express application
 */
function createApp(): Application {
  const app = express();

  // Trust proxy headers for rate limiting and IP detection
  app.set('trust proxy', 1);

  // Request ID middleware (first to add to all requests)
  app.use(requestIdMiddleware);

  // Security middleware
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // Allow embedding for development
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: config.cors.origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
  }));

  // Compression middleware
  app.use(compression());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging middleware
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      }
    }
  }));

  // Global rate limiting (more permissive than auth-specific limits)
  const globalRateLimit = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => {
      // Skip rate limiting in test environment
      return config.app.isTest;
    },
  });

  app.use(globalRateLimit);

  // Routes
  app.use('/', rootRouter);
  app.use('/health', healthRouter);
  app.use(`${config.api.prefix}/${config.api.version}/auth`, authRouter);
  app.use(`${config.api.prefix}/${config.api.version}/auth/spotify`, spotifyAuthRouter);
  app.use(`${config.api.prefix}/${config.api.version}/songs`, songsRouter);
  app.use(`${config.api.prefix}/${config.api.version}/admin/api-keys`, apiKeyRouter);
  app.use(`${config.api.prefix}/${config.api.version}/user/spotify`, userSpotifyDataRouter);
  app.use(`${config.api.prefix}/${config.api.version}/admin/spotify`, adminSpotifySyncRouter);
  app.use(`${config.api.prefix}/${config.api.version}/recommendations`, recommendationsRouter);

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

export default createApp;