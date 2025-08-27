# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-27-spotify-search-integration/spec.md

## Schema Changes

No structural changes required to the database schema. The existing Song model already contains all necessary Spotify integration fields:

### Existing Fields Being Utilized
```prisma
model Song {
  spotifyId             String?   @unique  // Already exists for Spotify track ID
  spotifyLastSync       DateTime?          // Track when data was imported
  spotifyPopularity     Int?               // Spotify popularity score
  spotifyPreviewUrl     String?            // 30-second preview URL
  spotifyExternalUrl    String?            // Link to Spotify track
  audioFeaturesSynced   Boolean   @default(false)  // Track if audio features imported
  
  // Audio features from Spotify
  acousticness          Float?
  danceability          Float?
  energy                Float?
  valence               Float?
  speechiness           Float?
  liveness              Float?
  loudness              Float?
  instrumentalness      Float?
  tempo                 Float?
  key                   String?
}
```

## Data Migration

No migration required - schema already supports Spotify integration.

## Import Logic

When importing a Spotify track:
1. Check if track already exists using spotifyId unique constraint
2. If exists, update metadata and set spotifyLastSync to current timestamp
3. If new, create with all available Spotify metadata
4. Set audioFeaturesSynced=true if audio features are successfully imported
5. Update lastPopularityUpdate when importing/updating popularity

## Indexing Considerations

Existing indexes are sufficient:
- spotifyId has unique constraint (implicit index)
- Primary key (id) index for lookups
- No additional indexes needed for this feature