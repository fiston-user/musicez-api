-- Create development database (already exists as POSTGRES_DB)
-- CREATE DATABASE musicez_dev;

-- Create shadow database for Prisma migrations
CREATE DATABASE musicez_shadow;

-- Create test database
CREATE DATABASE musicez_test;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE musicez_dev TO postgres;
GRANT ALL PRIVILEGES ON DATABASE musicez_shadow TO postgres;
GRANT ALL PRIVILEGES ON DATABASE musicez_test TO postgres;

-- Create extensions that might be useful
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search