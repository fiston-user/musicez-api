# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-26-song-search-endpoint/spec.md

## Endpoints

### GET /api/v1/songs/search

**Purpose:** Search for songs using fuzzy matching on title and artist names

**Authentication:** Required (JWT token or API key)

**Query Parameters:**
- `q` (string, required): Search query, minimum 2 characters
- `limit` (number, optional): Maximum results to return (default: 20, max: 50)
- `threshold` (number, optional): Minimum similarity score (default: 0.3, range: 0.1-1.0)

**Request Example:**
```http
GET /api/v1/songs/search?q=bohemian%20rapsody&limit=10
Authorization: Bearer <jwt_token>
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Bohemian Rhapsody",
        "artist": "Queen",
        "album": "A Night at the Opera",
        "duration": 355,
        "releaseYear": 1975,
        "similarity": 0.95
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "title": "Bohemian Rhapsody (Live)",
        "artist": "Queen",
        "album": "Live at Wembley",
        "duration": 362,
        "releaseYear": 1986,
        "similarity": 0.82
      }
    ],
    "metadata": {
      "query": "bohemian rapsody",
      "totalResults": 2,
      "limit": 10,
      "processingTime": 45
    }
  },
  "timestamp": "2025-08-26T10:30:00Z"
}
```

**Error Responses:**

400 Bad Request - Invalid query parameters:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_SEARCH_QUERY",
    "message": "Search query must be at least 2 characters long"
  }
}
```

404 Not Found - No results:
```json
{
  "success": false,
  "error": {
    "code": "NO_RESULTS",
    "message": "No songs found matching your search"
  }
}
```

429 Too Many Requests - Rate limit exceeded:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many search requests. Please try again later."
  }
}
```

## Controller Implementation

### SongController.search

**Business Logic:**
1. Validate and sanitize search query
2. Check Redis cache for recent identical queries
3. Execute PostgreSQL fuzzy search with trigram similarity
4. Calculate and sort by relevance scores
5. Format response with metadata
6. Cache results in Redis with TTL
7. Log search analytics (query, result count, response time)

**Error Handling:**
- Validate query length and characters
- Handle database connection errors gracefully
- Return appropriate HTTP status codes
- Log errors with context for debugging

**Performance Monitoring:**
- Track query execution time
- Monitor cache hit rates
- Log slow queries (>200ms) for optimization