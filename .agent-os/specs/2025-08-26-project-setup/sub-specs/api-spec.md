# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-26-project-setup/spec.md

## Endpoints

### GET /health

**Purpose:** Verify server status and database connectivity
**Parameters:** None
**Response:** JSON object with server and database status
**Errors:** 503 if database is unreachable

**Response Format:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-26T10:30:00.000Z",
  "service": "musicez-api",
  "version": "1.0.0",
  "uptime": 3600,
  "database": {
    "connected": true,
    "latency": 5
  },
  "redis": {
    "connected": true,
    "latency": 2
  }
}
```

### GET /

**Purpose:** API root endpoint with service information
**Parameters:** None
**Response:** JSON object with API metadata
**Errors:** None

**Response Format:**
```json
{
  "name": "MusicEZ API",
  "version": "1.0.0",
  "description": "AI-powered music recommendation API",
  "documentation": "/api-docs",
  "health": "/health"
}
```

### GET /api-docs

**Purpose:** Swagger/OpenAPI documentation interface
**Parameters:** None
**Response:** HTML page with interactive API documentation
**Errors:** None

### GET /api-docs/json

**Purpose:** OpenAPI specification in JSON format
**Parameters:** None
**Response:** OpenAPI 3.0 specification document
**Errors:** None

## Controllers

### HealthController

```typescript
// src/controllers/health.controller.ts

export class HealthController {
  async checkHealth(req: Request, res: Response) {
    // Check database connectivity
    // Check Redis connectivity
    // Calculate uptime
    // Return comprehensive health status
  }
}
```

### RootController

```typescript
// src/controllers/root.controller.ts

export class RootController {
  async getApiInfo(req: Request, res: Response) {
    // Return API metadata
    // Include links to documentation
    // Show available endpoints summary
  }
}
```

## Middleware Stack

### Global Middleware (Applied to all routes)

1. **Request ID Generation**
   - Generates unique ID for request tracing
   - Adds `X-Request-ID` header to response

2. **Security Headers (Helmet)**
   - Sets various HTTP headers for security
   - Configures CSP, HSTS, etc.

3. **CORS**
   - Configures allowed origins
   - Sets allowed methods and headers

4. **Body Parser**
   - Parses JSON payloads
   - Sets size limits (default: 10MB)

5. **Compression**
   - Compresses responses for better performance
   - Skips compression for small payloads

6. **Request Logging (Morgan)**
   - Logs HTTP requests in development
   - Structured logging in production

7. **Rate Limiting**
   - Default: 100 requests per 15 minutes per IP
   - Configurable per route

### Error Handling Middleware

```typescript
// src/middleware/error.middleware.ts

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error with request context
  // Format error response
  // Send appropriate status code
  // Include request ID for tracking
};
```

## Route Organization

```typescript
// src/routes/index.ts

export function configureRoutes(app: Express) {
  // Health check route
  app.get('/health', healthController.checkHealth);
  
  // API root
  app.get('/', rootController.getApiInfo);
  
  // Swagger documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Future API routes will be mounted here
  // app.use('/api/v1', apiV1Routes);
  
  // 404 handler
  app.use('*', notFoundHandler);
  
  // Global error handler (must be last)
  app.use(errorHandler);
}
```

## OpenAPI Specification Setup

```typescript
// src/config/swagger.ts

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'MusicEZ API',
    version: '1.0.0',
    description: 'AI-powered music recommendation API',
    contact: {
      name: 'API Support',
      email: 'support@musicez.api'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server'
    },
    {
      url: 'https://api.musicez.com',
      description: 'Production server'
    }
  ],
  tags: [
    {
      name: 'System',
      description: 'System endpoints'
    }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Check API server and database health',
        responses: {
          '200': {
            description: 'Server is healthy'
          },
          '503': {
            description: 'Server is unhealthy'
          }
        }
      }
    }
  }
};
```

## Response Standards

### Success Response
```typescript
{
  success: true,
  data: any,
  meta?: {
    page?: number,
    limit?: number,
    total?: number
  }
}
```

### Error Response
```typescript
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any
  },
  requestId: string
}
```

## HTTP Status Codes

- **200 OK** - Successful GET/PUT request
- **201 Created** - Successful POST request creating resource
- **204 No Content** - Successful DELETE request
- **400 Bad Request** - Invalid request parameters
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Authenticated but not authorized
- **404 Not Found** - Resource not found
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Server error
- **503 Service Unavailable** - Service temporarily unavailable