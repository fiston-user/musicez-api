# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-26-ai-recommendation-engine/spec.md

## Schema Changes

### New Table: AIRecommendation

```sql
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inputSongId" TEXT NOT NULL,
    "recommendedSongId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "modelVersion" TEXT NOT NULL DEFAULT 'gpt-4',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cachedUntil" TIMESTAMP(3),
    "requestParameters" JSONB,
    
    CONSTRAINT "fk_ai_recommendation_input_song" 
        FOREIGN KEY ("inputSongId") REFERENCES "Song"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_ai_recommendation_recommended_song" 
        FOREIGN KEY ("recommendedSongId") REFERENCES "Song"("id") ON DELETE CASCADE
);
```

### Indexes

```sql
-- Composite index for fast recommendation lookups
CREATE INDEX "idx_ai_recommendation_input_song_score" 
ON "AIRecommendation"("inputSongId", "score" DESC);

-- Index for cache expiration cleanup
CREATE INDEX "idx_ai_recommendation_cached_until" 
ON "AIRecommendation"("cachedUntil");

-- Index for model version filtering
CREATE INDEX "idx_ai_recommendation_model_version" 
ON "AIRecommendation"("modelVersion");
```

### Existing Table Modifications

No modifications to existing tables required. The AIRecommendation table integrates with existing Song table through foreign key relationships.

## Prisma Schema Updates

```typescript
model AIRecommendation {
  id                 String   @id @default(cuid())
  inputSongId        String
  recommendedSongId  String  
  score              Float
  reason             String?
  modelVersion       String   @default("gpt-4")
  generatedAt        DateTime @default(now())
  cachedUntil        DateTime?
  requestParameters  Json?
  
  inputSong          Song     @relation("InputSong", fields: [inputSongId], references: [id], onDelete: Cascade)
  recommendedSong    Song     @relation("RecommendedSong", fields: [recommendedSongId], references: [id], onDelete: Cascade)

  @@index([inputSongId, score(sort: Desc)], name: "idx_ai_recommendation_input_song_score")
  @@index([cachedUntil], name: "idx_ai_recommendation_cached_until") 
  @@index([modelVersion], name: "idx_ai_recommendation_model_version")
  @@map("AIRecommendation")
}
```

### Song Model Updates

```typescript
model Song {
  // ... existing fields ...
  
  // New relations for AI recommendations
  inputForRecommendations      AIRecommendation[] @relation("InputSong")
  appearsInRecommendations     AIRecommendation[] @relation("RecommendedSong")
}
```

## Migration Strategy

### Migration File: `add_ai_recommendation_table.sql`

```sql
-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inputSongId" TEXT NOT NULL,
    "recommendedSongId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "modelVersion" TEXT NOT NULL DEFAULT 'gpt-4',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cachedUntil" TIMESTAMP(3),
    "requestParameters" JSONB,
    
    CONSTRAINT "fk_ai_recommendation_input_song" 
        FOREIGN KEY ("inputSongId") REFERENCES "Song"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_ai_recommendation_recommended_song" 
        FOREIGN KEY ("recommendedSongId") REFERENCES "Song"("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_ai_recommendation_input_song_score" ON "AIRecommendation"("inputSongId", "score" DESC);
CREATE INDEX "idx_ai_recommendation_cached_until" ON "AIRecommendation"("cachedUntil");
CREATE INDEX "idx_ai_recommendation_model_version" ON "AIRecommendation"("modelVersion");
```

## Rationale

### Table Design
- **Separate AIRecommendation table** maintains recommendation history and enables caching without cluttering the core Song table
- **Foreign key relationships** ensure data integrity and enable cascading deletes
- **Score field** provides ranking mechanism compatible with existing search similarity scoring (0.0-1.0 range)
- **Reason field** stores AI-generated explanation for recommendation logic, useful for debugging and user display

### Performance Considerations  
- **Composite index** on `(inputSongId, score DESC)` enables fast retrieval of top recommendations for any song
- **Cached until index** supports efficient cleanup of expired cached recommendations
- **Model version index** allows filtering by AI model version for A/B testing and model migration

### Data Integrity
- **Cascade delete** ensures orphaned recommendations are cleaned up when songs are deleted
- **JSONB request parameters** enable flexible storage of request context while maintaining queryability
- **Timestamp fields** support cache management and recommendation analytics