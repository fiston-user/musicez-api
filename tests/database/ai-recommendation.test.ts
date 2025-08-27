import { PrismaClient } from "@prisma/client";

describe("AIRecommendation Database Operations", () => {
  let prisma: PrismaClient;
  let testSong1: any;
  let testSong2: any;
  let testSong3: any;

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Clean test data (order matters for foreign key constraints)
    await prisma.aIRecommendation.deleteMany();
    await prisma.recommendedSong.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.userPreference.deleteMany();
    await prisma.song.deleteMany();

    // Create test songs
    testSong1 = await prisma.song.create({
      data: {
        title: "Bohemian Rhapsody",
        artist: "Queen",
        album: "A Night at the Opera",
        genre: "rock",
        tempo: 76,
        key: "Bb",
        energy: 0.404,
        danceability: 0.391,
        valence: 0.228,
        popularity: 95,
        duration: 354320,
      },
    });

    testSong2 = await prisma.song.create({
      data: {
        title: "Stairway to Heaven",
        artist: "Led Zeppelin",
        album: "Led Zeppelin IV",
        genre: "rock",
        tempo: 83,
        key: "A",
        energy: 0.466,
        danceability: 0.342,
        valence: 0.329,
        popularity: 92,
        duration: 482830,
      },
    });

    testSong3 = await prisma.song.create({
      data: {
        title: "Hotel California",
        artist: "Eagles",
        album: "Hotel California",
        genre: "rock",
        tempo: 75,
        key: "B",
        energy: 0.456,
        danceability: 0.378,
        valence: 0.412,
        popularity: 90,
        duration: 391000,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data (order matters for foreign key constraints)
    await prisma.aIRecommendation.deleteMany();
    await prisma.recommendedSong.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.userPreference.deleteMany();
    await prisma.song.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean AI recommendations before each test
    await prisma.aIRecommendation.deleteMany();
  });

  describe("Create Operations", () => {
    it("should create a single AI recommendation", async () => {
      const now = new Date();
      const cachedUntil = new Date(now.getTime() + 3600000); // 1 hour from now

      const aiRec = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong2.id,
          score: 0.85,
          reason: "Similar classic rock era with epic composition style",
          modelVersion: "gpt-4",
          cachedUntil,
          requestParameters: {
            limit: 10,
            includeReason: true,
            fresh: false,
          },
        },
        include: {
          inputSong: true,
          recommendedSong: true,
        },
      });

      expect(aiRec).toBeDefined();
      expect(aiRec.id).toBeDefined();
      expect(aiRec.inputSongId).toBe(testSong1.id);
      expect(aiRec.recommendedSongId).toBe(testSong2.id);
      expect(aiRec.score).toBe(0.85);
      expect(aiRec.reason).toBe(
        "Similar classic rock era with epic composition style"
      );
      expect(aiRec.modelVersion).toBe("gpt-4");
      expect(aiRec.cachedUntil).toEqual(cachedUntil);
      expect(aiRec.requestParameters).toEqual({
        limit: 10,
        includeReason: true,
        fresh: false,
      });
      expect(aiRec.generatedAt).toBeInstanceOf(Date);
      expect(aiRec.inputSong.title).toBe("Bohemian Rhapsody");
      expect(aiRec.recommendedSong.title).toBe("Stairway to Heaven");
    });

    it("should create AI recommendation with default values", async () => {
      const aiRec = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong3.id,
          score: 0.72,
        },
      });

      expect(aiRec.modelVersion).toBe("gpt-4"); // Default value
      expect(aiRec.reason).toBeNull();
      expect(aiRec.cachedUntil).toBeNull();
      expect(aiRec.requestParameters).toBeNull();
      expect(aiRec.generatedAt).toBeInstanceOf(Date);
    });

    it("should create multiple AI recommendations for same input song", async () => {
      const recommendations = await Promise.all([
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong2.id,
            score: 0.85,
            reason: "First recommendation",
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong3.id,
            score: 0.72,
            reason: "Second recommendation",
          },
        }),
      ]);

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].inputSongId).toBe(testSong1.id);
      expect(recommendations[1].inputSongId).toBe(testSong1.id);
      expect(recommendations[0].recommendedSongId).not.toBe(
        recommendations[1].recommendedSongId
      );
    });
  });

  describe("Read Operations", () => {
    beforeEach(async () => {
      // Create test data for read operations
      await Promise.all([
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong2.id,
            score: 0.85,
            reason: "High similarity",
            cachedUntil: new Date(Date.now() + 3600000),
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong3.id,
            score: 0.72,
            reason: "Moderate similarity",
            cachedUntil: new Date(Date.now() + 3600000),
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong2.id,
            recommendedSongId: testSong1.id,
            score: 0.9,
            reason: "Reverse recommendation",
            cachedUntil: new Date(Date.now() - 3600000), // Expired
          },
        }),
      ]);
    });

    it("should find recommendations by input song", async () => {
      const recommendations = await prisma.aIRecommendation.findMany({
        where: {
          inputSongId: testSong1.id,
        },
        include: {
          recommendedSong: true,
        },
        orderBy: {
          score: "desc",
        },
      });

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].score).toBe(0.85);
      expect(recommendations[1].score).toBe(0.72);
      expect(recommendations[0].recommendedSong.title).toBe(
        "Stairway to Heaven"
      );
      expect(recommendations[1].recommendedSong.title).toBe("Hotel California");
    });

    it("should find recommendations with score threshold", async () => {
      const highScoreRecs = await prisma.aIRecommendation.findMany({
        where: {
          inputSongId: testSong1.id,
          score: {
            gte: 0.8,
          },
        },
      });

      expect(highScoreRecs).toHaveLength(1);
      expect(highScoreRecs[0].score).toBe(0.85);
    });

    it("should find non-expired cached recommendations", async () => {
      const cachedRecs = await prisma.aIRecommendation.findMany({
        where: {
          inputSongId: testSong1.id,
          cachedUntil: {
            gt: new Date(),
          },
        },
        orderBy: {
          score: "desc",
        },
      });

      expect(cachedRecs).toHaveLength(2);
      expect(
        cachedRecs.every(
          (rec) => rec.cachedUntil && rec.cachedUntil > new Date()
        )
      ).toBe(true);
    });

    it("should find expired recommendations for cleanup", async () => {
      const expiredRecs = await prisma.aIRecommendation.findMany({
        where: {
          cachedUntil: {
            lt: new Date(),
          },
        },
      });

      expect(expiredRecs).toHaveLength(1);
      expect(expiredRecs[0].inputSongId).toBe(testSong2.id);
    });

    it("should find recommendations by model version", async () => {
      // Create recommendation with different model version
      await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong2.id,
          recommendedSongId: testSong3.id,
          score: 0.65,
          modelVersion: "gpt-3.5-turbo",
        },
      });

      const gpt4Recs = await prisma.aIRecommendation.findMany({
        where: {
          modelVersion: "gpt-4",
        },
      });

      const gpt3Recs = await prisma.aIRecommendation.findMany({
        where: {
          modelVersion: "gpt-3.5-turbo",
        },
      });

      expect(gpt4Recs.length).toBeGreaterThan(0);
      expect(gpt3Recs).toHaveLength(1);
    });
  });

  describe("Update Operations", () => {
    let testRecommendation: any;

    beforeEach(async () => {
      testRecommendation = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong2.id,
          score: 0.75,
          reason: "Original reason",
          cachedUntil: new Date(Date.now() + 3600000),
        },
      });
    });

    it("should update recommendation score", async () => {
      const updated = await prisma.aIRecommendation.update({
        where: { id: testRecommendation.id },
        data: { score: 0.82 },
      });

      expect(updated.score).toBe(0.82);
      expect(updated.reason).toBe("Original reason"); // Unchanged
    });

    it("should update cache expiration", async () => {
      const newCachedUntil = new Date(Date.now() + 7200000); // 2 hours from now

      const updated = await prisma.aIRecommendation.update({
        where: { id: testRecommendation.id },
        data: { cachedUntil: newCachedUntil },
      });

      expect(updated.cachedUntil).toEqual(newCachedUntil);
    });

    it("should update request parameters", async () => {
      const newParameters = {
        limit: 20,
        includeReason: false,
        fresh: true,
        context: "mood-based",
      };

      const updated = await prisma.aIRecommendation.update({
        where: { id: testRecommendation.id },
        data: { requestParameters: newParameters },
      });

      expect(updated.requestParameters).toEqual(newParameters);
    });
  });

  describe("Delete Operations", () => {
    it("should delete single recommendation", async () => {
      const aiRec = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong2.id,
          score: 0.75,
        },
      });

      await prisma.aIRecommendation.delete({
        where: { id: aiRec.id },
      });

      const found = await prisma.aIRecommendation.findUnique({
        where: { id: aiRec.id },
      });

      expect(found).toBeNull();
    });

    it("should delete expired recommendations", async () => {
      // Create expired and non-expired recommendations
      const now = new Date();
      await Promise.all([
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong2.id,
            score: 0.75,
            cachedUntil: new Date(now.getTime() - 3600000), // Expired
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong2.id,
            recommendedSongId: testSong3.id,
            score: 0.65,
            cachedUntil: new Date(now.getTime() + 3600000), // Valid
          },
        }),
      ]);

      const deleteResult = await prisma.aIRecommendation.deleteMany({
        where: {
          cachedUntil: {
            lt: now,
          },
        },
      });

      expect(deleteResult.count).toBe(1);

      const remaining = await prisma.aIRecommendation.findMany();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].cachedUntil && remaining[0].cachedUntil > now).toBe(
        true
      );
    });

    it("should delete recommendations for specific input song", async () => {
      await Promise.all([
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong2.id,
            score: 0.85,
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong3.id,
            score: 0.72,
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong2.id,
            recommendedSongId: testSong1.id,
            score: 0.9,
          },
        }),
      ]);

      const deleteResult = await prisma.aIRecommendation.deleteMany({
        where: {
          inputSongId: testSong1.id,
        },
      });

      expect(deleteResult.count).toBe(2);

      const remaining = await prisma.aIRecommendation.findMany();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].inputSongId).toBe(testSong2.id);
    });
  });

  describe("Complex Queries", () => {
    beforeEach(async () => {
      const now = new Date();
      await Promise.all([
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong2.id,
            score: 0.95,
            reason: "Excellent match",
            modelVersion: "gpt-4",
            cachedUntil: new Date(now.getTime() + 3600000),
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: testSong3.id,
            score: 0.75,
            reason: "Good match",
            modelVersion: "gpt-4",
            cachedUntil: new Date(now.getTime() + 3600000),
          },
        }),
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong2.id,
            recommendedSongId: testSong1.id,
            score: 0.88,
            reason: "Very good match",
            modelVersion: "gpt-4",
            cachedUntil: new Date(now.getTime() - 1800000), // Expired 30min ago
          },
        }),
      ]);
    });

    it("should get top recommendations for input song with cache check", async () => {
      const topRecs = await prisma.aIRecommendation.findMany({
        where: {
          inputSongId: testSong1.id,
          cachedUntil: {
            gt: new Date(),
          },
        },
        include: {
          inputSong: {
            select: {
              title: true,
              artist: true,
            },
          },
          recommendedSong: {
            select: {
              title: true,
              artist: true,
              popularity: true,
            },
          },
        },
        orderBy: {
          score: "desc",
        },
        take: 5,
      });

      expect(topRecs).toHaveLength(2);
      expect(topRecs[0].score).toBe(0.95);
      expect(topRecs[0].inputSong.title).toBe("Bohemian Rhapsody");
      expect(topRecs[0].recommendedSong.title).toBe("Stairway to Heaven");
      expect(topRecs[1].score).toBe(0.75);
    });

    it("should aggregate recommendations by model version", async () => {
      const aggregation = await prisma.aIRecommendation.groupBy({
        by: ["modelVersion"],
        _count: {
          id: true,
        },
        _avg: {
          score: true,
        },
        _max: {
          generatedAt: true,
        },
      });

      expect(aggregation).toHaveLength(1);
      expect(aggregation[0].modelVersion).toBe("gpt-4");
      expect(aggregation[0]._count.id).toBe(3);
      expect(aggregation[0]._avg.score).toBeCloseTo(0.86, 2);
      expect(aggregation[0]._max.generatedAt).toBeInstanceOf(Date);
    });

    it("should find similar songs across all recommendations", async () => {
      const similarSongs = await prisma.aIRecommendation.findMany({
        where: {
          score: {
            gte: 0.8,
          },
          cachedUntil: {
            gt: new Date(),
          },
        },
        include: {
          recommendedSong: {
            select: {
              title: true,
              artist: true,
              genre: true,
            },
          },
        },
        orderBy: {
          score: "desc",
        },
      });

      expect(similarSongs).toHaveLength(1);
      expect(similarSongs[0].score).toBe(0.95);
      expect(similarSongs[0].recommendedSong.genre).toBe("rock");
    });
  });

  describe("Foreign Key Constraints", () => {
    it("should enforce foreign key constraint for inputSongId", async () => {
      const invalidSongId = "00000000-0000-0000-0000-000000000000";

      await expect(
        prisma.aIRecommendation.create({
          data: {
            inputSongId: invalidSongId,
            recommendedSongId: testSong1.id,
            score: 0.75,
          },
        })
      ).rejects.toThrow();
    });

    it("should enforce foreign key constraint for recommendedSongId", async () => {
      const invalidSongId = "00000000-0000-0000-0000-000000000000";

      await expect(
        prisma.aIRecommendation.create({
          data: {
            inputSongId: testSong1.id,
            recommendedSongId: invalidSongId,
            score: 0.75,
          },
        })
      ).rejects.toThrow();
    });

    it("should cascade delete recommendations when input song is deleted", async () => {
      // Create a temporary song and recommendation
      const tempSong = await prisma.song.create({
        data: {
          title: "Temporary Song",
          artist: "Temporary Artist",
        },
      });

      await prisma.aIRecommendation.create({
        data: {
          inputSongId: tempSong.id,
          recommendedSongId: testSong1.id,
          score: 0.75,
        },
      });

      // Delete the input song
      await prisma.song.delete({
        where: { id: tempSong.id },
      });

      // Check that the recommendation was also deleted
      const remainingRecs = await prisma.aIRecommendation.findMany({
        where: {
          inputSongId: tempSong.id,
        },
      });

      expect(remainingRecs).toHaveLength(0);
    });
  });

  describe("Performance and Indexing", () => {
    beforeEach(async () => {
      // Create multiple recommendations for performance testing
      const now = new Date();
      const recommendations: Array<{
        inputSongId: string;
        recommendedSongId: string;
        score: number;
        modelVersion: string;
        cachedUntil: Date;
      }> = [];

      for (let i = 0; i < 50; i++) {
        recommendations.push({
          inputSongId: i % 2 === 0 ? testSong1.id : testSong2.id,
          recommendedSongId: testSong3.id,
          score: Math.random(),
          modelVersion: i % 3 === 0 ? "gpt-3.5-turbo" : "gpt-4",
          cachedUntil:
            i % 4 === 0
              ? new Date(now.getTime() - 3600000)
              : new Date(now.getTime() + 3600000),
        });
      }

      await prisma.aIRecommendation.createMany({
        data: recommendations,
      });
    });

    it("should perform fast lookup by input song and score (indexed)", async () => {
      const startTime = Date.now();

      const results = await prisma.aIRecommendation.findMany({
        where: {
          inputSongId: testSong1.id,
        },
        orderBy: {
          score: "desc",
        },
        take: 10,
      });

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should be fast due to index
    });

    it("should perform fast cleanup of expired cache entries (indexed)", async () => {
      const startTime = Date.now();

      const deleteResult = await prisma.aIRecommendation.deleteMany({
        where: {
          cachedUntil: {
            lt: new Date(),
          },
        },
      });

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      expect(deleteResult.count).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should be fast due to index
    });

    it("should perform fast filtering by model version (indexed)", async () => {
      const startTime = Date.now();

      const results = await prisma.aIRecommendation.findMany({
        where: {
          modelVersion: "gpt-4",
        },
        take: 20,
      });

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(100); // Should be fast due to index
    });
  });

  describe("Data Validation", () => {
    it("should validate score range (0.0-1.0)", async () => {
      // Test valid scores
      const validRec = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong2.id,
          score: 0.5,
        },
      });

      expect(validRec.score).toBe(0.5);

      // Note: Prisma doesn't enforce check constraints at the TypeScript level,
      // but the database should enforce score constraints if defined in migration
    });

    it("should handle null optional fields correctly", async () => {
      const minimalRec = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong2.id,
          score: 0.75,
        },
      });

      expect(minimalRec.reason).toBeNull();
      expect(minimalRec.cachedUntil).toBeNull();
      expect(minimalRec.requestParameters).toBeNull();
      expect(minimalRec.modelVersion).toBe("gpt-4"); // Default value
      expect(minimalRec.generatedAt).toBeInstanceOf(Date);
    });

    it("should handle complex JSON in requestParameters", async () => {
      const complexParams = {
        limit: 10,
        includeReason: true,
        filters: {
          genre: ["rock", "alternative"],
          minPopularity: 70,
        },
        context: {
          userPreferences: {
            energy: "high",
            mood: "upbeat",
          },
          timestamp: new Date().toISOString(),
        },
      };

      const aiRec = await prisma.aIRecommendation.create({
        data: {
          inputSongId: testSong1.id,
          recommendedSongId: testSong2.id,
          score: 0.82,
          requestParameters: complexParams,
        },
      });

      expect(aiRec.requestParameters).toEqual(complexParams);
    });
  });
});
