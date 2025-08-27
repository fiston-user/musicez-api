# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-08-27-spotify-search-integration/spec.md

## Technical Requirements

### Search Controller Updates
- Replace SongSearchService with EnhancedSongSearchService in search.controller.ts
- Implement proper handling of the 'enrich' parameter to trigger Spotify search
- Pass userId to the enhanced search service for Spotify connection validation
- Update response handling to include source information for each result
- Maintain backward compatibility with existing search functionality

### Enhanced Search Service Integration  
- Utilize existing searchWithSpotifyEnrichment method in the controller
- Implement proper error handling for Spotify API failures with graceful fallback
- Ensure parallel execution using Promise.allSettled for performance
- Validate user has active Spotify connection before attempting Spotify search
- Respect the MAX_SPOTIFY_RESULTS limit (50) to prevent API rate limit issues

### Result Merging Logic
- Use existing mergeResults method which prioritizes local results
- Ensure deduplication based on title and artist matching
- Preserve similarity scores from local search
- Add Spotify-specific metadata (preview URLs, external URLs, audio features)
- Mark results with appropriate source: 'local', 'spotify', or 'merged'

### Caching Strategy
- Leverage existing Redis caching with differentiated TTL (5 min local, 1 hour Spotify)
- Include enrich parameter in cache key generation
- Implement cache bypass when fresh=true parameter is provided
- Cache merged results to reduce API calls

### Performance Requirements
- Maintain sub-200ms response time for local-only searches
- Target sub-500ms for combined local+Spotify searches
- Use connection pooling for database queries
- Implement request timeout of 5 seconds for Spotify API calls
- Log performance warnings when targets are exceeded

### Spotify Track Import
- Validate Spotify track ID format before import
- Fetch complete track metadata including audio features
- Map Spotify fields to local database schema
- Handle duplicate prevention using Spotify ID uniqueness
- Return imported track with local database ID

## External Dependencies

No new external dependencies required - all necessary packages are already installed:
- @spotify/web-api-ts-sdk (already in use)
- ioredis for caching (already configured)
- Existing Spotify OAuth implementation