import { SpotifyApi, AccessToken } from '@spotify/web-api-ts-sdk';
import { config } from '../config/environment';
import { createClient } from 'redis';
import logger from './logger';
import { z } from 'zod';

export interface SpotifyTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn: number;
  scope?: string;
  spotifyUserId?: string;
  displayName?: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  email?: string;
  followers?: {
    total: number;
  };
  images?: Array<{
    url: string;
    height?: number;
    width?: number;
  }>;
}

export interface RateLimitStatus {
  remainingRequests: number;
  resetTime: Date;
  retryAfter?: number;
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public cause?: Error
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

export class SpotifyRateLimitError extends SpotifyApiError {
  constructor(
    message: string,
    public retryAfter: number,
    cause?: Error
  ) {
    super(message, 429, cause);
    this.name = 'SpotifyRateLimitError';
  }
}

export class SpotifyAuthenticationError extends SpotifyApiError {
  constructor(message: string, cause?: Error) {
    super(message, 401, cause);
    this.name = 'SpotifyAuthenticationError';
  }
}

const spotifyTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenType: z.string().optional().default('Bearer'),
  expiresIn: z.number(),
  scope: z.string().optional(),
  spotifyUserId: z.string().optional(),
  displayName: z.string().optional(),
});

const RATE_LIMIT_PREFIX = 'spotify_rate_limit:';
const STATE_TOKEN_PREFIX = 'spotify_state:';
const USER_TOKENS_PREFIX = 'spotify_tokens:';
const STATE_TOKEN_EXPIRY = 600; // 10 minutes
const USER_TOKENS_EXPIRY = 86400 * 30; // 30 days

export class SpotifyApiClient {
  private static instance: SpotifyApiClient;
  private spotifyApi: SpotifyApi | null = null;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private isInitialized = false;

  private constructor() {
    this.initializeRedis();
  }

  public static getInstance(): SpotifyApiClient {
    if (!SpotifyApiClient.instance) {
      SpotifyApiClient.instance = new SpotifyApiClient();
    }
    return SpotifyApiClient.instance;
  }

  private async initializeRedis(): Promise<void> {
    try {
      if (config.redis.url && !this.redisClient) {
        this.redisClient = createClient({ url: config.redis.url });
        await this.redisClient.connect();
        logger.info('Redis client initialized for Spotify API');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis for Spotify API', { error });
    }
  }

  private async ensureRedisConnection(): Promise<void> {
    if (!this.redisClient && config.redis.url) {
      await this.initializeRedis();
    }
  }

  private initializeSpotifyClient(): void {
    if (!config.spotify.clientId || !config.spotify.clientSecret) {
      throw new SpotifyAuthenticationError('Spotify credentials not configured');
    }

    this.spotifyApi = SpotifyApi.withClientCredentials(
      config.spotify.clientId,
      config.spotify.clientSecret
    );
    this.isInitialized = true;
    
    logger.info('Spotify API client initialized with Client Credentials flow');
  }

  public getAuthorizationUrl(scopes: string[], state: string): string {
    if (!config.spotify.clientId || !config.spotify.redirectUri) {
      throw new SpotifyAuthenticationError('Spotify OAuth configuration missing');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotify.clientId,
      scope: scopes.join(' '),
      redirect_uri: config.spotify.redirectUri,
      state,
      show_dialog: 'true',
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  public async generateStateToken(userId: string): Promise<string> {
    await this.ensureRedisConnection();
    
    const stateToken = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const key = `${STATE_TOKEN_PREFIX}${stateToken}`;

    if (this.redisClient) {
      await this.redisClient.setEx(key, STATE_TOKEN_EXPIRY, userId);
      logger.debug('State token generated and stored', { userId, stateToken });
    }

    return stateToken;
  }

  public async validateStateToken(stateToken: string): Promise<string> {
    await this.ensureRedisConnection();
    
    const key = `${STATE_TOKEN_PREFIX}${stateToken}`;
    
    if (!this.redisClient) {
      throw new SpotifyAuthenticationError('Redis not available for state validation');
    }

    const userId = await this.redisClient.get(key);
    if (!userId) {
      throw new SpotifyAuthenticationError('Invalid or expired state token');
    }

    // Clean up used state token
    await this.redisClient.del(key);
    
    logger.debug('State token validated', { userId, stateToken });
    return userId;
  }

  public async exchangeCodeForTokens(code: string): Promise<AccessToken> {
    if (!config.spotify.clientId || !config.spotify.clientSecret || !config.spotify.redirectUri) {
      throw new SpotifyAuthenticationError('Spotify OAuth configuration missing');
    }

    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(
            `${config.spotify.clientId}:${config.spotify.clientSecret}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.spotify.redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({})) as any;
        throw new SpotifyAuthenticationError(
          `Token exchange failed: ${errorData.error_description || tokenResponse.statusText}`
        );
      }

      const tokenData = await tokenResponse.json() as any;
      
      logger.info('Successfully exchanged authorization code for tokens', {
        scope: tokenData.scope,
        expiresIn: tokenData.expires_in,
      });

      return tokenData as AccessToken;
    } catch (error) {
      if (error instanceof SpotifyAuthenticationError) {
        throw error;
      }
      throw new SpotifyAuthenticationError('Failed to exchange authorization code', error as Error);
    }
  }

  public async getUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new SpotifyAuthenticationError('Invalid access token');
        }
        throw new SpotifyApiError(`Failed to fetch user profile: ${response.statusText}`, response.status);
      }

      const userData = await response.json() as any;
      return {
        id: userData.id,
        display_name: userData.display_name,
        email: userData.email,
        followers: userData.followers,
        images: userData.images,
      };
    } catch (error) {
      if (error instanceof SpotifyApiError) {
        throw error;
      }
      throw new SpotifyApiError('Failed to get user profile', undefined, error as Error);
    }
  }

  public async storeUserTokens(userId: string, tokens: Partial<SpotifyTokens>): Promise<void> {
    await this.ensureRedisConnection();

    // Validate tokens
    const validatedTokens = spotifyTokensSchema.parse(tokens);
    
    const key = `${USER_TOKENS_PREFIX}${userId}`;
    const tokenData = {
      ...validatedTokens,
      tokenExpiresAt: new Date(Date.now() + (validatedTokens.expiresIn * 1000)).toISOString(),
      storedAt: new Date().toISOString(),
    };

    if (this.redisClient) {
      await this.redisClient.setEx(key, USER_TOKENS_EXPIRY, JSON.stringify(tokenData));
      logger.info('User Spotify tokens stored', { 
        userId, 
        spotifyUserId: tokens.spotifyUserId,
        scope: tokens.scope,
      });
    }
  }

  public async getUserTokens(userId: string): Promise<SpotifyTokens & { tokenExpiresAt: Date } | null> {
    await this.ensureRedisConnection();
    
    const key = `${USER_TOKENS_PREFIX}${userId}`;
    
    if (!this.redisClient) {
      return null;
    }

    const tokenData = await this.redisClient.get(key);
    if (!tokenData) {
      return null;
    }

    try {
      const parsed = JSON.parse(tokenData);
      return {
        ...parsed,
        tokenExpiresAt: new Date(parsed.tokenExpiresAt),
      };
    } catch (error) {
      logger.error('Failed to parse stored user tokens', { userId, error });
      await this.redisClient.del(key); // Clean up invalid data
      return null;
    }
  }

  public async refreshUserTokens(userId: string, refreshToken: string): Promise<SpotifyTokens | null> {
    if (!config.spotify.clientId || !config.spotify.clientSecret) {
      throw new SpotifyAuthenticationError('Spotify credentials not configured');
    }

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(
            `${config.spotify.clientId}:${config.spotify.clientSecret}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        if (response.status === 400 && errorData.error === 'invalid_grant') {
          // Refresh token is invalid, remove stored tokens
          await this.disconnectUser(userId);
          return null;
        }
        throw new SpotifyAuthenticationError(
          `Token refresh failed: ${errorData.error_description || response.statusText}`
        );
      }

      const tokenData = await response.json() as any;
      
      const refreshedTokens: SpotifyTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
      };

      // Get existing tokens to preserve user info
      const existingTokens = await this.getUserTokens(userId);
      if (existingTokens) {
        refreshedTokens.spotifyUserId = existingTokens.spotifyUserId;
        refreshedTokens.displayName = existingTokens.displayName;
      }

      await this.storeUserTokens(userId, refreshedTokens);
      
      logger.info('User Spotify tokens refreshed', { userId });
      return refreshedTokens;
    } catch (error) {
      if (error instanceof SpotifyAuthenticationError) {
        throw error;
      }
      throw new SpotifyAuthenticationError('Failed to refresh tokens', error as Error);
    }
  }

  public async disconnectUser(userId: string): Promise<void> {
    await this.ensureRedisConnection();
    
    const key = `${USER_TOKENS_PREFIX}${userId}`;
    
    if (this.redisClient) {
      await this.redisClient.del(key);
      logger.info('User Spotify tokens removed', { userId });
    }
  }

  public async hasValidConnection(userId: string): Promise<boolean> {
    const tokens = await this.getUserTokens(userId);
    if (!tokens) {
      return false;
    }

    // Check if token is still valid (with 5-minute buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return tokens.tokenExpiresAt.getTime() > Date.now() + bufferTime;
  }

  private async checkRateLimit(): Promise<void> {
    await this.ensureRedisConnection();
    
    if (!this.redisClient) {
      return; // No rate limiting without Redis
    }

    const key = `${RATE_LIMIT_PREFIX}spotify_api`;
    const currentCount = await this.redisClient.get(key);
    
    if (currentCount && parseInt(currentCount) >= 100) { // Spotify's rate limit is typically around 100 requests per minute
      const ttl = await this.redisClient.ttl(key);
      throw new SpotifyRateLimitError(
        'Spotify API rate limit exceeded',
        ttl > 0 ? ttl : 60
      );
    }

    // Increment counter
    if (currentCount) {
      await this.redisClient.incr(key);
    } else {
      await this.redisClient.setEx(key, 60, '1'); // 1-minute window
    }
  }

  public async getRateLimitStatus(): Promise<RateLimitStatus> {
    await this.ensureRedisConnection();
    
    if (!this.redisClient) {
      return {
        remainingRequests: 100,
        resetTime: new Date(Date.now() + 60000),
      };
    }

    const key = `${RATE_LIMIT_PREFIX}spotify_api`;
    const currentCount = await this.redisClient.get(key);
    const ttl = await this.redisClient.ttl(key);
    
    const usedRequests = currentCount ? parseInt(currentCount) : 0;
    const remainingRequests = Math.max(0, 100 - usedRequests);
    
    return {
      remainingRequests,
      resetTime: new Date(Date.now() + (ttl > 0 ? ttl * 1000 : 60000)),
    };
  }

  public async makeApiCall<T>(
    apiCall: () => Promise<T>,
    retries: number = 3
  ): Promise<T> {
    if (!this.isInitialized) {
      this.initializeSpotifyClient();
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.checkRateLimit();
        
        const result = await apiCall();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof SpotifyRateLimitError) {
          if (attempt === retries) {
            throw error;
          }
          
          const delay = error.retryAfter * 1000;
          logger.warn('Rate limit hit, waiting before retry', {
            attempt,
            retryAfter: error.retryAfter,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (error instanceof SpotifyAuthenticationError) {
          throw error; // Don't retry auth errors
        }

        if (attempt === retries) {
          throw new SpotifyApiError(
            `API call failed after ${retries} attempts`,
            undefined,
            error as Error
          );
        }

        // Exponential backoff for other errors
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.warn('API call failed, retrying', { attempt, delay, error: (error as Error).message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new SpotifyApiError('Unknown error occurred');
  }

  public async getUserPlaylists(userId: string): Promise<any> {
    const tokens = await this.getUserTokens(userId);
    if (!tokens) {
      throw new SpotifyAuthenticationError('User tokens not found');
    }

    // Check if token needs refresh
    if (tokens.tokenExpiresAt.getTime() <= Date.now()) {
      if (tokens.refreshToken) {
        const refreshedTokens = await this.refreshUserTokens(userId, tokens.refreshToken);
        if (!refreshedTokens) {
          throw new SpotifyAuthenticationError('Unable to refresh expired token');
        }
      } else {
        throw new SpotifyAuthenticationError('Access token expired and no refresh token available');
      }
    }

    const apiCall = async () => {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new SpotifyAuthenticationError('Invalid access token');
        }
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
          throw new SpotifyRateLimitError('Rate limit exceeded', retryAfter);
        }
        throw new SpotifyApiError(`Failed to fetch playlists: ${response.statusText}`, response.status);
      }

      return response.json();
    };

    return this.makeApiCall(apiCall);
  }

  public async getRecentlyPlayedTracks(userId: string, options?: { limit?: number }): Promise<any> {
    const tokens = await this.getUserTokens(userId);
    if (!tokens) {
      throw new SpotifyAuthenticationError('User tokens not found');
    }

    // Check if token needs refresh
    if (tokens.tokenExpiresAt.getTime() <= Date.now()) {
      if (tokens.refreshToken) {
        const refreshedTokens = await this.refreshUserTokens(userId, tokens.refreshToken);
        if (!refreshedTokens) {
          throw new SpotifyAuthenticationError('Unable to refresh expired token');
        }
      } else {
        throw new SpotifyAuthenticationError('Access token expired and no refresh token available');
      }
    }

    const limit = Math.min(options?.limit || 20, 50); // Spotify API max is 50

    const apiCall = async () => {
      const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new SpotifyAuthenticationError('Invalid access token');
        }
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
          throw new SpotifyRateLimitError('Rate limit exceeded', retryAfter);
        }
        throw new SpotifyApiError(`Failed to fetch recent tracks: ${response.statusText}`, response.status);
      }

      return response.json();
    };

    return this.makeApiCall(apiCall);
  }

  public getSpotifyApi(): SpotifyApi {
    if (!this.isInitialized) {
      this.initializeSpotifyClient();
    }
    
    if (!this.spotifyApi) {
      throw new SpotifyAuthenticationError('Spotify API not initialized');
    }
    
    return this.spotifyApi;
  }
}

export default SpotifyApiClient;