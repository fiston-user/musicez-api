# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-26-song-search-endpoint/spec.md

## Schema Changes

### Song Model Updates

Add searchable fields and indexes to the existing Song model:

```prisma
model Song {
  id            String   @id @default(uuid())
  title         String
  artist        String
  album         String?
  duration      Int?     // Duration in seconds
  releaseYear   Int?
  spotifyId     String?  @unique
  previewUrl    String?
  popularity    Int?     @default(0)
  
  // New field for optimized searching
  searchVector  String?  @db.Text
  
  // Relationships
  recommendations RecommendedSong[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Indexes for search performance
  @@index([title, artist])
  @@index([searchVector])
}
```

### Migration SQL

```sql
-- Enable trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add search vector column
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "searchVector" TEXT;

-- Populate search vector with combined title and artist
UPDATE "Song" 
SET "searchVector" = LOWER(CONCAT(title, ' ', artist, ' ', COALESCE(album, '')));

-- Create GIN index for trigram similarity search
CREATE INDEX IF NOT EXISTS "Song_searchVector_gin_trgm_idx" 
ON "Song" 
USING gin ("searchVector" gin_trgm_ops);

-- Create indexes for exact matching optimization
CREATE INDEX IF NOT EXISTS "Song_title_artist_idx" 
ON "Song" (LOWER(title), LOWER(artist));
```

### Search Query Implementation

Example Prisma raw query for fuzzy search:

```typescript
const results = await prisma.$queryRaw`
  SELECT 
    id,
    title,
    artist,
    album,
    duration,
    "releaseYear",
    similarity("searchVector", ${searchQuery.toLowerCase()}) as similarity
  FROM "Song"
  WHERE similarity("searchVector", ${searchQuery.toLowerCase()}) > 0.3
  ORDER BY similarity DESC
  LIMIT ${limit}
`;
```

## Rationale

- **searchVector field**: Combines searchable text for efficient single-column searching
- **GIN index with pg_trgm**: Provides fast trigram-based fuzzy matching
- **Lowercase normalization**: Ensures case-insensitive searching
- **Similarity threshold (0.3)**: Balances between fuzzy matching tolerance and result relevance
- **Composite index on title/artist**: Optimizes exact match queries as fallback