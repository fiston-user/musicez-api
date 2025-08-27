# API Specification  

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-27-spotify-search-integration/spec.md

## Endpoints

### GET /api/v1/songs/search/enhanced

**Purpose:** Search for songs across local database and Spotify catalog

**Parameters:**
- `q` (string, required): Search query, minimum 2 characters
- `limit` (number, optional): Maximum results 1-50, default 20
- `threshold` (number, optional): Similarity threshold 0.1-1.0, default 0.3
- `enrich` (boolean, optional): Enable Spotify search, default false
- `fresh` (boolean, optional): Bypass cache, default false  
- `recommend` (boolean, optional): Include AI recommendations, default false

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response:** 200 OK
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "local-uuid-or-spotify-id",
        "title": "Yesterday",
        "artist": "The Beatles",
        "album": "Help!",
        "duration": 125,
        "releaseYear": 1965,
        "popularity": 89,
        "similarity": 0.95,
        "source": "merged",
        "spotifyId": "3BQHpFgAp4l80e1XslIjNI",
        "previewUrl": "https://p.scdn.co/mp3-preview/...",
        "externalUrl": "https://open.spotify.com/track/...",
        "audioFeatures": {
          "acousticness": 0.829,
          "danceability": 0.342,
          "energy": 0.183,
          "valence": 0.348
        }
      }
    ],
    "metadata": {
      "total": 25,
      "query": "beatles yesterday",
      "processingTime": 187,
      "limit": 20,
      "threshold": 0.3,
      "spotifyEnabled": true,
      "localResults": 3,
      "spotifyResults": 22,
      "cached": false
    }
  },
  "timestamp": "2025-08-27T10:30:00Z"
}
```

**Errors:**
- 400: Invalid query parameters
- 401: Unauthorized (missing/invalid token)
- 429: Rate limit exceeded
- 500: Search operation failed

### POST /api/v1/songs/import-spotify

**Purpose:** Import a Spotify track into the local database

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "spotifyId": "3BQHpFgAp4l80e1XslIjNI",
  "includeAudioFeatures": true
}
```

**Response:** 201 Created
```json
{
  "success": true,
  "data": {
    "song": {
      "id": "generated-uuid",
      "spotifyId": "3BQHpFgAp4l80e1XslIjNI",
      "title": "Yesterday",
      "artist": "The Beatles",
      "album": "Help!",
      "genre": "Rock",
      "releaseYear": 1965,
      "duration": 125,
      "popularity": 89,
      "previewUrl": "https://p.scdn.co/mp3-preview/...",
      "externalUrl": "https://open.spotify.com/track/...",
      "audioFeaturesSynced": true,
      "spotifyLastSync": "2025-08-27T10:30:00Z"
    },
    "imported": true,
    "message": "Spotify track imported successfully"
  },
  "timestamp": "2025-08-27T10:30:00Z"
}
```

**Errors:**
- 400: Invalid Spotify ID format
- 401: Unauthorized
- 404: Track not found on Spotify
- 409: Track already exists (returns existing track)
- 503: Spotify API unavailable

## Controller Actions

### SearchController.enhancedSearchSongs
- Modified to use EnhancedSongSearchService
- Handles enrich parameter to enable Spotify search
- Manages parallel search coordination
- Implements proper error handling with fallback

### SongController.importSpotifyTrack (new)
- Validates Spotify track ID
- Fetches track metadata from Spotify
- Maps Spotify data to local schema
- Handles duplicates gracefully
- Returns imported track data

## Integration Notes

- Spotify search requires valid user Spotify connection
- Results are automatically cached with appropriate TTL
- Spotify API rate limits are respected (MAX_SPOTIFY_RESULTS = 50)
- Audio features are optional and fetched separately
- Import operation is idempotent - safe to retry