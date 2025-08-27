# Anti-Patterns

## Overview

This document captures patterns, practices, and approaches that should be avoided in the MusicEZ project. Each anti-pattern includes the mistake, why it's problematic, and the correct alternative approach.

## Database Anti-Patterns

### ❌ Creating New PrismaClient Instances

**Wrong Approach**:
```typescript
import { PrismaClient } from '@prisma/client';

export class ApiKeyController {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient(); // DON'T DO THIS
  }
}
```

**Why It's Wrong**:
- Creates multiple database connections
- Wastes connection pool resources
- Ignores established singleton pattern
- Complicates testing and mocking
- May cause connection limit issues

**Correct Approach**:
```typescript
import { prisma } from '../database/prisma';

export class ApiKeyController {
  constructor() {
    // Use centralized singleton - no client needed
  }

  async createApiKey() {
    return await prisma.apiKey.create({ /* ... */ });
  }
}
```

### ❌ Direct Database Client Access in Tests

**Wrong Approach**:
```typescript
// In tests
const mockPrismaClient = {
  apiKey: {
    create: jest.fn(),
    // ...
  },
} as unknown as jest.Mocked<PrismaClient>;

controller = new ApiKeyController(mockPrismaClient);
```

**Why It's Wrong**:
- Doesn't match production constructor signature
- Requires different test setup than production
- Creates maintenance burden when patterns change

**Correct Approach**:
```typescript
// Mock the entire module
jest.mock('../../src/database/prisma', () => ({
  prisma: {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      // ...
    },
  },
}));

controller = new ApiKeyController(); // Same as production
```

## Import Anti-Patterns

### ❌ Inconsistent Import Organization

**Wrong Approach**:
```typescript
import { hashApiKey } from '../utils/api-key-security';
import { Request, Response } from 'express';
import { prisma } from '../database/prisma';
import { PrismaClient } from '@prisma/client';
```

**Why It's Wrong**:
- Mixed import types and sources
- Hard to scan and maintain
- Inconsistent with project conventions

**Correct Approach**:
```typescript
// 1. External dependencies first
import { Request, Response, NextFunction } from 'express';

// 2. Internal absolute imports
import { prisma } from '../database/prisma';

// 3. Relative utility imports
import { hashApiKey } from '../utils/api-key-security';
import logger from '../utils/logger';
```

### ❌ Deep Relative Import Paths

**Wrong Approach**:
```typescript
import { config } from '../../../config/environment';
import { prisma } from '../../../database/prisma';
```

**Why It's Wrong**:
- Brittle to file structure changes
- Hard to read and maintain
- Indicates poor file organization

**Correct Approach**:
```typescript
// Keep imports at reasonable depths (max 2 levels up)
import { config } from '../config/environment';
import { prisma } from '../database/prisma';

// Or reorganize files to reduce nesting
```

## Constructor Anti-Patterns

### ❌ Dependency Injection for Singletons

**Wrong Approach**:
```typescript
export class SearchController {
  private prisma: PrismaClient;
  private redis: RedisClient;

  constructor(
    prismaClient?: PrismaClient,
    redisClient?: RedisClient
  ) {
    this.prisma = prismaClient || new PrismaClient();
    this.redis = redisClient || new RedisClient();
  }
}
```

**Why It's Wrong**:
- Unnecessary complexity for singleton services
- Creates inconsistency between test and production
- Violates established architectural patterns

**Correct Approach**:
```typescript
import { prisma } from '../database/prisma';
import { redis } from '../config/redis';

export class SearchController {
  constructor() {
    // Use established singletons directly
  }

  async search() {
    const results = await prisma.song.findMany();
    await redis.setex(key, ttl, JSON.stringify(results));
  }
}
```

## Testing Anti-Patterns

### ❌ Incomplete Mock Setup

**Wrong Approach**:
```typescript
const mockPrisma = {
  apiKey: {
    create: jest.fn(),
    // Missing other methods that will be called
  }
} as any;
```

**Why It's Wrong**:
- Tests fail when new methods are called
- Incomplete representation of the interface
- Brittle to implementation changes

**Correct Approach**:
```typescript
jest.mock('../../src/database/prisma', () => ({
  prisma: {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));
```

### ❌ Hardcoded Test Expectations

**Wrong Approach**:
```typescript
expect(logger.error).toHaveBeenCalledWith('API key creation failed', {
  error: 'Database connection failed',
  stack: expect.any(String),
  name: 'Test API',
  ip: '127.0.0.1',
  requestId: 'test-req-123',
  // Missing processingTime and other dynamic fields
});
```

**Why It's Wrong**:
- Tests break when log format changes slightly
- Ignores dynamic fields like timing
- Too rigid for evolving code

**Correct Approach**:
```typescript
expect(logger.error).toHaveBeenCalledWith(
  'API key creation failed', 
  expect.objectContaining({
    error: 'Database connection failed',
    stack: expect.any(String),
    name: 'Test API',
    processingTime: expect.any(Number),
    ip: '127.0.0.1',
    requestId: 'test-req-123',
  })
);
```

## Error Handling Anti-Patterns

### ❌ Generic Error Responses

**Wrong Approach**:
```typescript
} catch (error) {
  res.status(500).json({
    error: 'Something went wrong'
  });
}
```

**Why It's Wrong**:
- No request context or traceability
- Unhelpful for debugging
- Inconsistent error format

**Correct Approach**:
```typescript
} catch (error) {
  const processingTime = Date.now() - startTime;
  
  logger.error('API key creation failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    requestId,
    processingTime,
  });

  const errorResponse = apiKeyErrorResponses.internalError(requestId);
  const statusCode = getHttpStatusForError(errorResponse.error.code);
  res.status(statusCode).json(errorResponse);
}
```

### ❌ Inconsistent Status Codes

**Wrong Approach**:
```typescript
if (duplicateFound) {
  res.status(400).json({ error: 'Duplicate name' }); // Should be 409
}

if (notFound) {
  res.status(500).json({ error: 'Not found' }); // Should be 404
}
```

**Why It's Wrong**:
- Misleading HTTP semantics
- Inconsistent client error handling
- Poor API design

**Correct Approach**:
```typescript
if (duplicateFound) {
  const errorResponse = apiKeyErrorResponses.duplicateName(name, requestId);
  const statusCode = getHttpStatusForError(errorResponse.error.code); // 409
  res.status(statusCode).json(errorResponse);
}

if (notFound) {
  const errorResponse = apiKeyErrorResponses.notFound(requestId);
  const statusCode = getHttpStatusForError(errorResponse.error.code); // 404
  res.status(statusCode).json(errorResponse);
}
```

## Logging Anti-Patterns

### ❌ Unstructured Logging

**Wrong Approach**:
```typescript
console.log('User created API key: ' + name);
logger.info(`Error occurred: ${error.message}`);
```

**Why It's Wrong**:
- Hard to parse programmatically
- Missing context and correlation IDs
- Inconsistent format

**Correct Approach**:
```typescript
logger.info('API key created successfully', {
  id: apiKey.id,
  name: apiKey.name,
  userId: req.user?.id,
  ip: req.ip,
  requestId,
  processingTime
});
```

### ❌ Logging Sensitive Data

**Wrong Approach**:
```typescript
logger.info('API key details', {
  name: apiKey.name,
  key: apiKey.key, // DON'T LOG RAW KEYS
  hashedKey: hashedKey
});
```

**Why It's Wrong**:
- Security risk - credentials in logs
- Compliance violations
- Data breach potential

**Correct Approach**:
```typescript
logger.info('API key created', {
  id: apiKey.id,
  name: apiKey.name,
  keyLength: apiKey.key.length,
  // Never log the actual key value
});
```

## Architecture Anti-Patterns

### ❌ Mixed Responsibilities in Controllers

**Wrong Approach**:
```typescript
export class ApiKeyController {
  async createApiKey(req, res) {
    // Validation logic
    if (!req.body.name) return res.status(400).json({...});
    
    // Database logic
    const hashedKey = await bcrypt.hash(req.body.key, 10);
    
    // Email logic
    await sendEmail(user.email, 'API key created');
    
    // Response formatting
    res.json({ success: true, data: result });
  }
}
```

**Why It's Wrong**:
- Mixed concerns in single method
- Hard to test individual components
- Violates separation of responsibilities

**Correct Approach**:
```typescript
export class ApiKeyController {
  async createApiKey(req, res) {
    // Use established utilities for each concern
    const validatedData = validateApiKeyRequest(req.body);
    const hashedKey = await hashApiKey(validatedData.key);
    const result = await prisma.apiKey.create({...});
    const response = formatApiKeySuccessResponse(result, requestId);
    
    res.status(201).json(response);
  }
}
```

## Configuration Anti-Patterns

### ❌ Direct process.env Access

**Wrong Approach**:
```typescript
if (process.env.NODE_ENV === 'development') {
  // Development logic
}

const dbUrl = process.env.DATABASE_URL;
```

**Why It's Wrong**:
- No validation or type safety
- Scattered configuration access
- Hard to track environment dependencies

**Correct Approach**:
```typescript
import { config } from '../config/environment';

if (config.app.isDevelopment) {
  // Development logic
}

const dbUrl = config.database.url;
```

## Performance Anti-Patterns

### ❌ Synchronous Operations in Async Context

**Wrong Approach**:
```typescript
async function processApiKeys() {
  for (const key of apiKeys) {
    await processKey(key); // Sequential processing
  }
}
```

**Why It's Wrong**:
- Unnecessary serialization
- Poor performance for independent operations
- Blocks other operations

**Correct Approach**:
```typescript
async function processApiKeys() {
  await Promise.all(
    apiKeys.map(key => processKey(key))
  );
}
```

## Validation Anti-Patterns

### ❌ Inline Validation Logic in Controllers

**Wrong Approach**:
```typescript
export class ApiKeyController {
  async createApiKey(req, res) {
    // Inline validation in controller
    if (!req.body.name || req.body.name.length < 2) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    
    if (!req.body.key || req.body.key.length < 8) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    
    // Continue with business logic...
  }
}
```

**Why It's Wrong**:
- Mixes validation with business logic
- Inconsistent error response formats
- Hard to reuse validation rules
- Makes controllers bloated and hard to test

**Correct Approach**:
```typescript
// Use middleware for validation
router.post('/', 
  validateApiKeyRequest(apiKeyRequestSchema),
  controller.createApiKey
);

// Controller focuses on business logic only
export class ApiKeyController {
  async createApiKey(req, res) {
    const { name, key, active }: ApiKeyRequest = req.body; // Already validated
    // Pure business logic...
  }
}
```

### ❌ Inconsistent Error Response Formats

**Wrong Approach**:
```typescript
// Different error formats across endpoints
return res.status(400).json({ error: 'Bad request' });
return res.status(404).json({ message: 'Not found', success: false });
return res.status(500).json({ err: 'Server error', code: 500 });
```

**Why It's Wrong**:
- Inconsistent client experience
- Hard to handle errors programmatically
- No correlation or debugging information

**Correct Approach**:
```typescript
// Use standardized error formatters
const errorResponse = apiKeyErrorResponses.notFound(requestId);
const statusCode = getHttpStatusForError(errorResponse.error.code);
res.status(statusCode).json(errorResponse);

// All errors have consistent structure:
{
  success: false,
  error: {
    code: "API_KEY_NOT_FOUND",
    message: "API key with the specified ID was not found",
    field: "id"
  },
  timestamp: "2025-08-26T10:00:00Z",
  requestId: "req-123"
}
```

## Security Anti-Patterns

### ❌ Storing Plaintext Sensitive Data

**Wrong Approach**:
```typescript
// Storing API keys in plaintext
await prisma.apiKey.create({
  data: {
    key: req.body.key, // DON'T store plaintext
    name: req.body.name
  }
});

// Logging sensitive values
logger.info('API key created', {
  name: result.name,
  key: result.key // DON'T log actual keys
});
```

**Why It's Wrong**:
- Major security vulnerability
- Compliance violations
- Data breach risk
- Sensitive data in logs

**Correct Approach**:
```typescript
// Always hash sensitive data
const hashedKey = await hashApiKey(req.body.key);
await prisma.apiKey.create({
  data: {
    key: hashedKey, // Store hash only
    name: req.body.name
  }
});

// Log metadata, never sensitive values
logger.info('API key created', {
  id: result.id,
  name: result.name,
  keyLength: req.body.key.length // Safe metadata
});
```

### ❌ Missing Request Context in Logs

**Wrong Approach**:
```typescript
logger.error('Operation failed', {
  error: error.message
  // Missing context for debugging
});
```

**Why It's Wrong**:
- Hard to debug issues
- No correlation across requests
- Missing audit trail information

**Correct Approach**:
```typescript
logger.error('API key creation failed', {
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
  name: req.body?.name,
  processingTime,
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  requestId,
  timestamp: new Date().toISOString()
});
```

## Summary

These anti-patterns represent actual mistakes encountered during development and should be actively avoided. Each pattern includes context about why it's problematic and clear alternatives that follow established project conventions.

When implementing new features:
1. ✅ **Reference established patterns** in code-patterns.md
2. ✅ **Check this anti-patterns list** before implementation  
3. ✅ **Use existing utilities and singletons**
4. ✅ **Follow import and organization conventions**
5. ✅ **Test with proper mocking strategies**

This helps maintain architectural integrity and prevents regression to problematic approaches.

## Service Integration Anti-Patterns

### ❌ Dependency Injection for External Services Using Centralized Clients

**Wrong Approach**:
```typescript
// In OpenAI service implementation
export class OpenAIRecommendationService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.openaiClient = new OpenAI({...});
  }
}

// In tests
const mockPrisma = {
  song: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

service = new OpenAIRecommendationService(mockPrisma as any);
```

**Why It's Wrong**:
- Violates established singleton pattern for database client
- Creates inconsistency with other services that use centralized prisma
- Complicates testing by requiring dependency injection in tests but not production
- Creates multiple potential database connections instead of using connection pooling
- Makes service instantiation different between test and production environments

**Correct Approach**:
```typescript
// Use centralized singleton like other services
import { prisma } from '../database/prisma';

export class OpenAIRecommendationService {
  constructor() {
    this.openaiClient = new OpenAI({...});
  }

  public async generateRecommendations(songId: string) {
    const inputSong = await prisma.song.findUnique({
      where: { id: songId },
    });
    // ... rest of implementation
  }
}

// Test mocking at module level
jest.mock('../../src/database/prisma', () => ({
  prisma: {
    song: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    aIRecommendation: {
      createMany: jest.fn(),
    },
  },
}));

service = new OpenAIRecommendationService(); // Same as production
```

### ❌ Inconsistent Service Constructor Patterns

**Wrong Approach**:
```typescript
// Mix of dependency injection and direct imports
export class OpenAIRecommendationService {
  constructor(prisma: PrismaClient) { // DI for one dependency
    this.prisma = prisma;
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey, // Direct import for config
    });
    // Direct import for redis in methods
  }
  
  async cacheRecommendations() {
    await redis.setex(key, ttl, data); // Direct redis import
  }
}
```

**Why It's Wrong**:
- Inconsistent dependency management strategy
- Some dependencies injected, others used directly
- Makes testing and mocking inconsistent
- Violates single responsibility for dependency management

**Correct Approach**:
```typescript
// Consistent use of centralized singletons
import { prisma } from '../database/prisma';
import { redis } from '../config/redis';
import { config } from '../config/environment';

export class OpenAIRecommendationService {
  constructor() {
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  
  async generateRecommendations() {
    await prisma.song.findUnique({...});
  }
  
  async cacheRecommendations() {
    await redis.setex(key, ttl, data);
  }
}
```

### ❌ Missing Error Context in External API Services

**Wrong Approach**:
```typescript
try {
  const response = await this.openaiClient.chat.completions.create({...});
  return response;
} catch (error) {
  logger.error('OpenAI call failed', { error: error.message });
  throw new Error('API call failed'); // Generic error, lost context
}
```

**Why It's Wrong**:
- Loses specific OpenAI error information (rate limits, timeouts, server errors)
- Generic error handling that doesn't help with debugging or retry logic
- Missing service-specific context (songId, processing time, etc.)
- No error categorization for different types of failures

**Correct Approach**:
```typescript
try {
  const response = await this.openaiClient.chat.completions.create({...});
  return response;
} catch (error) {
  const processingTime = Date.now() - startTime;
  
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      logger.error('OpenAI API timeout during recommendation generation', {
        songId,
        processingTime,
        error: error.message,
      });
      throw new OpenAIRecommendationError('OpenAI API request timeout', 408, error);
    }

    if ('status' in error && (error as any).status === 429) {
      logger.warn('OpenAI API rate limit hit', { songId, processingTime });
      throw new OpenAIRecommendationError('OpenAI API rate limit exceeded', 429, error);
    }

    // More specific error handling...
  }
}

## Mobile Authentication Anti-Patterns

### ❌ Storing Access Tokens in Persistent Storage

**Wrong Approach**:
```typescript
// DON'T store access tokens persistently
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ❌ NEVER DO THIS
await AsyncStorage.setItem('access_token', accessToken);
await SecureStore.setItemAsync('access_token', accessToken);

export class AuthService {
  async getAccessToken() {
    return await SecureStore.getItemAsync('access_token'); // ❌ Wrong
  }
}
```

**Why It's Wrong**:
- Access tokens should be short-lived and memory-only for security
- Persistent access tokens create security vulnerabilities
- Violates JWT security best practices
- Increases attack surface for token theft

**Correct Approach**:
```typescript
// ✅ CORRECT: Memory-only access tokens, persistent refresh tokens
export class AuthService {
  private accessToken: string | null = null; // Memory only
  private readonly REFRESH_TOKEN_KEY = 'musicez_refresh_token';

  async storeTokens(tokens: TokenPair) {
    this.accessToken = tokens.accessToken; // Memory only
    await SecureStore.setItemAsync(this.REFRESH_TOKEN_KEY, tokens.refreshToken); // Secure storage
  }

  getAccessToken(): string | null {
    return this.accessToken; // From memory
  }
}
```

### ❌ Missing Token Refresh Race Condition Handling

**Wrong Approach**:
```typescript
// ❌ Multiple requests can trigger concurrent token refresh
this.apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Multiple requests hitting this simultaneously
      const newToken = await this.refreshAccessToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return this.apiClient(error.config);
    }
    return Promise.reject(error);
  }
);
```

**Why It's Wrong**:
- Multiple concurrent requests can trigger multiple refresh calls
- Race conditions can cause token refresh to fail
- Can lead to authentication loops or failures
- Poor user experience with inconsistent auth state

**Correct Approach**:
```typescript
// ✅ CORRECT: Proper race condition handling with request queuing
export class AuthService {
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
  }> = [];

  setupInterceptors() {
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Queue this request while refresh is in progress
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.apiClient(originalRequest);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await this.attemptTokenRefresh();
            this.processQueue(null, newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.apiClient(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError, null);
            this.clearAuthData();
          } finally {
            this.isRefreshing = false;
          }
        }
        return Promise.reject(error);
      }
    );
  }
}
```

### ❌ Incomplete Error Handling for Mobile Network Conditions

**Wrong Approach**:
```typescript
// ❌ Generic error handling ignoring mobile-specific issues
private handleApiError(error: any): ApiError {
  return {
    success: false,
    error: {
      code: 'API_ERROR',
      message: 'Something went wrong'
    },
    timestamp: new Date().toISOString()
  };
}
```

**Why It's Wrong**:
- Doesn't handle mobile network conditions (poor connectivity, timeouts)
- No distinction between different error types
- Unhelpful error messages for mobile users
- Missing context for debugging network issues

**Correct Approach**:
```typescript
// ✅ CORRECT: Comprehensive mobile error handling
private handleApiError(error: any): ApiError {
  if (error.response?.data) {
    return error.response.data as ApiError;
  }

  // Mobile-specific network error handling
  if (error.code === 'ECONNABORTED') {
    return {
      success: false,
      error: {
        code: 'NETWORK_TIMEOUT',
        message: 'Request timed out. Please check your connection and try again.',
      },
      timestamp: new Date().toISOString(),
    };
  }

  if (error.code === 'NETWORK_ERROR' || !error.response) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to the server. Please check your internet connection.',
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Status code specific handling
  const statusCode = error.response?.status || 500;
  return {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: `An unexpected error occurred (${statusCode}). Please try again later.`,
    },
    timestamp: new Date().toISOString(),
  };
}
```

### ❌ Not Implementing Graceful Logout with Cleanup

**Wrong Approach**:
```typescript
// ❌ Logout that can fail without cleaning local state
public async logout(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
  
  // This can throw and leave user in inconsistent state
  await this.apiClient.post(API_ENDPOINTS.LOGOUT, { refreshToken });
  
  // Cleanup only happens if API call succeeds
  this.accessToken = null;
  await SecureStore.deleteItemAsync(this.REFRESH_TOKEN_KEY);
}
```

**Why It's Wrong**:
- API failure prevents local cleanup
- User remains in authenticated state even after logout attempt
- Poor user experience when network issues occur during logout
- Inconsistent authentication state

**Correct Approach**:
```typescript
// ✅ CORRECT: Guaranteed local cleanup regardless of API success
public async logout(): Promise<void> {
  try {
    const refreshToken = await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);
    
    if (refreshToken) {
      const requestData: LogoutRequest = { refreshToken };
      await this.apiClient.post(API_ENDPOINTS.LOGOUT, requestData);
    }
  } catch (error) {
    // Log error but don't throw - we want to clear local data regardless
    console.warn('Logout API call failed:', error);
  } finally {
    // ALWAYS clear local authentication data
    await this.clearAuthData();
  }
}

private async clearAuthData(): Promise<void> {
  this.accessToken = null;
  await SecureStore.deleteItemAsync(this.REFRESH_TOKEN_KEY).catch(() => {
    // Ignore errors if key doesn't exist
  });
}
```

### ❌ Missing Mobile Configuration Management

**Wrong Approach**:
```typescript
// ❌ Hardcoded configuration scattered throughout service
export class AuthService {
  constructor() {
    this.apiClient = axios.create({
      baseURL: 'http://localhost:3000/api/v1', // Hardcoded
      timeout: 5000, // Hardcoded
    });
  }

  async login() {
    await this.apiClient.post('/auth/login'); // Hardcoded endpoint
  }
}
```

**Why It's Wrong**:
- No environment-specific configuration
- Hardcoded values difficult to change
- No central configuration management
- Poor separation of concerns

**Correct Approach**:
```typescript
// ✅ CORRECT: Centralized mobile configuration
// mobile/src/constants/config.ts
export const Config = {
  API_BASE_URL: Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:3000/api/v1',
  API_TIMEOUT: 10000,
  REFRESH_TOKEN_KEY: 'musicez_refresh_token',
} as const;

export const API_ENDPOINTS = {
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
} as const;

// AuthService uses centralized config
export class AuthService {
  constructor() {
    this.apiClient = axios.create({
      baseURL: Config.API_BASE_URL,
      timeout: Config.API_TIMEOUT,
    });
  }

  async login() {
    await this.apiClient.post(API_ENDPOINTS.LOGIN);
  }
}
```
```