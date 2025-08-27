# Code Patterns

## Overview

Established architectural patterns, conventions, and best practices for the MusicEZ project. These patterns should be followed by all agents and developers to ensure consistency and maintain architectural integrity.

## Database Patterns

### Centralized Prisma Client
**Location**: `src/database/prisma.ts`
**Pattern**: Singleton with global instance management

```typescript
// ✅ CORRECT: Always import from centralized client
import { prisma } from '../database/prisma';

// ❌ INCORRECT: Never create new instances
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // DON'T DO THIS
```

**Usage Examples**:
```typescript
// In controllers
import { prisma } from '../database/prisma';

export class ApiKeyController {
  constructor() {
    // No need for prisma client parameter - use singleton
  }
  
  async createApiKey() {
    const result = await prisma.apiKey.create({
      data: { /* ... */ }
    });
  }
}
```

**Rationale**: 
- Prevents multiple database connections
- Ensures consistent configuration
- Handles connection pooling properly
- Supports graceful shutdown

### Connection Management
```typescript
// Database health checks
await prisma.$queryRaw`SELECT 1`;

// Proper connection lifecycle
await connectDatabase(); // startup
await disconnectDatabase(); // shutdown
```

## Import Conventions

### Relative Import Patterns
```typescript
// ✅ Controller importing utilities
import { hashApiKey } from '../utils/api-key-security';
import { formatApiKeySuccessResponse } from '../utils/api-key-formatters';

// ✅ Test files importing source
import { ApiKeyController } from '../../src/controllers/api-key.controller';
```

### Import Organization
```typescript
// 1. Node.js built-ins (none in current project)
// 2. External dependencies
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

// 3. Internal absolute imports (database, config)
import { prisma } from '../database/prisma';
import { config } from '../config/environment';

// 4. Relative imports (utilities, helpers)
import { hashApiKey } from '../utils/api-key-security';
import logger from '../utils/logger';

// 5. Type-only imports
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
```

## Controller Patterns

### Constructor Pattern
```typescript
// ✅ CORRECT: Simple constructor using singletons
export class ApiKeyController {
  constructor() {
    // Using centralized services, no dependency injection needed
  }
}

// ❌ INCORRECT: Don't pass clients as parameters
export class ApiKeyController {
  constructor(prismaClient?: PrismaClient) { // DON'T DO THIS
    this.prisma = prismaClient || new PrismaClient();
  }
}
```

### Method Structure
```typescript
public methodName = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  const requestId = res.locals.requestId;

  try {
    // 1. Input extraction and logging
    const { param1, param2 } = req.body;
    logger.info('Operation initiated', { param1, param2, requestId });

    // 2. Business logic with database operations
    const result = await prisma.model.operation({
      // ...
    });

    // 3. Success logging with timing
    const processingTime = Date.now() - startTime;
    logger.info('Operation completed', { result: result.id, processingTime, requestId });

    // 4. Response formatting and sending
    const response = formatSuccessResponse(result, requestId);
    res.status(201).json(response);

  } catch (error) {
    // 5. Error handling with timing
    const processingTime = Date.now() - startTime;
    logger.error('Operation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime,
      requestId
    });

    const errorResponse = errorResponses.internalError(requestId);
    res.status(500).json(errorResponse);
  }
};
```

## Testing Patterns

### Mock Setup
```typescript
// ✅ CORRECT: Mock the entire module
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

// Import after mocking
import { prisma } from '../../src/database/prisma';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
```

### Test Structure
```typescript
describe('ControllerName', () => {
  let controller: ControllerName;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    controller = new ControllerName(); // Simple instantiation
    
    mockReq = {
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      locals: { requestId: 'test-req-123' },
    };

    mockNext = jest.fn();
  });
  
  // Tests...
});
```

## Utility Patterns

### Security Utilities
**Location**: `src/utils/api-key-security.ts`
```typescript
// Hashing utilities
export const hashApiKey = async (apiKey: string): Promise<string> => {
  return await bcrypt.hash(apiKey, API_KEY_SECURITY.hashSaltRounds);
};
```

### Response Formatters
**Location**: `src/utils/api-key-formatters.ts`
```typescript
// Standardized response formats
export const formatApiKeySuccessResponse = (
  apiKey: ApiKey, 
  requestId: string
): ApiKeySuccessResponse => {
  return {
    success: true,
    data: {
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: maskApiKey(apiKey.key), // Always mask keys in responses
        active: apiKey.active,
        createdAt: apiKey.createdAt.toISOString(),
        lastUsed: apiKey.lastUsed?.toISOString() || null,
      },
    },
    requestId,
    timestamp: new Date().toISOString(),
  };
};
```

## Logging Patterns

### Structured Logging
```typescript
// ✅ CORRECT: Structured logging with context
logger.info('Operation type', {
  key: 'value',
  userId: req.user?.id,
  ip: req.ip,
  requestId: res.locals.requestId,
  processingTime: Date.now() - startTime
});

// Audit logging for important operations
logger.info('API key audit', {
  action: 'CREATE',
  apiKeyId: result.id,
  name: result.name,
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  requestId,
  timestamp: new Date().toISOString(),
});
```

## Schema and Validation Patterns

### Zod Schema Organization
**Location**: `src/schemas/`
```typescript
// Request schemas
export const ApiKeyRequest = z.object({
  name: z.string().min(1).max(100),
  key: z.string().min(32).max(512),
  active: z.boolean().optional().default(true),
});

// Response schemas with proper typing
export type ApiKeySuccessResponse = z.infer<typeof ApiKeySuccessResponseSchema>;
```

## File Organization Patterns

### Directory Structure
```
src/
├── controllers/       # Route handlers and business logic
├── middleware/        # Express middleware functions
├── routes/           # Route definitions
├── utils/            # Utility functions and helpers
├── schemas/          # Validation schemas and types
├── config/           # Configuration files
├── database/         # Database client and utilities
└── server.ts         # Application entry point

tests/
├── controllers/      # Controller unit tests
├── utils/           # Utility function tests
├── routes/          # Integration tests
└── database/        # Database-related tests
```

### File Naming
- **Controllers**: `kebab-case.controller.ts`
- **Utilities**: `kebab-case.ts` or `kebab-case-purpose.ts`
- **Schemas**: `kebab-case.schemas.ts`
- **Tests**: `filename.test.ts` (matching source file name)

## Environment and Configuration

### Environment Variables
```typescript
// ✅ Configuration through environment module
import { config } from '../config/environment';

if (config.app.isDevelopment) {
  // Development-specific logic
}

// ❌ Don't access process.env directly in business logic
if (process.env.NODE_ENV === 'development') { // Avoid this
}
```

## Error Handling Patterns

### Standardized Error Responses
```typescript
// Use established error formatters
const errorResponse = apiKeyErrorResponses.notFound(requestId);
const statusCode = getHttpStatusForError(errorResponse.error.code);
res.status(statusCode).json(errorResponse);
```

### Error Classification
- **400**: Validation errors, malformed requests
- **401**: Authentication required
- **403**: Authorization failed  
- **404**: Resource not found
- **409**: Conflict (e.g., duplicate names)
- **500**: Internal server errors

## Performance Patterns

### Timing and Metrics
```typescript
const startTime = Date.now();
// ... operation ...
const processingTime = Date.now() - startTime;

logger.info('Operation completed', {
  processingTime,
  // other context
});
```

### Caching Patterns
```typescript
// Redis caching for expensive operations
const cacheKey = generateCacheKey(query, params);
let result = await redis.get(cacheKey);

if (!result) {
  result = await expensiveOperation();
  await redis.setex(cacheKey, TTL, JSON.stringify(result));
}
```

## Security Utility Patterns

### API Key Security
**Location**: `src/utils/api-key-security.ts`
```typescript
// ✅ CORRECT: Use specialized security utilities
import { hashApiKey, verifyApiKey } from '../utils/api-key-security';

// Hash for storage
const hashedKey = await hashApiKey(plainTextKey);

// Verify against hash
const isValid = await verifyApiKey(providedKey, storedHash);

// Generate secure keys
const newKey = generateSecureApiKey('spotify'); // sk_sp_...
```

### Security Best Practices
```typescript
// ✅ Always hash sensitive data before storage
const hashedKey = await hashApiKey(apiKey);
await prisma.apiKey.create({
  data: {
    key: hashedKey, // Store hash, never plaintext
    name: validatedName
  }
});

// ✅ Use custom error classes for security operations
try {
  const hash = await hashApiKey(key);
} catch (error) {
  if (error instanceof ApiKeySecurityError) {
    // Handle security-specific errors
  }
}

// ✅ Never log sensitive values
logger.info('API key created', {
  id: result.id,
  name: result.name,
  // key: result.key, // ❌ NEVER log actual keys
  keyLength: result.key.length // ✅ Safe metadata only
});
```

## Response Formatting Patterns

### Standardized API Responses
**Location**: `src/utils/api-key-formatters.ts`
```typescript
// ✅ CORRECT: Use established response formatters
import {
  formatApiKeySuccessResponse,
  formatApiKeyErrorResponse,
  apiKeyErrorResponses,
  getHttpStatusForError,
} from '../utils/api-key-formatters';

// Success responses
const response = formatApiKeySuccessResponse(apiKey, requestId);
res.status(201).json(response);

// Error responses with proper HTTP status codes
const errorResponse = apiKeyErrorResponses.notFound(requestId);
const statusCode = getHttpStatusForError(errorResponse.error.code);
res.status(statusCode).json(errorResponse);
```

### Response Format Consistency
```typescript
// ✅ All success responses follow this structure
{
  success: true,
  data: {
    // Domain object without sensitive data
    id: "uuid",
    name: "API Key Name",
    active: true,
    createdAt: "2025-08-26T10:00:00Z",
    updatedAt: "2025-08-26T10:00:00Z",
    lastUsed: null
  },
  timestamp: "2025-08-26T10:00:00Z",
  requestId: "req-123"
}

// ✅ All error responses follow this structure
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Descriptive error message",
    field: "fieldName", // Optional
    details: {...}      // Optional
  },
  timestamp: "2025-08-26T10:00:00Z",
  requestId: "req-123"
}
```

## Validation and Schema Patterns

### Zod Schema Architecture
**Location**: `src/schemas/api-key.schemas.ts`
```typescript
// ✅ CORRECT: Build complex schemas from reusable parts
export const apiKeyNameSchema = z.string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .trim()
  .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Invalid characters');

export const apiKeyRequestSchema = z.object({
  name: apiKeyNameSchema,
  key: apiKeyValueSchema,
  active: z.boolean().default(true),
});

// ✅ Export types for TypeScript integration
export type ApiKeyRequest = z.infer<typeof apiKeyRequestSchema>;
```

### Middleware Validation Pattern
```typescript
// ✅ CORRECT: Create reusable validation middleware
export const validateApiKeyRequest = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      // Standard error format with field mapping
      const firstError = result.error.issues[0];
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: formatErrorMessage(firstError),
          field: firstError.path.join('.'),
          details: result.error.issues
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId,
      });
    }
    
    req.body = result.data; // Use validated data
    next();
  };
};
```

## Audit and Logging Patterns

### Comprehensive Audit Logging
```typescript
// ✅ CORRECT: Include audit logs for sensitive operations
logger.info('API key audit', {
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  apiKeyId: result.id,
  name: result.name,
  previousValues: existingData, // For updates
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  requestId,
  timestamp: new Date().toISOString(),
});
```

### Performance Logging
```typescript
// ✅ CORRECT: Track processing time for performance monitoring
const startTime = Date.now();
// ... operation ...
const processingTime = Date.now() - startTime;

logger.info('Operation completed', {
  operation: 'createApiKey',
  processingTime,
  // other context
});
```

## External API Service Patterns

### OpenAI Integration Pattern
**Location**: `src/services/openai-recommendation.service.ts`

**Service Architecture**:
```typescript
// ✅ CORRECT: Use centralized database client
import { prisma } from '../database/prisma';
import { config } from '../config/environment';
import logger from '../utils/logger';
import { redis } from '../config/redis';

export class OpenAIRecommendationService {
  private readonly openaiClient: OpenAI;
  private readonly cacheKeyPrefix = 'ai_rec';
  private readonly cacheTTL = 3600; // 1 hour

  constructor() {
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: 5000, // 5 second timeout
    });
  }

  // Use prisma singleton directly, not through dependency injection
  public async generateRecommendations(songId: string): Promise<GenerateRecommendationsResponse> {
    const inputSong = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        // ... song fields
      },
    });
    
    // Continue with service logic...
  }
}
```

**Error Handling Pattern**:
```typescript
// ✅ Custom error classes with proper inheritance
export class OpenAIRecommendationError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public cause?: Error
  ) {
    super(message);
    this.name = 'OpenAIRecommendationError';
  }
}

// ✅ Comprehensive error categorization
try {
  const response = await this.openaiClient.chat.completions.create({...});
} catch (error) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      throw new OpenAIRecommendationError('OpenAI API request timeout', 408, error);
    }
    
    if ('status' in error && (error as any).status === 429) {
      throw new OpenAIRecommendationError('OpenAI API rate limit exceeded', 429, error);
    }
    
    if ('status' in error && (error as any).status >= 500) {
      throw new OpenAIRecommendationError('OpenAI API server error', 503, error);
    }
  }
}
```

**Caching Pattern**:
```typescript
// ✅ Parameter-based cache key generation with hashing
private generateCacheKey(songId: string, params: RecommendationParams): string {
  const paramString = JSON.stringify({
    limit: params.limit || 10,
    includeAnalysis: params.includeAnalysis || false,
  });
  const paramHash = crypto.createHash('md5').update(paramString).digest('hex').substring(0, 8);
  return `${this.cacheKeyPrefix}:${songId}:${paramHash}`;
}

// ✅ Cache-first pattern with fallback
if (!forceRefresh && !config.app.isTest) {
  const cachedResult = await this.getCachedRecommendations(songId, params);
  if (cachedResult) {
    return cachedResult;
  }
}
```

**Response Validation Pattern**:
```typescript
// ✅ Robust JSON parsing with validation
private parseRecommendationResponse(content: string, songId: string): { recommendations: AIRecommendation[] } {
  try {
    const parsed = JSON.parse(content);
    
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
      throw new Error('Missing or invalid recommendations array');
    }
    
    // Validate each recommendation structure
    for (const rec of parsed.recommendations) {
      if (!rec.title || !rec.artist || typeof rec.score !== 'number') {
        throw new Error('Invalid recommendation structure');
      }
      
      // Ensure score is within valid range
      if (rec.score < 0 || rec.score > 1) {
        rec.score = Math.max(0, Math.min(1, rec.score));
      }
    }
    
    return parsed;
  } catch (error) {
    logger.error('Failed to parse OpenAI recommendation response', {
      songId,
      response: content,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    });
    throw new OpenAIRecommendationError('Invalid OpenAI response format', 502);
  }
}
```

## Service Testing Patterns

### External API Service Testing
```typescript
// ✅ CORRECT: Mock external dependencies at module level
const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => mockOpenAI);
});

// ✅ Mock centralized services properly
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

// ✅ Simple service instantiation matching production
beforeEach(() => {
  service = new OpenAIRecommendationService(); // Same as production
  jest.clearAllMocks();
});
```

**Performance and Timing Patterns**:
```typescript
// ✅ Processing time tracking for monitoring
const startTime = Date.now();
// ... operation ...
const processingTimeMs = Date.now() - startTime;

logger.info('AI recommendation generation completed', {
  songId,
  totalRecommendations: matchedRecommendations.length,
  processingTimeMs,
  tokensUsed: response.usage?.total_tokens,
});
```

## Mobile Authentication Service Patterns

### Mobile API Service Architecture
**Location**: `mobile/src/services/AuthService.ts`

**Pattern**: Singleton service with secure token management
```typescript
// ✅ CORRECT: Singleton service pattern for mobile authentication
export class AuthService {
  private readonly apiClient: AxiosInstance;
  private readonly REFRESH_TOKEN_KEY = 'musicez_refresh_token';
  private accessToken: string | null = null;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
  }> = [];

  constructor() {
    this.apiClient = axios.create({
      baseURL: Config.API_BASE_URL,
      timeout: Config.API_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });
    this.setupInterceptors();
  }
}

// Export singleton instance
export const authService = new AuthService();
```

### Mobile Token Security Pattern
```typescript
// ✅ CORRECT: Secure token storage architecture
// Access tokens: Memory only (never persisted)
private accessToken: string | null = null;

// Refresh tokens: Secure storage only
await SecureStore.setItemAsync(this.REFRESH_TOKEN_KEY, refreshToken);
await SecureStore.getItemAsync(this.REFRESH_TOKEN_KEY);

// ❌ INCORRECT: Never store access tokens persistently
// await SecureStore.setItemAsync('access_token', token); // DON'T DO THIS
```

### Axios Interceptor Pattern for Mobile
```typescript
// ✅ CORRECT: Request interceptor with automatic token attachment
this.apiClient.interceptors.request.use(
  async (config) => {
    if (this.accessToken) {
      config.headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ CORRECT: Response interceptor with token refresh and request queuing
this.apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (this.isRefreshing) {
        // Queue concurrent requests during refresh
        return new Promise((resolve, reject) => {
          this.failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return this.apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      this.isRefreshing = true;
      // ... refresh logic
    }
    return Promise.reject(error);
  }
);
```

### Mobile Error Handling Pattern
```typescript
// ✅ CORRECT: Comprehensive mobile error handling
private handleApiError(error: any): ApiError {
  if (error.response?.data) {
    return error.response.data as ApiError;
  }

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
  
  // Generic fallback with status code context
  return {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: `An unexpected error occurred (${error.response?.status || 500}). Please try again later.`,
    },
    timestamp: new Date().toISOString(),
  };
}
```

### Mobile Configuration Pattern
**Location**: `mobile/src/constants/config.ts`
```typescript
// ✅ CORRECT: Centralized mobile configuration
export const Config = {
  API_BASE_URL: Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:3000/api/v1',
  API_TIMEOUT: 10000,
  TOKEN_STORAGE_KEY: 'musicez_auth_token',
  REFRESH_TOKEN_STORAGE_KEY: 'musicez_refresh_token',
  USER_STORAGE_KEY: 'musicez_user_data',
} as const;

export const API_ENDPOINTS = {
  REGISTER: '/auth/register',
  LOGIN: '/auth/login',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',
} as const;
```

### Mobile TypeScript Interface Pattern
**Location**: `mobile/src/types/auth.ts`
```typescript
// ✅ CORRECT: Complete interface definitions matching backend API
export interface AuthResponse {
  success: true;
  data: {
    user: User;
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: string;
    };
  };
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    field?: string;
  };
  timestamp: string;
}
```

### Mobile Service Method Pattern
```typescript
// ✅ CORRECT: Consistent method structure with proper error handling
public async loginUser(credentials: LoginRequest): Promise<AuthResponse> {
  try {
    const response: AxiosResponse<AuthResponse> = await this.apiClient.post(
      API_ENDPOINTS.LOGIN,
      credentials
    );

    // Store tokens after successful login
    const { accessToken, refreshToken } = response.data.data.tokens;
    this.accessToken = accessToken;
    await SecureStore.setItemAsync(this.REFRESH_TOKEN_KEY, refreshToken);

    return response.data;
  } catch (error) {
    throw this.handleApiError(error);
  }
}
```

### Mobile Authentication Flow Pattern
```typescript
// ✅ CORRECT: Graceful logout with guaranteed cleanup
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
    // Always clear local authentication data
    await this.clearAuthData();
  }
}
```

These patterns ensure consistency, maintainability, and adherence to the established architecture of the MusicEZ project.