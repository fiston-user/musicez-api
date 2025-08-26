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

## Summary

These anti-patterns represent actual mistakes encountered during development and should be actively avoided. Each pattern includes context about why it's problematic and clear alternatives that follow established project conventions.

When implementing new features:
1. ✅ **Reference established patterns** in code-patterns.md
2. ✅ **Check this anti-patterns list** before implementation  
3. ✅ **Use existing utilities and singletons**
4. ✅ **Follow import and organization conventions**
5. ✅ **Test with proper mocking strategies**

This helps maintain architectural integrity and prevents regression to problematic approaches.