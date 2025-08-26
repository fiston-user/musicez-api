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

These patterns ensure consistency, maintainability, and adherence to the established architecture of the MusicEZ project.