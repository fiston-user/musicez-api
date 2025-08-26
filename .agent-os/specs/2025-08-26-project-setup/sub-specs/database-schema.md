# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-26-project-setup/spec.md

## Initial Schema Setup

### System Tables

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Health check table for database connectivity verification
model SystemHealth {
  id        String   @id @default(uuid())
  status    String   @default("healthy")
  checkedAt DateTime @default(now())
  version   String   @default("1.0.0")
  
  @@map("system_health")
}

// API Keys for future authentication
model ApiKey {
  id        String   @id @default(uuid())
  key       String   @unique
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lastUsed  DateTime?
  
  @@index([key])
  @@map("api_keys")
}

// Request logs for monitoring
model RequestLog {
  id         String   @id @default(uuid())
  method     String
  path       String
  statusCode Int
  duration   Int      // in milliseconds
  ip         String
  userAgent  String?
  createdAt  DateTime @default(now())
  
  @@index([createdAt])
  @@index([path])
  @@map("request_logs")
}
```

### Initial Migration

```sql
-- CreateTable
CREATE TABLE "system_health" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'healthy',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT NOT NULL DEFAULT '1.0.0',

    CONSTRAINT "system_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsed" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "request_logs_createdAt_idx" ON "request_logs"("createdAt");

-- CreateIndex
CREATE INDEX "request_logs_path_idx" ON "request_logs"("path");

-- Insert initial health check record
INSERT INTO "system_health" ("id", "status", "version") 
VALUES (gen_random_uuid(), 'healthy', '1.0.0');
```

## Database Configuration

### Connection Settings
```typescript
// src/config/database.ts
export const databaseConfig = {
  connectionLimit: 10,
  connectionTimeout: 60000,
  idleTimeout: 10000,
  maxLifetime: 1800000, // 30 minutes
};
```

### Environment Variables
```env
# PostgreSQL connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/musicez_dev?schema=public"

# Shadow database for migrations (development only)
SHADOW_DATABASE_URL="postgresql://postgres:password@localhost:5432/musicez_shadow?schema=public"
```

### Docker PostgreSQL Setup
```yaml
# docker-compose.yml (postgres service)
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: password
    POSTGRES_DB: musicez_dev
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
  ports:
    - "5432:5432"
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### Database Initialization Script
```sql
-- docker/postgres/init.sql
-- Create development database
CREATE DATABASE musicez_dev;

-- Create shadow database for Prisma migrations
CREATE DATABASE musicez_shadow;

-- Create test database
CREATE DATABASE musicez_test;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE musicez_dev TO postgres;
GRANT ALL PRIVILEGES ON DATABASE musicez_shadow TO postgres;
GRANT ALL PRIVILEGES ON DATABASE musicez_test TO postgres;
```

## Rationale

### System Health Table
- Provides a simple way to verify database connectivity
- Used by the `/health` endpoint to confirm database is accessible
- Stores version information for migration tracking

### API Keys Table
- Foundation for future API authentication system
- Prepared structure but not actively used in initial setup
- Includes indexes for fast key lookup

### Request Logs Table
- Basic request logging for monitoring and debugging
- Helps identify performance issues and usage patterns
- Indexed by timestamp and path for efficient queries

### Design Decisions
- Using UUID primary keys for better distributed system compatibility
- Consistent naming with snake_case for database objects
- Prepared indexes on frequently queried columns
- Minimal initial schema to avoid over-engineering

## Migration Commands

```bash
# Generate Prisma client
npm run prisma:generate

# Create and apply migration
npm run prisma:migrate

# Open Prisma Studio to view data
npm run prisma:studio

# Reset database (development only)
npx prisma migrate reset
```