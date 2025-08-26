import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { 
  validateRequest,
  registerRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  logoutRequestSchema,
  logoutAllRequestSchema,
  type RegisterRequest,
  type LoginRequest,
  type RefreshTokenRequest,
  type LogoutRequest,
  type LogoutAllRequest
} from '../schemas/auth.schemas';
import { hashPassword, comparePassword } from '../utils/password-security';
import { 
  generateAccessToken, 
  generateRefreshToken,
  refreshTokens,
  revokeRefreshToken,
  revokeAllUserTokens,
  type TokenUser
} from '../utils/jwt-token';
import logger from '../utils/logger';
import { redis } from '../config/redis';
import { config } from '../config/environment';

const router = Router();
const prisma = new PrismaClient();

// Enhanced rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // Skip rate limiting in test environment
    return config.app.isTest;
  },
});

// More restrictive rate limiting for failed login attempts
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per window
  message: {
    success: false,
    error: {
      code: 'LOGIN_RATE_LIMIT_EXCEEDED',
      message: 'Too many failed login attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // Skip rate limiting in test environment
    return config.app.isTest;
  },
  // Only apply rate limiting on failed requests
  skipSuccessfulRequests: true,
});

// Helper function to generate standard API response
const apiResponse = (success: boolean, data?: any, error?: any) => ({
  success,
  data: data || undefined,
  error: error || undefined,
  timestamp: new Date().toISOString()
});

// Register endpoint
router.post(
  '/register',
  authRateLimit,
  validateRequest(registerRequestSchema),
  async (req: Request<{}, any, RegisterRequest>, res: Response) => {
    try {
      const { email, password, name } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        return res.status(400).json(apiResponse(
          false,
          null,
          {
            code: 'USER_ALREADY_EXISTS',
            message: 'A user with this email already exists',
            field: 'email'
          }
        ));
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true
        }
      });

      // Ensure email is not null for token creation
      if (!user.email) {
        throw new Error('User email is required for token creation');
      }

      // Create TokenUser object for JWT functions
      const tokenUser: TokenUser = {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined
      };

      // Generate tokens
      const accessToken = await generateAccessToken(tokenUser);
      const refreshTokenData = await generateRefreshToken(tokenUser);

      // Store refresh token in Redis
      await redis.setex(
        `refresh_token:${user.id}:${refreshTokenData.token}`,
        30 * 24 * 60 * 60, // 30 days
        JSON.stringify({
          userData: tokenUser,
          deviceInfo: req.get('User-Agent'),
          issuedAt: refreshTokenData.issuedAt,
          expiresAt: refreshTokenData.expiresAt
        })
      );

      logger.info('User registered successfully', { 
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(201).json(apiResponse(
        true,
        {
          user,
          tokens: {
            accessToken,
            refreshToken: refreshTokenData.token,
            expiresIn: config.security.jwt.expiresIn
          }
        }
      ));

    } catch (error) {
      logger.error('Registration failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        email: req.body?.email,
        ip: req.ip 
      });
      
      return res.status(500).json(apiResponse(
        false,
        null,
        {
          code: 'REGISTRATION_FAILED',
          message: 'Registration failed. Please try again.'
        }
      ));
    }
  }
);

// Login endpoint
router.post(
  '/login',
  loginRateLimit,
  validateRequest(loginRequestSchema),
  async (req: Request<{}, any, LoginRequest>, res: Response) => {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { 
          email: email.toLowerCase()
        }
      });

      if (!user || !await comparePassword(password, user.password)) {
        logger.warn('Failed login attempt', {
          email,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        return res.status(401).json(apiResponse(
          false,
          null,
          {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        ));
      }

      // Ensure email is not null for token creation
      if (!user.email) {
        throw new Error('User email is required for token creation');
      }

      // Create TokenUser object for JWT functions
      const tokenUser: TokenUser = {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        emailVerified: user.emailVerified
      };

      // Generate tokens
      const accessToken = await generateAccessToken(tokenUser);
      const refreshTokenData = await generateRefreshToken(tokenUser);

      // Store refresh token in Redis
      await redis.setex(
        `refresh_token:${user.id}:${refreshTokenData.token}`,
        30 * 24 * 60 * 60, // 30 days
        JSON.stringify({
          userData: tokenUser,
          deviceInfo: req.get('User-Agent'),
          issuedAt: refreshTokenData.issuedAt,
          expiresAt: refreshTokenData.expiresAt
        })
      );

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.json(apiResponse(
        true,
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            lastLoginAt: new Date()
          },
          tokens: {
            accessToken,
            refreshToken: refreshTokenData.token,
            expiresIn: config.security.jwt.expiresIn
          }
        }
      ));

    } catch (error) {
      logger.error('Login failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: req.body?.email,
        ip: req.ip
      });
      
      return res.status(500).json(apiResponse(
        false,
        null,
        {
          code: 'LOGIN_FAILED',
          message: 'Login failed. Please try again.'
        }
      ));
    }
  }
);

// Refresh token endpoint
router.post(
  '/refresh',
  authRateLimit,
  validateRequest(refreshTokenRequestSchema),
  async (req: Request<{}, any, RefreshTokenRequest>, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      const tokens = await refreshTokens(refreshToken);

      logger.info('Tokens refreshed successfully', {
        ip: req.ip
      });

      return res.json(apiResponse(
        true, 
        {
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: config.security.jwt.expiresIn
          }
        }
      ));

    } catch (error) {
      logger.error('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });
      
      return res.status(401).json(apiResponse(
        false,
        null,
        {
          code: 'INVALID_REFRESH_TOKEN',
          message: error instanceof Error ? error.message : 'Token refresh failed'
        }
      ));
    }
  }
);

// Logout endpoint
router.post(
  '/logout',
  authRateLimit,
  validateRequest(logoutRequestSchema),
  async (req: Request<{}, any, LogoutRequest>, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      const success = await revokeRefreshToken(refreshToken);
      
      if (!success) {
        return res.status(400).json(apiResponse(
          false,
          null,
          {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid refresh token'
          }
        ));
      }

      logger.info('User logged out successfully', {
        ip: req.ip
      });

      return res.json(apiResponse(
        true,
        {
          message: 'Logged out successfully'
        }
      ));

    } catch (error) {
      logger.error('Logout failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });
      
      return res.status(500).json(apiResponse(
        false,
        null,
        {
          code: 'LOGOUT_FAILED',
          message: 'Logout failed. Please try again.'
        }
      ));
    }
  }
);

// Logout from all devices endpoint
router.post(
  '/logout-all',
  authRateLimit,
  validateRequest(logoutAllRequestSchema),
  async (req: Request<{}, any, LogoutAllRequest>, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      // First, we need to find the user ID from the refresh token
      const keys = await redis.keys(`refresh_token:*:${refreshToken}`);
      if (keys.length === 0) {
        return res.status(400).json(apiResponse(
          false,
          null,
          {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid refresh token'
          }
        ));
      }
      
      // Extract user ID from the key pattern: refresh_token:userId:token
      const userIdMatch = keys[0].match(/^refresh_token:([^:]+):/);
      if (!userIdMatch) {
        return res.status(400).json(apiResponse(
          false,
          null,
          {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid refresh token format'
          }
        ));
      }
      
      const userId = userIdMatch[1];
      const tokensRevoked = await revokeAllUserTokens(userId);

      logger.info('User logged out from all devices', {
        userId,
        tokensRevoked,
        ip: req.ip
      });

      return res.json(apiResponse(
        true,
        {
          message: 'Logged out from all devices successfully',
          tokensRevoked
        }
      ));

    } catch (error) {
      logger.error('Logout all failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });
      
      return res.status(500).json(apiResponse(
        false,
        null,
        {
          code: 'LOGOUT_ALL_FAILED',
          message: 'Logout from all devices failed. Please try again.'
        }
      ));
    }
  }
);

export default router;