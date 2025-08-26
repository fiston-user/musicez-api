import { Request, Response, NextFunction } from 'express';
import { SpotifyApiClient, SpotifyAuthenticationError } from '../utils/spotify-client';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  spotifyTokens?: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: Date;
    scope?: string;
    spotifyUserId?: string;
    displayName?: string;
  };
}

export class SpotifyTokenMiddleware {
  private readonly spotifyClient: SpotifyApiClient;

  constructor() {
    this.spotifyClient = SpotifyApiClient.getInstance();
  }

  public requireSpotifyConnection = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if user has a valid Spotify connection
      const hasConnection = await this.spotifyClient.hasValidConnection(req.user.id);
      
      if (!hasConnection) {
        res.status(403).json({
          success: false,
          error: {
            code: 'SPOTIFY_CONNECTION_REQUIRED',
            message: 'Spotify account connection required for this operation',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Get tokens and add to request
      const tokens = await this.spotifyClient.getUserTokens(req.user.id);
      if (tokens) {
        req.spotifyTokens = tokens;
      }

      next();
    } catch (error) {
      logger.error('Spotify token middleware error', {
        error: (error as Error).message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  public refreshTokenIfNeeded = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        next();
        return;
      }

      const tokens = await this.spotifyClient.getUserTokens(req.user.id);
      if (!tokens || !tokens.refreshToken) {
        next();
        return;
      }

      // Check if token needs refresh (5 minutes buffer)
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const needsRefresh = tokens.tokenExpiresAt.getTime() <= Date.now() + bufferTime;

      if (needsRefresh) {
        logger.info('Refreshing Spotify tokens', { userId: req.user.id });
        
        try {
          const refreshedTokens = await this.spotifyClient.refreshUserTokens(
            req.user.id, 
            tokens.refreshToken
          );
          
          if (refreshedTokens) {
            req.spotifyTokens = {
              ...refreshedTokens,
              tokenExpiresAt: new Date(Date.now() + (refreshedTokens.expiresIn * 1000)),
            };
            logger.info('Spotify tokens refreshed successfully', { userId: req.user.id });
          }
        } catch (error) {
          if (error instanceof SpotifyAuthenticationError) {
            logger.warn('Spotify token refresh failed, connection invalidated', {
              userId: req.user.id,
              error: error.message,
            });
            
            // Remove invalid tokens
            await this.spotifyClient.disconnectUser(req.user.id);
            
            res.status(401).json({
              success: false,
              error: {
                code: 'SPOTIFY_TOKEN_EXPIRED',
                message: 'Spotify connection has expired. Please reconnect your account.',
              },
              timestamp: new Date().toISOString(),
            });
            return;
          }
          
          throw error; // Re-throw unexpected errors
        }
      } else if (tokens) {
        req.spotifyTokens = tokens;
      }

      next();
    } catch (error) {
      logger.error('Token refresh middleware error', {
        error: (error as Error).message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred',
        },
        timestamp: new Date().toISOString(),
      });
    }
  };

  public validateTokenScopes = (requiredScopes: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.spotifyTokens || !req.spotifyTokens.scope) {
          res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_SCOPE',
              message: 'Spotify connection does not have required permissions',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const userScopes = req.spotifyTokens.scope.split(' ');
        const hasAllScopes = requiredScopes.every(scope => userScopes.includes(scope));

        if (!hasAllScopes) {
          const missingScopes = requiredScopes.filter(scope => !userScopes.includes(scope));
          
          res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_SCOPE',
              message: `Spotify connection missing required permissions: ${missingScopes.join(', ')}`,
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        next();
      } catch (error) {
        logger.error('Scope validation middleware error', {
          error: (error as Error).message,
          userId: req.user?.id,
          requiredScopes,
        });

        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An internal server error occurred',
          },
          timestamp: new Date().toISOString(),
        });
      }
    };
  };
}

export default new SpotifyTokenMiddleware();