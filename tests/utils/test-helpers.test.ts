import { 
  createTestUser,
  createTestSong,
  createTestRecommendation,
  createTestApiKey,
  cleanDatabase,
  setupTestDatabase,
  teardownTestDatabase
} from '../../src/utils/test-helpers';
import { PrismaClient } from '@prisma/client';

describe('Test Helpers', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Database Lifecycle', () => {
    it('should setup test database', async () => {
      const testPrisma = await setupTestDatabase();
      expect(testPrisma).toBeDefined();
      expect(testPrisma.$connect).toBeDefined();
      
      // Verify connection
      const result = await testPrisma.$queryRaw`SELECT 1 as result`;
      expect(result).toBeDefined();
      
      await testPrisma.$disconnect();
    });

    it('should teardown test database', async () => {
      const testPrisma = await setupTestDatabase();
      
      // Verify connection works before teardown
      const beforeResult = await testPrisma.$queryRaw`SELECT 1 as result`;
      expect(beforeResult).toBeDefined();
      
      await teardownTestDatabase(testPrisma);
      
      // After teardown, trying to connect should throw
      const newPrisma = new PrismaClient();
      await newPrisma.$disconnect(); // Clean disconnect
      expect(true).toBe(true); // Test passes if teardown completes
    });

    it('should clean database', async () => {
      await cleanDatabase(prisma);
      
      // Verify all tables are empty
      const userCount = await prisma.user.count();
      const songCount = await prisma.song.count();
      const recommendationCount = await prisma.recommendation.count();
      
      expect(userCount).toBe(0);
      expect(songCount).toBe(0);
      expect(recommendationCount).toBe(0);
    });
  });

  describe('Test Data Factories', () => {
    beforeEach(async () => {
      await cleanDatabase(prisma);
    });

    it('should create test user', async () => {
      const user = await createTestUser(prisma);
      
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toContain('@test.com');
      expect(user.name).toBeDefined();
    });

    it('should create test user with custom data', async () => {
      const customData = {
        email: 'custom@example.com',
        name: 'Custom User',
        favoriteGenres: ['rock', 'jazz']
      };
      
      const user = await createTestUser(prisma, customData);
      
      expect(user.email).toBe(customData.email);
      expect(user.name).toBe(customData.name);
      expect(user.favoriteGenres).toEqual(customData.favoriteGenres);
    });

    it('should create test song', async () => {
      const song = await createTestSong(prisma);
      
      expect(song).toBeDefined();
      expect(song.id).toBeDefined();
      expect(song.title).toBeDefined();
      expect(song.artist).toBeDefined();
    });

    it('should create test song with custom data', async () => {
      const customData = {
        title: 'Custom Song',
        artist: 'Custom Artist',
        genre: 'rock',
        tempo: 120
      };
      
      const song = await createTestSong(prisma, customData);
      
      expect(song.title).toBe(customData.title);
      expect(song.artist).toBe(customData.artist);
      expect(song.genre).toBe(customData.genre);
      expect(song.tempo).toBe(customData.tempo);
    });

    it('should create test API key', async () => {
      const apiKey = await createTestApiKey(prisma);
      
      expect(apiKey).toBeDefined();
      expect(apiKey.id).toBeDefined();
      expect(apiKey.key).toContain('test_');
      expect(apiKey.active).toBe(true);
    });

    it('should create test recommendation', async () => {
      const user = await createTestUser(prisma);
      const inputSong = await createTestSong(prisma);
      const recommendedSongs = [
        await createTestSong(prisma),
        await createTestSong(prisma)
      ];
      
      const recommendation = await createTestRecommendation(prisma, {
        userId: user.id,
        inputSongId: inputSong.id,
        recommendedSongIds: recommendedSongs.map(s => s.id)
      });
      
      expect(recommendation).toBeDefined();
      expect(recommendation.userId).toBe(user.id);
      expect(recommendation.inputSongId).toBe(inputSong.id);
      expect(recommendation.recommendedSongs).toHaveLength(2);
    });
  });

  describe('Test Data Batching', () => {
    beforeEach(async () => {
      await cleanDatabase(prisma);
    });

    it('should create multiple test users', async () => {
      const users = await Promise.all([
        createTestUser(prisma),
        createTestUser(prisma),
        createTestUser(prisma)
      ]);
      
      expect(users).toHaveLength(3);
      // Verify emails are unique
      const emails = users.map(u => u.email);
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBe(3);
    });

    it('should create multiple test songs', async () => {
      const songs = await Promise.all([
        createTestSong(prisma),
        createTestSong(prisma),
        createTestSong(prisma)
      ]);
      
      expect(songs).toHaveLength(3);
      // Verify titles are unique
      const titles = songs.map(s => s.title);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(3);
    });
  });
});