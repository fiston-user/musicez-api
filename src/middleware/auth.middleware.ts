import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../utils/jwt-token';
import logger from '../utils/logger';

/**
 * Extended Request interface with user information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    emailVerified?: boolean;
  };
}

/**
 * Authentication middleware that validates JWT tokens
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Access token is required. Please provide a valid Bearer token.'
        },
        timestamp: new Date().toISOString()
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Access token is required. Please provide a valid Bearer token.'
        },
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Validate the token
    const payload = await validateToken(token);
    
    // Add user information to request object
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      emailVerified: payload.emailVerified
    };

    logger.debug('User authenticated successfully', {
      userId: req.user.id,
      email: req.user.email,
      endpoint: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    logger.warn('Token validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });

    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: error instanceof Error ? error.message : 'Invalid or expired token'
      },
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Optional authentication middleware (allows both authenticated and unauthenticated access)
 */
export const optionalAuthentication = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (token) {
        try {
          const payload = await validateToken(token);
          req.user = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            emailVerified: payload.emailVerified
          };
          
          logger.debug('User authenticated (optional)', {
            userId: req.user.id,
            email: req.user.email,
            endpoint: req.path
          });
        } catch (error) {
          // Log but don't block request for optional auth
          logger.debug('Optional authentication failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            endpoint: req.path
          });
        }
      }
    }
    
    next();
  } catch (error) {
    // For optional auth, always continue
    logger.debug('Optional authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: req.path
    });
    next();
  }
};