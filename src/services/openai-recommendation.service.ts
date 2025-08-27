import OpenAI from 'openai';
import crypto from 'crypto';

import { config } from '../config/environment';
import logger from '../utils/logger';
import { redis } from '../config/redis';
import { prisma } from '../database/prisma';
import { songSearchService } from '../utils/song-search-service';

export interface RecommendationParams {
  limit?: number;
  includeAnalysis?: boolean;
  forceRefresh?: boolean;
}

export interface AIRecommendation {
  title: string;
  artist: string;
  reason: string;
  score: number;
}

export interface RecommendationResult {
  song: any;
  score: number;
  reason: string;
}

export interface GenerateRecommendationsResponse {
  recommendations: RecommendationResult[];
  metadata: {
    inputSong: any;
    totalRecommendations: number;
    processingTimeMs: number;
    cacheHit: boolean;
    tokensUsed?: number;
  };
}

export class OpenAIRecommendationError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public cause?: Error
  ) {
    super(message);
    this.name = 'OpenAIRecommendationError';
  }
}

export class OpenAIRecommendationService {
  private readonly openaiClient: OpenAI;
  private readonly cacheKeyPrefix = 'ai_rec';
  private readonly cacheTTL = 3600; // 1 hour

  constructor() {
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: 5000, // 5 second timeout
    });
  }

  public async generateRecommendations(
    songId: string,
    params: RecommendationParams = {}
  ): Promise<GenerateRecommendationsResponse> {
    const startTime = Date.now();
    const { limit = 10, includeAnalysis = false, forceRefresh = false } = params;

    // Validate parameters
    if (limit < 1 || limit > 50) {
      throw new OpenAIRecommendationError('Limit must be between 1 and 50');
    }

    logger.info('Starting AI recommendation generation', {
      songId,
      limit,
      includeAnalysis,
      forceRefresh,
    });

    try {
      // Check cache first unless force refresh is requested
      if (!forceRefresh && !config.app.isTest) {
        const cachedResult = await this.getCachedRecommendations(songId, params);
        if (cachedResult) {
          logger.info('Returning cached AI recommendations', {
            songId,
            cacheHit: true,
            processingTimeMs: Date.now() - startTime,
          });
          return cachedResult;
        }
      }

      // Get input song from database
      const inputSong = await prisma.song.findUnique({
        where: { id: songId },
        select: {
          id: true,
          title: true,
          artist: true,
          album: true,
          genre: true,
          releaseYear: true,
          tempo: true,
          key: true,
          energy: true,
          danceability: true,
          valence: true,
          acousticness: true,
          instrumentalness: true,
          popularity: true,
        },
      });

      if (!inputSong) {
        logger.error('Song not found for recommendation generation', { songId });
        throw new OpenAIRecommendationError('Song not found', 404);
      }

      // Generate AI recommendations using GPT-4
      const aiResponse = await this.callOpenAI(inputSong, params);
      const aiRecommendations = this.parseRecommendationResponse(
        aiResponse.choices[0].message.content || '',
        songId
      );

      // Match AI recommendations to database songs
      const matchedRecommendations = await this.matchRecommendationsToSongs(
        aiRecommendations.recommendations
      );

      // Store recommendations in database for analytics
      await this.storeRecommendations(songId, matchedRecommendations, params);

      const result: GenerateRecommendationsResponse = {
        recommendations: matchedRecommendations,
        metadata: {
          inputSong,
          totalRecommendations: matchedRecommendations.length,
          processingTimeMs: Date.now() - startTime,
          cacheHit: false,
          tokensUsed: aiResponse.usage?.total_tokens,
        },
      };

      // Cache the results
      await this.cacheRecommendations(songId, params, matchedRecommendations, result.metadata);

      logger.info('AI recommendation generation completed', {
        songId,
        totalRecommendations: matchedRecommendations.length,
        processingTimeMs: result.metadata.processingTimeMs,
        tokensUsed: result.metadata.tokensUsed,
      });

      return result;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      if (error instanceof OpenAIRecommendationError) {
        throw error;
      }

      // Handle specific OpenAI errors
      if (error instanceof Error) {
        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          logger.error('OpenAI API timeout during recommendation generation', {
            songId,
            processingTimeMs,
            error: error.message,
          });
          throw new OpenAIRecommendationError('OpenAI API request timeout', 408, error);
        }

        if ('status' in error && (error as any).status === 429) {
          logger.warn('OpenAI API rate limit hit', {
            songId,
            processingTimeMs,
          });
          throw new OpenAIRecommendationError('OpenAI API rate limit exceeded', 429, error);
        }

        if ('status' in error && (error as any).status >= 500) {
          logger.error('OpenAI API server error', {
            songId,
            processingTimeMs,
            status: (error as any).status,
            error: error.message,
          });
          throw new OpenAIRecommendationError('OpenAI API server error', 503, error);
        }
      }

      logger.error('Unexpected error during AI recommendation generation', {
        songId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new OpenAIRecommendationError(
        'Failed to generate AI recommendations',
        500,
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private async callOpenAI(inputSong: any, params: RecommendationParams): Promise<any> {
    const prompt = this.buildPrompt(inputSong, params);

    try {
      const response = await this.openaiClient.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
        response_format: { type: 'json_object' },
      });

      return response;
    } catch (error) {
      logger.error('OpenAI API call failed', {
        songId: inputSong.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert music recommendation system that analyzes songs based on their musical attributes and metadata. Your task is to recommend similar songs based on multiple factors including:

1. Musical characteristics (tempo, key, energy, danceability, valence, acousticness, instrumentalness)
2. Genre and style similarities
3. Artist and album context
4. Release year and era
5. Overall musical mood and feeling

You must respond with a valid JSON object containing a "recommendations" array. Each recommendation should include:
- title: The exact song title
- artist: The exact artist name  
- reason: A brief explanation of why this song is similar (focus on musical attributes)
- score: A similarity score between 0.0 and 1.0 (1.0 being most similar)

Focus on recommending songs that share similar musical DNA rather than just the same genre. Consider tempo matching, energy levels, mood (valence), and acoustic characteristics.`;
  }

  private buildPrompt(inputSong: any, params: RecommendationParams): string {
    const { limit = 10, includeAnalysis = false } = params;
    
    let prompt = `Please recommend ${limit} songs similar to this track:\n\n`;
    
    prompt += `**Song**: "${inputSong.title}" by ${inputSong.artist}\n`;
    
    if (inputSong.album) {
      prompt += `**Album**: ${inputSong.album}\n`;
    }
    
    if (inputSong.genre) {
      prompt += `**Genre**: ${inputSong.genre}\n`;
    }
    
    if (inputSong.releaseYear) {
      prompt += `**Release Year**: ${inputSong.releaseYear}\n`;
    }
    
    prompt += '\n**Musical Attributes**:\n';
    
    if (inputSong.tempo) {
      prompt += `- Tempo: ${inputSong.tempo} BPM\n`;
    }
    
    if (inputSong.key) {
      prompt += `- Key: ${inputSong.key}\n`;
    }
    
    if (inputSong.energy !== null) {
      prompt += `- Energy: ${inputSong.energy} (0.0 = low energy, 1.0 = high energy)\n`;
    }
    
    if (inputSong.danceability !== null) {
      prompt += `- Danceability: ${inputSong.danceability} (0.0 = not danceable, 1.0 = very danceable)\n`;
    }
    
    if (inputSong.valence !== null) {
      prompt += `- Valence: ${inputSong.valence} (0.0 = sad/negative, 1.0 = happy/positive)\n`;
    }
    
    if (inputSong.acousticness !== null) {
      prompt += `- Acousticness: ${inputSong.acousticness} (0.0 = not acoustic, 1.0 = very acoustic)\n`;
    }
    
    if (inputSong.instrumentalness !== null) {
      prompt += `- Instrumentalness: ${inputSong.instrumentalness} (0.0 = vocal track, 1.0 = instrumental)\n`;
    }
    
    if (inputSong.popularity) {
      prompt += `- Popularity: ${inputSong.popularity}/100\n`;
    }
    
    prompt += '\nPlease find songs with similar musical characteristics and provide your recommendations in the requested JSON format.';
    
    if (includeAnalysis) {
      prompt += ' Include detailed analysis of why each song matches the input song\'s musical profile.';
    }
    
    return prompt;
  }

  private parseRecommendationResponse(content: string, songId: string): { recommendations: AIRecommendation[] } {
    try {
      const parsed = JSON.parse(content);
      
      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new Error('Missing or invalid recommendations array');
      }
      
      // Validate each recommendation structure
      for (const rec of parsed.recommendations) {
        if (!rec.title || !rec.artist || typeof rec.score !== 'number') {
          throw new Error('Invalid recommendation structure');
        }
        
        // Ensure score is within valid range
        if (rec.score < 0 || rec.score > 1) {
          rec.score = Math.max(0, Math.min(1, rec.score));
        }
      }
      
      return parsed;
    } catch (error) {
      logger.error('Failed to parse OpenAI recommendation response', {
        songId,
        response: content,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      });
      throw new OpenAIRecommendationError('Invalid OpenAI response format', 502);
    }
  }

  private async matchRecommendationsToSongs(aiRecommendations: AIRecommendation[]): Promise<RecommendationResult[]> {
    if (aiRecommendations.length === 0) {
      return [];
    }
    
    const results: RecommendationResult[] = [];
    const unmatchedRecommendations: AIRecommendation[] = [];
    
    try {
      // Use fuzzy search to match each AI recommendation to database songs
      for (const aiRec of aiRecommendations) {
        // Create a search query combining title and artist
        const searchQuery = `${aiRec.title} ${aiRec.artist}`;
        
        try {
          // Search with a lower threshold for better matching and limit to top 3 results
          const searchResults = await songSearchService.search(searchQuery, {
            limit: 3,
            threshold: 0.25, // Lower threshold for more lenient matching
          });
          
          if (searchResults.length > 0) {
            // Take the best match (highest similarity)
            const bestMatch = searchResults[0];
            
            // Get full song details from database
            const fullSong = await prisma.song.findUnique({
              where: { id: bestMatch.id },
              select: {
                id: true,
                title: true,
                artist: true,
                album: true,
                genre: true,
                releaseYear: true,
                tempo: true,
                key: true,
                energy: true,
                danceability: true,
                valence: true,
                popularity: true,
                previewUrl: true,
              },
            });
            
            if (fullSong) {
              // Combine AI score with search similarity for final score
              const combinedScore = (aiRec.score * 0.7) + (bestMatch.similarity * 0.3);
              
              results.push({
                song: fullSong,
                score: Math.round(combinedScore * 100) / 100, // Round to 2 decimal places
                reason: aiRec.reason || 'Similar musical characteristics',
              });
              
              logger.debug('Successfully matched AI recommendation using fuzzy search', {
                aiRecommendation: `${aiRec.title} - ${aiRec.artist}`,
                matchedSong: `${fullSong.title} - ${fullSong.artist}`,
                similarity: bestMatch.similarity,
                finalScore: combinedScore,
              });
            } else {
              unmatchedRecommendations.push(aiRec);
            }
          } else {
            unmatchedRecommendations.push(aiRec);
            logger.debug('No fuzzy search matches found for AI recommendation', {
              searchQuery,
              aiRecommendation: aiRec,
            });
          }
        } catch (searchError) {
          logger.warn('Fuzzy search failed for AI recommendation', {
            searchQuery,
            aiRecommendation: aiRec,
            error: searchError instanceof Error ? searchError.message : 'Unknown search error',
          });
          unmatchedRecommendations.push(aiRec);
        }
      }
      
      // Log matching results
      if (results.length === 0) {
        logger.warn('No matching songs found for AI recommendations using fuzzy search', {
          totalAIRecommendations: aiRecommendations.length,
          unmatchedCount: unmatchedRecommendations.length,
        });
      } else {
        logger.info('Successfully matched AI recommendations using fuzzy search', {
          totalAIRecommendations: aiRecommendations.length,
          matchedSongs: results.length,
          unmatchedSongs: unmatchedRecommendations.length,
          matchRate: Math.round((results.length / aiRecommendations.length) * 100),
        });
      }
      
      return results;
    } catch (error) {
      logger.error('Error matching AI recommendations to database songs with fuzzy search', {
        error: error instanceof Error ? error.message : 'Unknown error',
        totalAIRecommendations: aiRecommendations.length,
        partialResults: results.length,
      });
      throw error;
    }
  }

  private async storeRecommendations(
    inputSongId: string,
    recommendations: RecommendationResult[],
    params: RecommendationParams
  ): Promise<void> {
    try {
      const recommendationsData = recommendations.map(rec => ({
        inputSongId,
        recommendedSongId: rec.song.id,
        score: rec.score,
        reason: rec.reason,
        modelVersion: config.openai.model,
        cachedUntil: new Date(Date.now() + this.cacheTTL * 1000),
        requestParameters: params as any,
      }));

      if (recommendationsData.length > 0) {
        await prisma.aIRecommendation.createMany({
          data: recommendationsData,
          skipDuplicates: true,
        });

        logger.info('Stored AI recommendations in database', {
          inputSongId,
          storedCount: recommendationsData.length,
        });
      }
    } catch (error) {
      // Log error but don't fail the entire operation
      logger.warn('Failed to store AI recommendations in database', {
        inputSongId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async storeBatchRecommendations(
    batchResults: Array<{
      inputSongId: string;
      success: boolean;
      recommendations?: RecommendationResult[];
    }>,
    params: RecommendationParams
  ): Promise<void> {
    try {
      // Collect all successful recommendations for batch insert
      const allRecommendationsData = batchResults
        .filter(result => result.success && result.recommendations)
        .flatMap(result => 
          result.recommendations!.map(rec => ({
            inputSongId: result.inputSongId,
            recommendedSongId: rec.song.id,
            score: rec.score,
            reason: rec.reason,
            modelVersion: config.openai.model,
            cachedUntil: new Date(Date.now() + this.cacheTTL * 1000),
            requestParameters: params as any,
          }))
        );

      if (allRecommendationsData.length > 0) {
        // Use transaction for batch operations with optimized timeout
        await prisma.$transaction(async (tx) => {
          await tx.aIRecommendation.createMany({
            data: allRecommendationsData,
            skipDuplicates: true,
          });
        }, {
          timeout: 30000, // Extended timeout for batch operations
          maxWait: 5000,  // Max time to wait for connection
        });

        logger.info('Successfully stored batch AI recommendations', {
          totalRecommendations: allRecommendationsData.length,
          uniqueInputSongs: new Set(batchResults.map(r => r.inputSongId)).size,
          parameters: params,
        });
      }
    } catch (error) {
      logger.error('Failed to store batch AI recommendations', {
        error: error instanceof Error ? error.message : 'Unknown batch storage error',
        batchSize: batchResults.length,
        parameters: params,
      });
      // Don't throw here to avoid breaking the main flow
    }
  }

  private async getCachedRecommendations(
    songId: string,
    params: RecommendationParams
  ): Promise<GenerateRecommendationsResponse | null> {
    try {
      const cacheKey = this.generateCacheKey(songId, params);
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        return {
          ...parsed,
          metadata: {
            ...parsed.metadata,
            cacheHit: true,
          },
        };
      }
      
      return null;
    } catch (error) {
      logger.warn('Error retrieving cached AI recommendations', {
        songId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private async cacheRecommendations(
    songId: string,
    params: RecommendationParams,
    recommendations: RecommendationResult[],
    metadata: any
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(songId, params);
      const cacheData = {
        recommendations,
        metadata: {
          ...metadata,
          cacheHit: false,
        },
      };
      
      await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(cacheData));
      
      logger.debug('Cached AI recommendations', {
        songId,
        cacheKey,
        ttl: this.cacheTTL,
      });
    } catch (error) {
      logger.warn('Failed to cache AI recommendations', {
        songId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private generateCacheKey(songId: string, params: RecommendationParams): string {
    const paramString = JSON.stringify({
      limit: params.limit || 10,
      includeAnalysis: params.includeAnalysis || false,
    });
    const paramHash = crypto.createHash('md5').update(paramString).digest('hex').substring(0, 8);
    return `${this.cacheKeyPrefix}:${songId}:${paramHash}`;
  }
}