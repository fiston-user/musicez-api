# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-08-26-project-setup/spec.md

## Technical Requirements

### Project Structure
```
musicez/
├── src/
│   ├── config/          # Configuration files and environment validation
│   ├── controllers/     # Route handlers
│   ├── services/        # Business logic
│   ├── middleware/      # Express middleware
│   ├── routes/          # API route definitions
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── prisma/          # Prisma schema and migrations
│   └── app.ts           # Express application setup
│   └── server.ts        # Server entry point
├── tests/               # Test files
├── docker/              # Docker configurations
├── .github/             # GitHub Actions workflows
└── [config files]       # Various configuration files
```

### Express.js Configuration
- Express v4.21+ with async error handling
- Middleware stack: helmet, cors, compression, express-rate-limit, morgan
- JSON body parser with size limits
- Request ID generation for tracing
- Graceful shutdown handling
- Health check endpoint at `/health` returning server and database status

### TypeScript Configuration
- TypeScript v5.6+ with strict mode enabled
- Path aliases configured (@/controllers, @/services, etc.)
- Source maps enabled for debugging
- Separate tsconfig for production build
- tsx for development hot-reload
- tsc for production compilation

### Prisma Setup
- Prisma v5.22 with PostgreSQL adapter
- Database URL from environment variables
- Shadow database for migrations in development
- Prisma Studio available via npm script
- Type-safe generated client
- Initial migration for basic system tables

### Docker Development Environment
- Docker Compose with three services: app, postgres, redis
- PostgreSQL 16 with persistent volume
- Redis 7 with persistence enabled
- Environment variable injection
- Health checks for all services
- Network isolation with service discovery

### Environment Configuration
- `.env` file for local development
- `.env.example` template with all required variables
- Environment validation using Zod
- Separate configs for development, test, and production
- Required variables: DATABASE_URL, REDIS_URL, NODE_ENV, PORT

### Testing Infrastructure
- Jest v29 with TypeScript support via ts-jest
- Supertest for API integration testing
- Test database with automatic cleanup
- Coverage reporting with Istanbul
- Watch mode for development
- Separate test environment configuration

### CI/CD Pipeline (GitHub Actions)
- Workflow triggers on push and pull requests
- Matrix testing on Node.js 20.x
- Steps: checkout, setup Node, install deps, lint, type check, test
- PostgreSQL service container for tests
- Build verification
- Optional deployment step (commented template)

### Development Scripts
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext ts",
    "lint:fix": "eslint src --ext ts --fix",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f"
  }
}
```

### Error Handling & Logging
- Centralized error handling middleware
- Structured logging with winston or pino
- Request/response logging in development
- Error tracking setup (Sentry configuration ready)
- Correlation IDs for request tracing

### Security Configuration
- Helmet.js for security headers
- CORS configuration with whitelist
- Rate limiting per IP
- Input validation middleware ready
- Environment variable security
- SQL injection protection via Prisma

## External Dependencies

### Core Dependencies
- **express** - Web framework
- **typescript** - Type safety and modern JavaScript features
- **@prisma/client** - Database ORM client
- **dotenv** - Environment variable management
- **zod** - Runtime validation for environment and requests

### Middleware & Security
- **helmet** - Security headers
- **cors** - CORS handling
- **compression** - Response compression
- **express-rate-limit** - API rate limiting
- **morgan** - HTTP request logging

### Development Dependencies  
- **tsx** - TypeScript execution with hot-reload
- **@types/express** - TypeScript definitions for Express
- **@types/node** - Node.js type definitions
- **eslint** - Code linting
- **@typescript-eslint/parser** - TypeScript ESLint parser
- **@typescript-eslint/eslint-plugin** - TypeScript linting rules
- **prettier** - Code formatting

### Testing Dependencies
- **jest** - Testing framework  
- **ts-jest** - Jest TypeScript support
- **supertest** - API testing
- **@types/jest** - Jest type definitions
- **@types/supertest** - Supertest type definitions

### Database & Cache
- **prisma** - ORM and migration tool (dev dependency)
- **redis** - Cache client
- **ioredis** - Modern Redis client (alternative)

### Justification for Dependencies
All dependencies align with the tech stack specified in @.agent-os/product/tech-stack.md and are essential for creating a production-ready TypeScript Express API with proper development tooling, testing capabilities, and deployment readiness.