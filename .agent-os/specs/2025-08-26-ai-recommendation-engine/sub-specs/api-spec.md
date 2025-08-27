# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-26-ai-recommendation-engine/spec.md

## Endpoints

### POST /api/v1/recommendations

**Purpose:** Generate AI-powered song recommendations based on input song
**Authentication:** Required (Bearer JWT token)
**Rate Limit:** 10 requests per minute per user
**Content-Type:** application/json

**Request Body:**
```json
{
  "songId": "string (required, cuid format)",
  "limit": "number (optional, 1-50, default: 10)",
  "includeReason": "boolean (optional, default: false)",
  "fresh": "boolean (optional, bypass cache, default: false)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "inputSong": {
      "id": "string",
      "title": "string", 
      "artist": "string",
      "album": "string"
    },
    "recommendations": [
      {
        "id": "string",
        "title": "string",
        "artist": "string", 
        "album": "string",
        "score": "number (0.0-1.0)",
        "reason": "string (if includeReason=true)"
      }
    ],
    "metadata": {
      "total": "number",
      "processingTime": "number (milliseconds)",
      "cached": "boolean",
      "modelVersion": "string"
    }
  },
  "timestamp": "string (ISO 8601)"
}
```

**Errors:**
- `400 VALIDATION_ERROR`: Invalid songId format or parameters
- `404 SONG_NOT_FOUND`: Input song does not exist in database  
- `429 RATE_LIMIT_EXCEEDED`: Too many requests (10/min limit)
- `500 AI_SERVICE_ERROR`: OpenAI API failure or timeout
- `503 SERVICE_UNAVAILABLE`: AI service temporarily unavailable

### POST /api/v1/recommendations/batch

**Purpose:** Generate recommendations for multiple songs in a single request
**Authentication:** Required (Bearer JWT token)
**Rate Limit:** 3 requests per minute per user (lower due to higher resource usage)

**Request Body:**
```json
{
  "songIds": ["string", "string"],
  "limit": "number (optional, 1-20 per song, default: 5)",
  "includeReason": "boolean (optional, default: false)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "inputSongId": "string",
        "recommendations": [...], // Same format as single endpoint
        "error": "string (if failed for this song)"
      }
    ],
    "metadata": {
      "processed": "number",
      "failed": "number", 
      "totalProcessingTime": "number"
    }
  },
  "timestamp": "string"
}
```

**Errors:** Same as single recommendation endpoint

### Enhanced Search: GET /api/v1/songs/search

**Enhancement:** Add optional AI recommendations to existing search endpoint
**New Query Parameter:** `recommend=boolean (optional, default: false)`

**Enhanced Response (when recommend=true):**
```json
{
  "success": true,
  "data": {
    "results": [...], // Existing search results
    "aiRecommendations": [
      {
        "basedOnSong": {
          "id": "string",
          "title": "string",
          "similarity": "number"
        },
        "recommendations": [...] // Same format as /recommendations
      }
    ],
    "metadata": {
      "total": "number",
      "query": "string", 
      "processingTime": "number",
      "aiProcessingTime": "number (additional time for AI)",
      "cached": "boolean"
    }
  }
}
```

## Controllers

### RecommendationController

**generateRecommendations()**
- Validates input song exists in database
- Checks Redis cache for existing recommendations
- Calls OpenAI GPT-4 API with structured prompt
- Matches AI recommendations to database songs using fuzzy search
- Stores results in database and cache
- Returns formatted response with similarity scores

**generateBatchRecommendations()**  
- Processes multiple songs with concurrent AI API calls
- Implements partial success handling (some songs may fail)
- Uses connection pooling for database operations
- Aggregates processing statistics

**Error Handling:**
- OpenAI API timeout (5 seconds) → Graceful degradation with fallback recommendations
- Song not found → 404 with helpful error message
- Rate limiting → 429 with retry-after header
- AI parsing errors → Log and return generic error to user

### Enhanced SearchController

**searchSongs()** - Modified
- Existing functionality preserved
- When `recommend=true`, triggers AI recommendation flow for top search results
- Combines search results with AI recommendations in single response
- Maintains existing performance targets (<200ms base search)

## Request Validation Schemas

### Recommendation Request Schema
```typescript
const recommendationRequestSchema = z.object({
  songId: z.string().cuid('Invalid song ID format'),
  limit: z.number().int().min(1).max(50).default(10),
  includeReason: z.boolean().default(false),
  fresh: z.boolean().default(false)
});
```

### Batch Recommendation Schema
```typescript
const batchRecommendationRequestSchema = z.object({
  songIds: z.array(z.string().cuid()).min(1).max(10),
  limit: z.number().int().min(1).max(20).default(5),
  includeReason: z.boolean().default(false)
});
```

## Rate Limiting Configuration

```typescript
// Single recommendations: 10 requests per minute
const recommendationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => `rec:${req.user.id}`,
  message: {
    success: false,
    error: {
      code: 'RECOMMENDATION_RATE_LIMIT_EXCEEDED',
      message: 'Too many recommendation requests. Limit: 10 per minute.'
    }
  }
});

// Batch recommendations: 3 requests per minute  
const batchRecommendationRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: (req) => `batch_rec:${req.user.id}`
});
```