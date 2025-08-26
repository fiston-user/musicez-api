import { Request, Response, NextFunction } from 'express';
import { SpotifyApiClient, SpotifyAuthenticationError } from '../utils/spotify-client';
import logger from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

interface StandardResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
  requestId?: string;
}

export class SpotifyAuthController {
  private readonly spotifyClient: SpotifyApiClient;
  private readonly requiredScopes = [
    'user-read-private',
    'user-read-email',
    'user-library-read', 
    'playlist-read-private',
    'user-read-recently-played'
  ];

  constructor() {
    this.spotifyClient = SpotifyApiClient.getInstance();
  }

  private createResponse(
    success: boolean,
    data?: any,
    error?: { code: string; message: string },
    requestId?: string
  ): StandardResponse {
    return {
      success,
      ...(data && { data }),
      ...(error && { error }),
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
    };
  }

  private getRequestContext(req: AuthenticatedRequest) {
    return {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: (req as any).locals?.requestId,
    };
  }

  public async connect(req: AuthenticatedRequest, res: Response, _next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const context = this.getRequestContext(req);

    try {
      if (!req.user) {
        res.status(401).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication required to connect Spotify account',
            },
            context.requestId
          )
        );
        return;
      }

      // Generate state token for CSRF protection
      const state = await this.spotifyClient.generateStateToken(req.user.id);

      // Get authorization URL
      const authUrl = this.spotifyClient.getAuthorizationUrl(this.requiredScopes, state);

      logger.info('Spotify OAuth connection initiated', {
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(200).json(
        this.createResponse(
          true,
          {
            authUrl,
            state,
          },
          undefined,
          context.requestId
        )
      );
    } catch (error) {
      logger.error('Spotify OAuth initiation failed', {
        error: (error as Error).message,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(500).json(
        this.createResponse(
          false,
          undefined,
          {
            code: 'SPOTIFY_OAUTH_INITIATION_FAILED',
            message: 'Failed to initiate Spotify authentication',
          },
          context.requestId
        )
      );
    }
  }

  public async callback(req: AuthenticatedRequest, res: Response, _next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const context = this.getRequestContext(req);
    const { code, state, error: oauthError, error_description } = req.query;

    try {
      // Handle OAuth error from Spotify
      if (oauthError) {
        logger.warn('OAuth error from Spotify', {
          error: oauthError,
          errorDescription: error_description,
          ...context,
        });

        res.status(400).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'OAUTH_ACCESS_DENIED',
              message: (error_description as string) || 'OAuth authorization failed',
            },
            context.requestId
          )
        );
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        res.status(400).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'MISSING_CALLBACK_PARAMETERS',
              message: 'Missing required callback parameters',
            },
            context.requestId
          )
        );
        return;
      }

      // Validate state token (CSRF protection)
      let userId: string;
      try {
        userId = await this.spotifyClient.validateStateToken(state as string);
      } catch (error) {
        logger.warn('Invalid state token detected', {
          state,
          error: (error as Error).message,
          ...context,
        });

        res.status(400).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'INVALID_STATE_TOKEN',
              message: 'Invalid state parameter. Potential CSRF attack.',
            },
            context.requestId
          )
        );
        return;
      }

      // Exchange authorization code for tokens
      const tokenResponse = await this.spotifyClient.exchangeCodeForTokens(code as string);

      // Get user profile from Spotify
      const userProfile = await this.spotifyClient.getUserProfile(tokenResponse.access_token);

      // Store tokens securely
      await this.spotifyClient.storeUserTokens(userId, {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in,
        scope: (tokenResponse as any).scope,
        spotifyUserId: userProfile.id,
        displayName: userProfile.display_name || undefined,
      });

      logger.info('Spotify OAuth callback successful', {
        callbackUserId: userId,
        spotifyUserId: userProfile.id,
        scope: (tokenResponse as any).scope,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(200).json(
        this.createResponse(
          true,
          {
            connected: true,
            spotifyUserId: userProfile.id,
            displayName: userProfile.display_name,
          },
          undefined,
          context.requestId
        )
      );
    } catch (error) {
      if (error instanceof SpotifyAuthenticationError) {
        logger.warn('Token exchange failed', {
          error: error.message,
          ...context,
          processingTime: Date.now() - startTime,
        });

        res.status(400).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'TOKEN_EXCHANGE_FAILED',
              message: 'Failed to exchange authorization code for tokens',
            },
            context.requestId
          )
        );
        return;
      }

      logger.error('Spotify OAuth callback failed', {
        error: (error as Error).message,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(500).json(
        this.createResponse(
          false,
          undefined,
          {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An internal server error occurred',
          },
          context.requestId
        )
      );
    }
  }

  public async status(req: AuthenticatedRequest, res: Response, _next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const context = this.getRequestContext(req);

    try {
      if (!req.user) {
        res.status(401).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication required to check Spotify connection status',
            },
            context.requestId
          )
        );
        return;
      }

      // Check if user has stored tokens
      const tokens = await this.spotifyClient.getUserTokens(req.user.id);

      if (!tokens) {
        logger.info('Spotify connection status checked: not connected', {
          ...context,
          processingTime: Date.now() - startTime,
        });

        res.status(200).json(
          this.createResponse(
            true,
            { connected: false },
            undefined,
            context.requestId
          )
        );
        return;
      }

      logger.info('Spotify connection status checked: connected', {
        statusUserId: req.user.id,
        spotifyUserId: tokens.spotifyUserId,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(200).json(
        this.createResponse(
          true,
          {
            connected: true,
            spotifyUserId: tokens.spotifyUserId,
            displayName: tokens.displayName,
            scope: tokens.scope,
            connectedAt: tokens.tokenExpiresAt.toISOString(),
          },
          undefined,
          context.requestId
        )
      );
    } catch (error) {
      logger.error('Spotify connection status check failed', {
        error: (error as Error).message,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(500).json(
        this.createResponse(
          false,
          undefined,
          {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An internal server error occurred',
          },
          context.requestId
        )
      );
    }
  }

  public async disconnect(req: AuthenticatedRequest, res: Response, _next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const context = this.getRequestContext(req);

    try {
      if (!req.user) {
        res.status(401).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication required to disconnect Spotify account',
            },
            context.requestId
          )
        );
        return;
      }

      // Remove stored tokens
      await this.spotifyClient.disconnectUser(req.user.id);

      logger.info('User disconnected Spotify account', {
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(200).json(
        this.createResponse(
          true,
          { disconnected: true },
          undefined,
          context.requestId
        )
      );
    } catch (error) {
      logger.error('Spotify disconnect failed', {
        error: (error as Error).message,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(500).json(
        this.createResponse(
          false,
          undefined,
          {
            code: 'SPOTIFY_DISCONNECT_FAILED',
            message: 'Failed to disconnect Spotify account',
          },
          context.requestId
        )
      );
    }
  }

  public async refresh(req: AuthenticatedRequest, res: Response, _next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const context = this.getRequestContext(req);

    try {
      if (!req.user) {
        res.status(401).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication required to refresh Spotify tokens',
            },
            context.requestId
          )
        );
        return;
      }

      // Check if user has stored tokens
      const tokens = await this.spotifyClient.getUserTokens(req.user.id);

      if (!tokens || !tokens.refreshToken) {
        res.status(404).json(
          this.createResponse(
            false,
            undefined,
            {
              code: 'NO_SPOTIFY_CONNECTION',
              message: 'No Spotify connection found or refresh token missing',
            },
            context.requestId
          )
        );
        return;
      }

      try {
        // Refresh tokens using Spotify client
        const refreshedTokens = await this.spotifyClient.refreshUserTokens(
          req.user.id, 
          tokens.refreshToken
        );

        if (refreshedTokens) {
          logger.info('Spotify tokens refreshed successfully', {
            ...context,
            processingTime: Date.now() - startTime,
          });

          res.status(200).json(
            this.createResponse(
              true,
              {
                refreshed: true,
                expiresAt: new Date(Date.now() + (refreshedTokens.expiresIn * 1000)),
              },
              undefined,
              context.requestId
            )
          );
        } else {
          throw new Error('Token refresh returned null');
        }
      } catch (error) {
        if (error instanceof SpotifyAuthenticationError) {
          logger.warn('Spotify token refresh failed - invalid refresh token', {
            error: error.message,
            ...context,
            processingTime: Date.now() - startTime,
          });

          // Remove invalid connection
          await this.spotifyClient.disconnectUser(req.user.id);

          res.status(401).json(
            this.createResponse(
              false,
              undefined,
              {
                code: 'REFRESH_TOKEN_INVALID',
                message: 'Spotify connection has expired. Please reconnect your account.',
              },
              context.requestId
            )
          );
          return;
        }

        throw error; // Re-throw unexpected errors
      }
    } catch (error) {
      logger.error('Spotify token refresh failed', {
        error: (error as Error).message,
        ...context,
        processingTime: Date.now() - startTime,
      });

      res.status(500).json(
        this.createResponse(
          false,
          undefined,
          {
            code: 'TOKEN_REFRESH_FAILED',
            message: 'Failed to refresh Spotify tokens',
          },
          context.requestId
        )
      );
    }
  }
}