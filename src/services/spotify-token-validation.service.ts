import * as cron from 'node-cron';
import { SpotifyApiClient, SpotifyAuthenticationError } from '../utils/spotify-client';
import { prisma } from '../database/prisma';
import logger from '../utils/logger';

export interface TokenValidationStats {
  totalUsers: number;
  validTokens: number;
  expiredTokens: number;
  refreshedTokens: number;
  invalidatedTokens: number;
  errors: number;
}

export class SpotifyTokenValidationService {
  private readonly spotifyClient: SpotifyApiClient;
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.spotifyClient = SpotifyApiClient.getInstance();
  }

  public start(): void {
    if (this.cronJob) {
      logger.warn('Spotify token validation service is already running');
      return;
    }

    // Run every hour at minute 0
    this.cronJob = cron.schedule('0 * * * *', async () => {
      await this.validateAllTokens();
    });

    this.cronJob.start();
    logger.info('Spotify token validation service started');
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Spotify token validation service stopped');
    }
  }

  public async validateAllTokens(): Promise<TokenValidationStats> {
    if (this.isRunning) {
      logger.warn('Token validation already in progress, skipping');
      return this.getEmptyStats();
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    logger.info('Starting Spotify token validation job');

    const stats: TokenValidationStats = {
      totalUsers: 0,
      validTokens: 0,
      expiredTokens: 0,
      refreshedTokens: 0,
      invalidatedTokens: 0,
      errors: 0,
    };

    try {
      // Get all users (we'll check tokens from Redis)
      const users = await prisma.user.findMany({
        select: { id: true, email: true },
      });

      stats.totalUsers = users.length;

      for (const user of users) {
        try {
          await this.validateUserToken(user.id, stats);
        } catch (error) {
          stats.errors++;
          logger.error('Error validating token for user', {
            userId: user.id,
            error: (error as Error).message,
          });
        }
      }

      logger.info('Spotify token validation job completed', {
        ...stats,
        processingTime: Date.now() - startTime,
      });

      return stats;
    } catch (error) {
      logger.error('Spotify token validation job failed', {
        error: (error as Error).message,
        processingTime: Date.now() - startTime,
      });
      
      stats.errors++;
      return stats;
    } finally {
      this.isRunning = false;
    }
  }

  private async validateUserToken(userId: string, stats: TokenValidationStats): Promise<void> {
    // Get user tokens from Redis
    const tokens = await this.spotifyClient.getUserTokens(userId);
    
    if (!tokens) {
      return; // No tokens to validate
    }

    // Check if token is expired (with 5-minute buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const isExpired = tokens.tokenExpiresAt.getTime() <= Date.now() + bufferTime;

    if (!isExpired) {
      stats.validTokens++;
      return;
    }

    stats.expiredTokens++;

    // Try to refresh the token if we have a refresh token
    if (tokens.refreshToken) {
      try {
        const refreshedTokens = await this.spotifyClient.refreshUserTokens(
          userId, 
          tokens.refreshToken
        );
        
        if (refreshedTokens) {
          stats.refreshedTokens++;
          logger.debug('Token refreshed for user', { userId });
        } else {
          stats.invalidatedTokens++;
          logger.debug('Token invalidated for user (refresh returned null)', { userId });
        }
      } catch (error) {
        if (error instanceof SpotifyAuthenticationError) {
          // Refresh token is invalid, remove stored tokens
          await this.spotifyClient.disconnectUser(userId);
          stats.invalidatedTokens++;
          logger.debug('Token invalidated for user (refresh failed)', { 
            userId, 
            error: error.message 
          });
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    } else {
      // No refresh token, invalidate the connection
      await this.spotifyClient.disconnectUser(userId);
      stats.invalidatedTokens++;
      logger.debug('Token invalidated for user (no refresh token)', { userId });
    }
  }

  private getEmptyStats(): TokenValidationStats {
    return {
      totalUsers: 0,
      validTokens: 0,
      expiredTokens: 0,
      refreshedTokens: 0,
      invalidatedTokens: 0,
      errors: 0,
    };
  }

  public async validateUserTokenManually(userId: string): Promise<{
    hasConnection: boolean;
    needsRefresh: boolean;
    refreshed: boolean;
    invalidated: boolean;
    error?: string;
  }> {
    try {
      const tokens = await this.spotifyClient.getUserTokens(userId);
      
      if (!tokens) {
        return {
          hasConnection: false,
          needsRefresh: false,
          refreshed: false,
          invalidated: false,
        };
      }

      // Check if token needs refresh (5 minutes buffer)
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      const needsRefresh = tokens.tokenExpiresAt.getTime() <= Date.now() + bufferTime;

      if (!needsRefresh) {
        return {
          hasConnection: true,
          needsRefresh: false,
          refreshed: false,
          invalidated: false,
        };
      }

      // Try to refresh
      if (tokens.refreshToken) {
        try {
          const refreshedTokens = await this.spotifyClient.refreshUserTokens(
            userId, 
            tokens.refreshToken
          );
          
          if (refreshedTokens) {
            return {
              hasConnection: true,
              needsRefresh: true,
              refreshed: true,
              invalidated: false,
            };
          } else {
            return {
              hasConnection: false,
              needsRefresh: true,
              refreshed: false,
              invalidated: true,
            };
          }
        } catch (error) {
          if (error instanceof SpotifyAuthenticationError) {
            await this.spotifyClient.disconnectUser(userId);
            return {
              hasConnection: false,
              needsRefresh: true,
              refreshed: false,
              invalidated: true,
              error: error.message,
            };
          }
          throw error;
        }
      } else {
        await this.spotifyClient.disconnectUser(userId);
        return {
          hasConnection: false,
          needsRefresh: true,
          refreshed: false,
          invalidated: true,
          error: 'No refresh token available',
        };
      }
    } catch (error) {
      return {
        hasConnection: false,
        needsRefresh: false,
        refreshed: false,
        invalidated: false,
        error: (error as Error).message,
      };
    }
  }

  public isValidationRunning(): boolean {
    return this.isRunning;
  }

  public getNextValidationTime(): Date | null {
    if (!this.cronJob) {
      return null;
    }

    // Get next scheduled time (next hour at minute 0)
    const now = new Date();
    const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
    return nextRun;
  }
}

export default new SpotifyTokenValidationService();