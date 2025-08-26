import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redis';

/**
 * Custom error class for JWT token validation failures
 */
export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

/**
 * JWT Configuration interface
 */
export interface JWTConfig {
  secret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
}

/**
 * User information for token generation
 */
export interface TokenUser {
  id: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
}

/**
 * JWT payload structure
 */
export interface TokenPayload {
  sub: string; // Subject (user ID)
  email: string;
  name?: string;
  emailVerified?: boolean;
  iat: number; // Issued at
  exp: number; // Expires at
  iss: string; // Issuer
  aud: string; // Audience
}

/**
 * Refresh token data stored in Redis
 */
export interface RefreshTokenData {
  token: string;
  userId: string;
  deviceInfo?: string;
  issuedAt: string;
  expiresAt: string;
  userData: TokenUser;
}

/**
 * Token pair returned from token generation/refresh
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Default JWT configuration from environment
 */
export const DEFAULT_JWT_CONFIG: JWTConfig = {
  secret: process.env.JWT_SECRET || 'default-dev-secret-change-in-production',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'musicez-api',
  audience: 'musicez-client',
};

/**
 * Generates a JWT access token for a user
 * 
 * @param user - User information to include in token
 * @param config - JWT configuration
 * @returns Promise<string> - Signed JWT access token
 * @throws {Error} If user data is invalid or token generation fails
 */
export async function generateAccessToken(
  user: TokenUser, 
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<string> {
  // Input validation
  if (!user || typeof user !== 'object') {
    throw new Error('User data is required');
  }

  if (!user.id || typeof user.id !== 'string' || user.id.trim() === '') {
    throw new Error('User ID is required');
  }

  if (!user.email || typeof user.email !== 'string' || user.email.trim() === '') {
    throw new Error('User email is required');
  }

  if (!config.secret || config.secret.trim() === '') {
    throw new Error('JWT secret is required');
  }

  if (!config.accessTokenExpiry) {
    throw new Error('Access token expiry is required');
  }

  if (!config.issuer || config.issuer.trim() === '' || !config.audience || config.audience.trim() === '') {
    throw new Error('JWT issuer and audience are required');
  }

  try {
    // Create payload
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified || false,
    };

    // Sign token with configuration
    const token = jwt.sign(payload, config.secret, {
      expiresIn: config.accessTokenExpiry,
      issuer: config.issuer,
      audience: config.audience,
      algorithm: 'HS256',
    } as jwt.SignOptions);

    return token;
  } catch (error) {
    throw new Error(`Failed to generate access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a refresh token and stores it in Redis
 * 
 * @param userData - User data for the refresh token
 * @param config - JWT configuration
 * @param deviceInfo - Optional device information for tracking
 * @returns Promise<RefreshTokenData> - Generated refresh token data
 * @throws {Error} If token generation or storage fails
 */
export async function generateRefreshToken(
  userData: TokenUser,
  config: JWTConfig = DEFAULT_JWT_CONFIG,
  deviceInfo?: string
): Promise<RefreshTokenData> {
  // Input validation
  if (!userData || typeof userData !== 'object') {
    throw new Error('User data is required');
  }

  if (!userData.id || typeof userData.id !== 'string' || userData.id.trim() === '') {
    throw new Error('User ID is required');
  }

  if (!userData.email || typeof userData.email !== 'string' || userData.email.trim() === '') {
    throw new Error('User email is required');
  }

  if (!config.refreshTokenExpiry) {
    throw new Error('Refresh token expiry is required');
  }

  try {
    // Generate UUID-based refresh token
    const token = uuidv4();
    
    // Calculate expiration time
    const issuedAt = new Date();
    const expiresAt = new Date();
    
    // Parse expiry (simple implementation for common formats)
    const expiry = config.refreshTokenExpiry;
    if (expiry.endsWith('d')) {
      const days = parseInt(expiry.slice(0, -1));
      expiresAt.setDate(expiresAt.getDate() + days);
    } else if (expiry.endsWith('h')) {
      const hours = parseInt(expiry.slice(0, -1));
      expiresAt.setHours(expiresAt.getHours() + hours);
    } else if (expiry.endsWith('m')) {
      const minutes = parseInt(expiry.slice(0, -1));
      expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
    } else {
      // Default to 7 days if format not recognized
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    // Create refresh token data
    const refreshTokenData: RefreshTokenData = {
      token,
      userId: userData.id,
      deviceInfo,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      userData,
    };

    // Store in Redis with TTL
    const ttlSeconds = Math.floor((expiresAt.getTime() - issuedAt.getTime()) / 1000);
    const redisKey = `refresh_token:${userData.id}:${token}`;
    
    await redis.setex(redisKey, ttlSeconds, JSON.stringify(refreshTokenData));

    return refreshTokenData;
  } catch (error) {
    if (error instanceof Error && error.message && error.message.includes('Redis')) {
      throw new Error(`Failed to store refresh token: ${error.message}`);
    }
    throw new Error(`Failed to generate refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validates a JWT access token
 * 
 * @param token - JWT token to validate
 * @param config - JWT configuration
 * @returns Promise<TokenPayload> - Validated token payload
 * @throws {TokenValidationError} If token is invalid or expired
 */
export async function validateToken(
  token: string,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<TokenPayload> {
  // Input validation
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new TokenValidationError('Token is required');
  }

  if (!config.secret) {
    throw new TokenValidationError('JWT secret is required for validation');
  }

  try {
    // Verify and decode token
    const decoded = jwt.verify(token, config.secret, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['HS256'],
    }) as TokenPayload;

    // Additional validation
    if (!decoded.sub) {
      throw new TokenValidationError('Token missing user ID (sub claim)');
    }

    if (!decoded.email) {
      throw new TokenValidationError('Token missing email claim');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenValidationError('Token has expired');
      } else if (error instanceof jwt.NotBeforeError) {
        throw new TokenValidationError('Token is not active yet');
      } else {
        throw new TokenValidationError(`Invalid token: ${error.message}`);
      }
    }
    
    throw new TokenValidationError(`Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Refreshes tokens using a valid refresh token
 * 
 * @param refreshToken - Valid refresh token UUID
 * @param config - JWT configuration
 * @returns Promise<TokenPair> - New access and refresh tokens
 * @throws {Error} If refresh token is invalid or expired
 */
export async function refreshTokens(
  refreshToken: string,
  config: JWTConfig = DEFAULT_JWT_CONFIG
): Promise<TokenPair> {
  // Input validation
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error('Refresh token is required');
  }

  // Validate UUID format
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(refreshToken)) {
    throw new Error('Invalid refresh token format');
  }

  try {
    // Find refresh token in Redis
    const keys = await redis.keys(`refresh_token:*:${refreshToken}`);
    
    if (keys.length === 0) {
      throw new Error('Invalid refresh token');
    }

    if (keys.length > 1) {
      // Should not happen, but handle gracefully
      throw new Error('Ambiguous refresh token');
    }

    const redisKey = keys[0];
    const tokenDataStr = await redis.get(redisKey);
    
    if (!tokenDataStr) {
      throw new Error('Invalid refresh token');
    }

    // Parse token data
    const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
    
    // Check expiration
    const expiresAt = new Date(tokenData.expiresAt);
    const now = new Date();
    
    if (expiresAt <= now) {
      // Clean up expired token
      await redis.del(redisKey);
      throw new Error('Refresh token expired');
    }

    // Get user data from stored token data
    const userData = tokenData.userData;
    
    // Generate new tokens
    const newAccessToken = await generateAccessToken(userData, config);
    const newRefreshTokenData = await generateRefreshToken(userData, config, tokenData.deviceInfo);

    // Invalidate old refresh token
    await redis.del(redisKey);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenData.token,
    };
  } catch (error) {
    if (error instanceof Error && error.message && (
      error.message.includes('Invalid refresh token') ||
      error.message.includes('expired') ||
      error.message.includes('Ambiguous')
    )) {
      throw error;
    }
    
    throw new Error(`Failed to refresh tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Revokes a specific refresh token
 * 
 * @param refreshToken - Refresh token to revoke
 * @returns Promise<boolean> - True if token was revoked, false if not found
 */
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new Error('Refresh token is required');
  }

  try {
    const keys = await redis.keys(`refresh_token:*:${refreshToken}`);
    
    if (keys.length === 0) {
      return false;
    }

    // Delete all matching keys
    for (const key of keys) {
      await redis.del(key);
    }

    return true;
  } catch (error) {
    throw new Error(`Failed to revoke refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Revokes all refresh tokens for a user
 * 
 * @param userId - User ID whose tokens should be revoked
 * @returns Promise<number> - Number of tokens revoked
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required');
  }

  try {
    const keys = await redis.keys(`refresh_token:${userId}:*`);
    
    if (keys.length === 0) {
      return 0;
    }

    // Delete all user's refresh tokens
    for (const key of keys) {
      await redis.del(key);
    }

    return keys.length;
  } catch (error) {
    throw new Error(`Failed to revoke user tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets token expiration time from JWT payload
 * 
 * @param token - JWT token
 * @returns Date - Expiration date
 * @throws {Error} If token is malformed
 */
export function getTokenExpiration(token: string): Date {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is required');
  }

  try {
    // Decode without verification (just to read expiration)
    const decoded = jwt.decode(token) as TokenPayload;
    
    if (!decoded || !decoded.exp) {
      throw new Error('Invalid token format');
    }

    return new Date(decoded.exp * 1000);
  } catch (error) {
    throw new Error(`Failed to get token expiration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a token is expired without validation
 * 
 * @param token - JWT token
 * @returns boolean - True if expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const expiration = getTokenExpiration(token);
    return expiration <= new Date();
  } catch {
    // If we can't read expiration, assume expired
    return true;
  }
}

/**
 * Creates a JWT configuration from environment variables
 * 
 * @returns JWTConfig - Configuration object
 */
export function createJWTConfig(): JWTConfig {
  return {
    secret: process.env.JWT_SECRET || DEFAULT_JWT_CONFIG.secret,
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || DEFAULT_JWT_CONFIG.accessTokenExpiry,
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || DEFAULT_JWT_CONFIG.refreshTokenExpiry,
    issuer: process.env.JWT_ISSUER || DEFAULT_JWT_CONFIG.issuer,
    audience: process.env.JWT_AUDIENCE || DEFAULT_JWT_CONFIG.audience,
  };
}

// Types are exported above with their definitions