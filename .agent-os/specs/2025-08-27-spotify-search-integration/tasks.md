# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-08-27-spotify-search-integration/spec.md

> Created: 2025-08-27
> Status: Ready for Implementation

## Tasks

- [x] 1. Wire EnhancedSongSearchService to Search Controller
  - [x] 1.1 Write tests for EnhancedSongSearchService integration
  - [x] 1.2 Replace SongSearchService with EnhancedSongSearchService in controller
  - [x] 1.3 Update enhancedSearchSongs method to use searchWithSpotifyEnrichment
  - [x] 1.4 Handle the 'enrich' parameter to enable Spotify search
  - [x] 1.5 Pass userId to enhanced search service for Spotify validation
  - [x] 1.6 Update response handling to include source information
  - [x] 1.7 Verify all integration tests pass

- [ ] 2. Implement Parallel Search Execution
  - [ ] 2.1 Write tests for parallel search functionality
  - [ ] 2.2 Verify Promise.allSettled implementation in service
  - [ ] 2.3 Test graceful fallback when Spotify API fails
  - [ ] 2.4 Validate user Spotify connection before search
  - [ ] 2.5 Implement proper timeout handling (5 second max)
  - [ ] 2.6 Verify performance targets (sub-500ms combined search)
  - [ ] 2.7 Verify all parallel search tests pass

- [ ] 3. Optimize Result Merging and Caching
  - [ ] 3.1 Write tests for result merging logic
  - [ ] 3.2 Test deduplication based on title/artist matching
  - [ ] 3.3 Verify source marking (local/spotify/merged)
  - [ ] 3.4 Test cache key generation with enrich parameter
  - [ ] 3.5 Verify differentiated TTL (5min local, 1hr Spotify)
  - [ ] 3.6 Test fresh parameter bypasses cache
  - [ ] 3.7 Verify all caching tests pass

- [ ] 4. Create Spotify Track Import Endpoint
  - [ ] 4.1 Write tests for track import endpoint
  - [ ] 4.2 Create importSpotifyTrack controller method
  - [ ] 4.3 Implement Spotify track ID validation
  - [ ] 4.4 Fetch complete track metadata including audio features
  - [ ] 4.5 Map Spotify fields to local database schema
  - [ ] 4.6 Handle duplicate prevention using spotifyId uniqueness
  - [ ] 4.7 Add POST /songs/import-spotify route with authentication
  - [ ] 4.8 Verify all import endpoint tests pass

- [ ] 5. End-to-End Testing and Documentation
  - [ ] 5.1 Write end-to-end integration tests
  - [ ] 5.2 Test complete search flow with real Spotify connection
  - [ ] 5.3 Verify performance metrics are logged correctly
  - [ ] 5.4 Test error scenarios and fallback behavior
  - [ ] 5.5 Update API documentation with new parameters
  - [ ] 5.6 Verify all tests pass with coverage targets met