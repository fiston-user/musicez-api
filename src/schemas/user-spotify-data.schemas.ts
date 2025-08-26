import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// Request schemas
export const playlistSyncRequestSchema = z.object({
  includePrivate: z.boolean().optional().default(false),
});

export const recentTracksSyncRequestSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(20),
});

// Request validators
export const validateUserSpotifyRequest = {
  playlistSyncRequest: (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedBody = playlistSyncRequestSchema.parse(req.body);
      req.body = validatedBody;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Playlist sync request validation failed', {
          errors: error.issues,
          body: req.body,
          ip: req.ip,
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.issues.map((err: z.ZodIssue) => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          requestId: res.locals.requestId,
        });
        return;
      }

      logger.error('Unexpected validation error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred during request validation',
        },
        requestId: res.locals.requestId,
      });
    }
  },

  recentTracksSyncRequest: (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedBody = recentTracksSyncRequestSchema.parse(req.body);
      req.body = validatedBody;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Recent tracks sync request validation failed', {
          errors: error.issues,
          body: req.body,
          ip: req.ip,
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.issues.map((err: z.ZodIssue) => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          requestId: res.locals.requestId,
        });
        return;
      }

      logger.error('Unexpected validation error', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred during request validation',
        },
        requestId: res.locals.requestId,
      });
    }
  },
};