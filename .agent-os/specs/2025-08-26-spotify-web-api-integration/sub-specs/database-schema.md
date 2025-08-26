# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-26-spotify-web-api-integration/spec.md

## Database Changes

### Songs Table Extensions

**New Columns to Add:**
- `spotifyTrackId` (VARCHAR(22), nullable, unique) - Spotify track identifier
- `spotifyLastSync` (TIMESTAMP, nullable) - Last synchronization with Spotify API
- `spotifyPopularity` (INTEGER, nullable, 0-100) - Current Spotify popularity score
- `spotifyPreviewUrl` (TEXT, nullable) - 30-second preview URL from Spotify
- `spotifyExternalUrl` (TEXT, nullable) - Link to track on Spotify
- `audioFeaturesSynced` (BOOLEAN, default false) - Whether audio features are from Spotify
- `lastPopularityUpdate` (TIMESTAMP, nullable) - Last popularity score update

**Enhanced Audio Features** (existing columns enhanced with Spotify data):
- Update existing `energy`, `danceability`, `valence`, `acousticness`, `instrumentalness` with Spotify precision
- Add `speechiness` (DECIMAL(3,2), nullable) - Spotify speechiness metric
- Add `liveness` (DECIMAL(3,2), nullable) - Spotify liveness detection
- Add `loudness` (DECIMAL(5,2), nullable) - Track loudness in decibels

### New User Integration Tables

**SpotifyConnections Table:**
```sql
CREATE TABLE spotify_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spotify_user_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL, -- Encrypted
    refresh_token TEXT NOT NULL, -- Encrypted
    token_expires_at TIMESTAMP NOT NULL,
    scope TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id), -- One Spotify connection per user
    UNIQUE(spotify_user_id)
);
```

**Spotify Sync Jobs Table:**
```sql
CREATE TABLE spotify_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL, -- 'track_sync', 'user_library', 'popularity_update'
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    target_id VARCHAR(255), -- Track ID or User ID depending on job type
    parameters JSONB,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Database Migrations

### Migration 1: Extend Songs Table
```sql
-- Add Spotify integration columns to existing songs table
ALTER TABLE songs 
ADD COLUMN spotify_track_id VARCHAR(22) UNIQUE,
ADD COLUMN spotify_last_sync TIMESTAMP,
ADD COLUMN spotify_popularity INTEGER CHECK (spotify_popularity >= 0 AND spotify_popularity <= 100),
ADD COLUMN spotify_preview_url TEXT,
ADD COLUMN spotify_external_url TEXT,
ADD COLUMN audio_features_synced BOOLEAN DEFAULT false,
ADD COLUMN last_popularity_update TIMESTAMP,
ADD COLUMN speechiness DECIMAL(3,2) CHECK (speechiness >= 0 AND speechiness <= 1),
ADD COLUMN liveness DECIMAL(3,2) CHECK (liveness >= 0 AND liveness <= 1),
ADD COLUMN loudness DECIMAL(5,2);

-- Add index for Spotify track ID lookups
CREATE INDEX idx_songs_spotify_track_id ON songs(spotify_track_id) WHERE spotify_track_id IS NOT NULL;

-- Add index for sync status queries
CREATE INDEX idx_songs_spotify_sync ON songs(spotify_last_sync, audio_features_synced);

-- Add index for popularity-based queries
CREATE INDEX idx_songs_popularity ON songs(spotify_popularity) WHERE spotify_popularity IS NOT NULL;
```

### Migration 2: Create Integration Tables
```sql
-- Create Spotify connections table
CREATE TABLE spotify_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spotify_user_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP NOT NULL,
    scope TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id),
    UNIQUE(spotify_user_id)
);

-- Create sync jobs table
CREATE TABLE spotify_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    target_id VARCHAR(255),
    parameters JSONB,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for job processing
CREATE INDEX idx_spotify_jobs_status ON spotify_sync_jobs(status, created_at);
CREATE INDEX idx_spotify_jobs_type ON spotify_sync_jobs(job_type, status);
```

## Performance Considerations

**Indexes for Efficient Queries:**
- `idx_songs_spotify_track_id` - Fast lookups when enriching search results
- `idx_songs_spotify_sync` - Efficient queries for tracks needing sync
- `idx_songs_popularity` - Support popularity-based sorting and filtering

**Data Integrity Rules:**
- Spotify track IDs must be unique when present (partial unique constraint)
- Popularity scores constrained to valid Spotify range (0-100)
- Audio feature decimals constrained to valid ranges (0.0-1.0)
- Foreign key constraints maintain referential integrity with users table

**Sync Strategy:**
- Spotify sync jobs track all background synchronization tasks
- Retry logic built into job status tracking
- Error messages stored for debugging failed sync operations