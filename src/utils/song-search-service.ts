import { prisma } from '../database/prisma';

/**
 * Interface for search result items
 */
export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number | null;
  releaseYear: number | null;
  popularity: number | null;
  similarity: number;
}

/**
 * Interface for search options
 */
export interface SearchOptions {
  limit?: number;
  threshold?: number;
}

/**
 * Validated search options with defaults applied
 */
export interface ValidatedSearchOptions {
  limit: number;
  threshold: number;
}

/**
 * Service class for fuzzy song searching using PostgreSQL's pg_trgm extension
 */
export class SongSearchService {
  private readonly DEFAULT_LIMIT = 20;
  private readonly MAX_LIMIT = 50;
  private readonly DEFAULT_THRESHOLD = 0.3;
  private readonly MIN_THRESHOLD = 0.1;
  private readonly MAX_THRESHOLD = 1.0;
  private readonly MIN_QUERY_LENGTH = 2;

  /**
   * Sanitize and normalize search query
   * @param query - Raw search query
   * @returns Sanitized query
   */
  sanitize_query(query: string): string {
    if (!query) return '';

    return query
      .toLowerCase()
      .trim()
      // Remove HTML tags and script content
      .replace(/<[^>]*>/g, '')
      // Remove special characters except spaces, letters, numbers, and basic punctuation
      .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F-]/g, ' ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validate search query
   * @param query - Search query to validate
   * @throws Error if query is invalid
   */
  validate_query(query: string): void {
    const sanitized = this.sanitize_query(query);
    if (sanitized.length < this.MIN_QUERY_LENGTH) {
      throw new Error(`Query must be at least ${this.MIN_QUERY_LENGTH} characters`);
    }
  }

  /**
   * Validate and normalize search options
   * @param options - Search options
   * @returns Validated options with defaults applied
   */
  validate_options(options: SearchOptions = {}): ValidatedSearchOptions {
    const limit = Math.min(
      Math.max(1, options.limit || this.DEFAULT_LIMIT),
      this.MAX_LIMIT
    );

    const threshold = Math.min(
      Math.max(this.MIN_THRESHOLD, options.threshold || this.DEFAULT_THRESHOLD),
      this.MAX_THRESHOLD
    );

    return { limit, threshold };
  }

  /**
   * Build and execute fuzzy search query using PostgreSQL's similarity function
   * @param sanitizedQuery - Sanitized search query
   * @param options - Validated search options
   * @returns Array of search results
   */
  private async execute_search_query(
    sanitizedQuery: string, 
    options: ValidatedSearchOptions
  ): Promise<SearchResult[]> {
    try {
      // Use Prisma raw query for fuzzy search with pg_trgm
      const results = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        artist: string;
        album: string | null;
        duration: number | null;
        releaseYear: number | null;
        popularity: number | null;
        similarity: number;
      }>>`
        SELECT 
          id,
          title,
          artist,
          album,
          duration,
          "releaseYear",
          popularity,
          similarity("searchVector", ${sanitizedQuery}) as similarity
        FROM "songs"
        WHERE similarity("searchVector", ${sanitizedQuery}) > ${options.threshold}
        ORDER BY similarity DESC
        LIMIT ${options.limit}
      `;

      return results.map(row => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        album: row.album,
        duration: row.duration,
        releaseYear: row.releaseYear,
        popularity: row.popularity,
        similarity: Number(row.similarity)
      }));
    } catch (error) {
      // Log error for debugging but don't expose database details
      console.error('Search query execution failed:', error);
      throw new Error('Search operation failed');
    }
  }

  /**
   * Perform fuzzy search for songs
   * @param query - Search query string
   * @param options - Search options (limit, threshold)
   * @returns Promise resolving to array of search results
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      // Validate and sanitize input
      this.validate_query(query);
      const sanitizedQuery = this.sanitize_query(query);
      const validatedOptions = this.validate_options(options);

      // Execute search
      const results = await this.execute_search_query(sanitizedQuery, validatedOptions);

      return results;
    } catch (error) {
      // Re-throw validation errors as-is
      if (error instanceof Error && error.message.includes('Query must be')) {
        throw error;
      }
      
      // Handle other errors gracefully
      console.error('Song search failed:', error);
      throw new Error('Search operation failed');
    }
  }

  /**
   * Get search suggestions based on partial query (for autocomplete)
   * @param query - Partial search query
   * @param limit - Maximum number of suggestions
   * @returns Promise resolving to array of suggested search terms
   */
  async get_suggestions(query: string, limit: number = 10): Promise<string[]> {
    if (!query || query.length < 1) {
      return [];
    }

    const sanitizedQuery = this.sanitize_query(query);
    
    try {
      // Get unique combinations of title and artist that match
      const suggestions = await prisma.$queryRaw<Array<{ suggestion: string }>>`
        SELECT DISTINCT 
          CONCAT(title, ' - ', artist) as suggestion
        FROM "songs"
        WHERE similarity("searchVector", ${sanitizedQuery}) > 0.2
        ORDER BY similarity("searchVector", ${sanitizedQuery}) DESC
        LIMIT ${Math.min(limit, 20)}
      `;

      return suggestions.map(s => s.suggestion);
    } catch (error) {
      console.error('Suggestion query failed:', error);
      return [];
    }
  }

  /**
   * Get search statistics for analytics
   * @param query - Search query
   * @returns Search metadata including timing and result count
   */
  async get_search_metadata(query: string, options: SearchOptions = {}): Promise<{
    query: string;
    sanitizedQuery: string;
    totalResults: number;
    processingTime: number;
    options: ValidatedSearchOptions;
  }> {
    const startTime = Date.now();
    
    try {
      const sanitizedQuery = this.sanitize_query(query);
      const validatedOptions = this.validate_options(options);
      
      // Count total results without limit
      const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM "songs"
        WHERE similarity("searchVector", ${sanitizedQuery}) > ${validatedOptions.threshold}
      `;
      
      const totalResults = Number(countResult[0]?.count || 0);
      const processingTime = Date.now() - startTime;
      
      return {
        query,
        sanitizedQuery,
        totalResults,
        processingTime,
        options: validatedOptions
      };
    } catch (error) {
      console.error('Metadata query failed:', error);
      return {
        query,
        sanitizedQuery: this.sanitize_query(query),
        totalResults: 0,
        processingTime: Date.now() - startTime,
        options: this.validate_options(options)
      };
    }
  }
}

// Export singleton instance for use across the application
export const songSearchService = new SongSearchService();