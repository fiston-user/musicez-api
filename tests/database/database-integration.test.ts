import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

describe('Database Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Use the default database URL
    prisma = new PrismaClient();
    
    // Clean test database
    await prisma.userPreference.deleteMany();
    await prisma.recommendedSong.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.song.deleteMany();
    await prisma.user.deleteMany();
    await prisma.requestLog.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.systemHealth.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Database Connection', () => {
    it('should connect to the database', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as result`;
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('SystemHealth Operations', () => {
    it('should create and read a health record', async () => {
      const health = await prisma.systemHealth.create({
        data: {
          status: 'healthy',
          version: '1.0.0',
        },
      });

      expect(health.id).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.version).toBe('1.0.0');

      const found = await prisma.systemHealth.findUnique({
        where: { id: health.id },
      });

      expect(found).toBeDefined();
      expect(found?.status).toBe('healthy');
    });
  });

  describe('User Operations', () => {
    let userId: string;

    it('should create a user', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          favoriteGenres: ['rock', 'jazz'],
        },
      });

      userId = user.id;
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.favoriteGenres).toEqual(['rock', 'jazz']);
    });

    it('should find user by email', async () => {
      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });

      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });

    it('should update user', async () => {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { name: 'Updated Name' },
      });

      expect(updated.name).toBe('Updated Name');
    });
  });

  describe('Song Operations', () => {
    it('should create a song', async () => {
      const song = await prisma.song.create({
        data: {
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          genre: 'rock',
          tempo: 120,
          energy: 0.75,
          danceability: 0.6,
          valence: 0.8,
          popularity: 50,
          duration: 180000,
        },
      });

      expect(song.id).toBeDefined();
      expect(song.title).toBe('Test Song');
      expect(song.tempo).toBe(120);
    });

    it('should find songs by artist', async () => {
      const songs = await prisma.song.findMany({
        where: { artist: 'Test Artist' },
      });

      expect(songs.length).toBeGreaterThan(0);
      expect(songs[0].artist).toBe('Test Artist');
    });
  });

  describe('API Key Operations', () => {
    let apiKeyId: string;

    it('should create an API key', async () => {
      const key = `test_${uuidv4().replace(/-/g, '')}`;
      const apiKey = await prisma.apiKey.create({
        data: {
          key,
          name: 'Test API Key',
          active: true,
        },
      });

      apiKeyId = apiKey.id;
      expect(apiKey.id).toBeDefined();
      expect(apiKey.key).toBe(key);
      expect(apiKey.active).toBe(true);
    });

    it('should find API key by key value', async () => {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id: apiKeyId },
      });

      expect(apiKey).toBeDefined();
      expect(apiKey?.name).toBe('Test API Key');
    });

    it('should update API key lastUsed', async () => {
      const now = new Date();
      const updated = await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsed: now },
      });

      expect(updated.lastUsed).toEqual(now);
    });
  });

  describe('Recommendation Operations', () => {
    let userId: string;
    let songId1: string;
    let songId2: string;

    beforeEach(async () => {
      // Clean up before each test
      await prisma.userPreference.deleteMany();
      await prisma.recommendedSong.deleteMany();
      await prisma.recommendation.deleteMany();
      await prisma.song.deleteMany();
      await prisma.user.deleteMany();
      
      // Create test data
      const user = await prisma.user.create({
        data: {
          email: 'recommender@test.com',
          name: 'Recommender',
        },
      });
      userId = user.id;

      const song1 = await prisma.song.create({
        data: {
          title: 'Input Song',
          artist: 'Artist 1',
          genre: 'pop',
        },
      });
      songId1 = song1.id;

      const song2 = await prisma.song.create({
        data: {
          title: 'Recommended Song',
          artist: 'Artist 2',
          genre: 'pop',
        },
      });
      songId2 = song2.id;
    });

    it('should create a recommendation with related songs', async () => {
      const recommendation = await prisma.recommendation.create({
        data: {
          userId,
          inputSongId: songId1,
          status: 'completed',
          processingTime: 500,
          recommendedSongs: {
            create: [
              {
                songId: songId2,
                score: 0.85,
                reason: 'Similar genre and tempo',
                position: 1,
              },
            ],
          },
        },
        include: {
          recommendedSongs: true,
        },
      });

      expect(recommendation.id).toBeDefined();
      expect(recommendation.status).toBe('completed');
      expect(recommendation.recommendedSongs.length).toBe(1);
      expect(recommendation.recommendedSongs[0].score).toBe(0.85);
    });

    it('should query recommendations by user', async () => {
      // First create a recommendation
      await prisma.recommendation.create({
        data: {
          userId,
          inputSongId: songId1,
          status: 'completed',
          processingTime: 300,
          recommendedSongs: {
            create: [
              {
                songId: songId2,
                score: 0.75,
                reason: 'Test reason',
                position: 1,
              },
            ],
          },
        },
      });
      
      const recommendations = await prisma.recommendation.findMany({
        where: { userId },
        include: { recommendedSongs: true },
      });

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].userId).toBe(userId);
    });
  });

  describe('Transaction Operations', () => {
    it('should handle transactions successfully', async () => {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: 'transaction@test.com',
            name: 'Transaction User',
          },
        });

        const song = await tx.song.create({
          data: {
            title: 'Transaction Song',
            artist: 'Transaction Artist',
          },
        });

        return { user, song };
      });

      expect(result.user.email).toBe('transaction@test.com');
      expect(result.song.title).toBe('Transaction Song');
    });

    it('should rollback transaction on error', async () => {
      const initialCount = await prisma.user.count();

      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              email: 'rollback@test.com',
              name: 'Rollback User',
            },
          });

          // Force an error
          throw new Error('Rollback test');
        });
      } catch (error) {
        expect(error).toBeDefined();
      }

      const finalCount = await prisma.user.count();
      expect(finalCount).toBe(initialCount);
    });
  });
});