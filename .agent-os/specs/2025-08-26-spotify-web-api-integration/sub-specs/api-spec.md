# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-26-spotify-web-api-integration/spec.md

> Created: 2025-08-26
> Version: 1.0.0

## Enhanced Existing Endpoints

### GET /api/v1/songs/search (Enhanced)

**Purpose:** Enhanced existing search endpoint with optional Spotify enrichment
**Parameters:** 
- `query` (required): Search query string (min 2 chars)
- `limit` (optional): Results limit (1-50, default 20)  
- `threshold` (optional): Similarity threshold (0.1-1.0, default 0.3)
- `enrich` (optional): Enable Spotify enrichment (`true`/`false`, default `false`)
- `fresh` (optional): Force fresh Spotify data (`true`/`false`, default `false`)

**Response:** Existing format with additional Spotify fields when enriched
```json
{
  "success": true,
  "data": {
    "songs": [{
      "id": "uuid",
      "title": "Song Title",
      "artist": "Artist Name", 
      "album": "Album Name",
      "spotifyTrackId": "spotify_track_id",
      "spotifyPopularity": 85,
      "spotifyPreviewUrl": "https://p.scdn.co/...",
      "spotifyExternalUrl": "https://open.spotify.com/track/...",
      "audioFeatures": {
        "energy": 0.73,
        "danceability": 0.65,
        "valence": 0.52,
        "speechiness": 0.04,
        "liveness": 0.12,
        "loudness": -8.2
      }
    }]
  }
}
```

**Errors:** Existing error codes plus:
- `SPOTIFY_API_ERROR`: Spotify service temporarily unavailable
- `SPOTIFY_RATE_LIMITED`: Spotify rate limit exceeded

## New Authentication Endpoints

### POST /api/v1/auth/spotify/connect

**Purpose:** Initiate Spotify OAuth connection for authenticated users
**Parameters:** None (uses existing JWT authentication)
**Response:** OAuth authorization URL for user redirection
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.spotify.com/authorize?...",
    "state": "secure_state_token"
  }
}
```

**Errors:**
- `UNAUTHORIZED`: Valid JWT token required
- `SPOTIFY_CONFIG_ERROR`: Spotify credentials not configured

### GET /api/v1/auth/spotify/callback

**Purpose:** Handle Spotify OAuth callback and store user tokens
**Parameters:**
- `code` (required): Authorization code from Spotify
- `state` (required): State parameter for CSRF protection
- `error` (optional): OAuth error from Spotify

**Response:** Connection success confirmation
```json
{
  "success": true,
  "data": {
    "connected": true,
    "spotifyUserId": "spotify_user_id",
    "displayName": "User's Display Name"
  }
}
```

**Errors:**
- `INVALID_STATE`: State parameter mismatch (CSRF protection)
- `SPOTIFY_AUTH_ERROR`: OAuth authorization failed
- `TOKEN_EXCHANGE_ERROR`: Failed to exchange code for tokens

### DELETE /api/v1/auth/spotify/disconnect

**Purpose:** Disconnect user's Spotify account and revoke tokens
**Parameters:** None (uses existing JWT authentication)
**Response:** Disconnection confirmation
```json
{
  "success": true,
  "data": {
    "disconnected": true
  }
}
```

**Errors:**
- `UNAUTHORIZED`: Valid JWT token required
- `NOT_CONNECTED`: User has no Spotify connection to disconnect

### GET /api/v1/auth/spotify/status

**Purpose:** Check user's Spotify connection status
**Parameters:** None (uses existing JWT authentication) 
**Response:** Current connection status
```json
{
  "success": true,
  "data": {
    "connected": true,
    "spotifyUserId": "spotify_user_id",
    "displayName": "User's Display Name",
    "scope": "user-read-private user-library-read",
    "connectedAt": "2025-08-26T10:00:00Z"
  }
}
```

## New Spotify Data Endpoints

### GET /api/v1/spotify/user/playlists

**Purpose:** Retrieve user's Spotify playlists (requires Spotify connection)
**Parameters:**
- `limit` (optional): Number of playlists (1-50, default 20)
- `offset` (optional): Pagination offset (default 0)

**Response:** User's Spotify playlists
```json
{
  "success": true,
  "data": {
    "playlists": [{
      "id": "spotify_playlist_id",
      "name": "Playlist Name",
      "description": "Playlist description",
      "trackCount": 42,
      "imageUrl": "https://i.scdn.co/...",
      "externalUrl": "https://open.spotify.com/playlist/..."
    }],
    "total": 15
  }
}
```

**Errors:**
- `SPOTIFY_NOT_CONNECTED`: User must connect Spotify account first
- `SPOTIFY_TOKEN_EXPIRED`: Spotify token needs refresh
- `INSUFFICIENT_SCOPE`: Required Spotify permissions not granted

### GET /api/v1/spotify/user/recent-tracks

**Purpose:** Get user's recently played tracks from Spotify
**Parameters:**
- `limit` (optional): Number of tracks (1-50, default 20)

**Response:** Recently played tracks with enhanced metadata
```json
{
  "success": true,
  "data": {
    "tracks": [{
      "playedAt": "2025-08-26T09:45:00Z",
      "track": {
        "spotifyTrackId": "spotify_track_id",
        "title": "Track Title",
        "artist": "Artist Name",
        "album": "Album Name",
        "popularity": 78,
        "previewUrl": "https://p.scdn.co/..."
      }
    }]
  }
}
```

## Admin/Sync Endpoints

### POST /api/v1/admin/spotify/sync/popular

**Purpose:** Manually trigger sync of popular tracks (admin only)
**Parameters:**
- `limit` (optional): Number of popular tracks to sync (default 50)
- `force` (optional): Force re-sync even if recently synced

**Response:** Sync job initiation confirmation
```json
{
  "success": true,
  "data": {
    "jobId": "sync_job_uuid",
    "status": "queued",
    "estimatedTracks": 50
  }
}
```

### GET /api/v1/admin/spotify/sync/status/:jobId

**Purpose:** Check status of Spotify sync job (admin only)
**Parameters:** `jobId` in URL path
**Response:** Sync job status and progress
```json
{
  "success": true,
  "data": {
    "jobId": "sync_job_uuid",
    "status": "running",
    "progress": {
      "processed": 23,
      "total": 50,
      "errors": 2
    },
    "startedAt": "2025-08-26T10:00:00Z"
  }
}
```

## Rate Limiting

**Enhanced Rate Limits:**
- `/api/v1/songs/search` with `enrich=true`: 20/min (reduced due to Spotify API usage)
- Spotify auth endpoints: 10/min per user
- User Spotify data endpoints: 30/min per user  
- Admin sync endpoints: 5/min (admin role required)

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Window reset timestamp
- `X-Spotify-RateLimit-Remaining`: Remaining Spotify API quota (when applicable)