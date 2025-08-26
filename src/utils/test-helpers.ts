import { PrismaClient, User, Song, Recommendation, ApiKey } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

let testCounter = 0;

/**
 * Sets up a test database instance
 */
export async function setupTestDatabase(): Promise<PrismaClient> {
  const prisma = new PrismaClient({
    log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : [],
  });
  
  await prisma.$connect();
  return prisma;
}

/**
 * Tears down test database instance
 */
export async function teardownTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Cleans all data from the database
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  // Delete in dependency order
  await prisma.userPreference.deleteMany();
  await prisma.recommendedSong.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.requestLog.deleteMany();
  await prisma.song.deleteMany();
  await prisma.user.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.systemHealth.deleteMany();
}

/**
 * Creates a test user with optional custom data
 */
export async function createTestUser(
  prisma: PrismaClient,
  data?: Partial<{
    email: string;
    name: string;
    favoriteGenres: string[];
  }>
): Promise<User> {
  testCounter++;
  
  return prisma.user.create({
    data: {
      email: data?.email ?? `test.user.${testCounter}.${Date.now()}@test.com`,
      name: data?.name ?? `Test User ${testCounter}`,
      favoriteGenres: data?.favoriteGenres ?? ['rock', 'pop'],
    },
  });
}

/**
 * Creates a test song with optional custom data
 */
export async function createTestSong(
  prisma: PrismaClient,
  data?: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
    tempo: number;
    energy: number;
    danceability: number;
    valence: number;
    popularity: number;
    duration: number;
  }>
): Promise<Song> {
  testCounter++;
  
  return prisma.song.create({
    data: {
      title: data?.title ?? `Test Song ${testCounter}`,
      artist: data?.artist ?? `Test Artist ${testCounter}`,
      album: data?.album ?? `Test Album ${testCounter}`,
      genre: data?.genre ?? 'rock',
      tempo: data?.tempo ?? 120,
      energy: data?.energy ?? 0.7,
      danceability: data?.danceability ?? 0.6,
      valence: data?.valence ?? 0.5,
      popularity: data?.popularity ?? 50,
      duration: data?.duration ?? 180000,
    },
  });
}

/**
 * Creates a test API key with optional custom data
 */
export async function createTestApiKey(
  prisma: PrismaClient,
  data?: Partial<{
    name: string;
    active: boolean;
  }>
): Promise<ApiKey> {
  testCounter++;
  
  return prisma.apiKey.create({
    data: {
      key: `test_${uuidv4().replace(/-/g, '')}`,
      name: data?.name ?? `Test API Key ${testCounter}`,
      active: data?.active ?? true,
    },
  });
}

/**
 * Creates a test recommendation with related songs
 */
export async function createTestRecommendation(
  prisma: PrismaClient,
  data: {
    userId: string;
    inputSongId: string;
    recommendedSongIds: string[];
    apiKeyId?: string;
  }
): Promise<Recommendation & { recommendedSongs: any[] }> {
  return prisma.recommendation.create({
    data: {
      userId: data.userId,
      apiKeyId: data.apiKeyId,
      inputSongId: data.inputSongId,
      status: 'completed',
      completedAt: new Date(),
      processingTime: 500,
      recommendedSongs: {
        create: data.recommendedSongIds.map((songId, index) => ({
          songId,
          score: 0.9 - (index * 0.1),
          reason: `Test recommendation reason ${index + 1}`,
          position: index + 1,
        })),
      },
    },
    include: {
      recommendedSongs: true,
    },
  });
}

/**
 * Creates a batch of test users
 */
export async function createTestUsers(
  prisma: PrismaClient,
  count: number
): Promise<User[]> {
  return Promise.all(
    Array.from({ length: count }, () => createTestUser(prisma))
  );
}

/**
 * Creates a batch of test songs
 */
export async function createTestSongs(
  prisma: PrismaClient,
  count: number
): Promise<Song[]> {
  return Promise.all(
    Array.from({ length: count }, () => createTestSong(prisma))
  );
}

/**
 * Seeds the database with sample test data
 */
export async function seedTestData(prisma: PrismaClient) {
  // Create users
  const users = await createTestUsers(prisma, 3);
  
  // Create songs
  const songs = await createTestSongs(prisma, 10);
  
  // Create API keys
  const apiKeys = await Promise.all([
    createTestApiKey(prisma, { name: 'Test Key 1' }),
    createTestApiKey(prisma, { name: 'Test Key 2' }),
  ]);
  
  // Create recommendations
  await createTestRecommendation(prisma, {
    userId: users[0].id,
    inputSongId: songs[0].id,
    recommendedSongIds: [songs[1].id, songs[2].id, songs[3].id],
    apiKeyId: apiKeys[0].id,
  });
  
  await createTestRecommendation(prisma, {
    userId: users[1].id,
    inputSongId: songs[4].id,
    recommendedSongIds: [songs[5].id, songs[6].id],
  });
  
  return { users, songs, apiKeys };
}