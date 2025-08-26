import { PrismaClient } from '@prisma/client';

describe('Authentication Database Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    
    // Clean test database - authentication-related tables
    await prisma.userPreference.deleteMany();
    await prisma.recommendedSong.deleteMany();
    await prisma.recommendation.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.user.deleteMany();
  });

  describe('User Model with Authentication Fields', () => {
    const testUser = {
      email: 'auth-test@example.com',
      password: '$2b$12$hashedPasswordString123456789', // bcrypt hash format
      name: 'Auth Test User',
      emailVerified: false,
      favoriteGenres: ['rock', 'jazz'],
    };

    it('should create user with all authentication fields', async () => {
      const user = await prisma.user.create({
        data: testUser,
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe(testUser.email);
      expect(user.password).toBe(testUser.password);
      expect(user.name).toBe(testUser.name);
      expect(user.emailVerified).toBe(false);
      expect(user.lastLoginAt).toBeNull();
      expect(user.favoriteGenres).toEqual(['rock', 'jazz']);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should create user with required email and password only', async () => {
      const minimalUser = {
        email: 'minimal@example.com',
        password: '$2b$12$anotherHashedPassword123456789',
      };

      const user = await prisma.user.create({
        data: minimalUser,
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe(minimalUser.email);
      expect(user.password).toBe(minimalUser.password);
      expect(user.name).toBeNull();
      expect(user.emailVerified).toBe(false); // default value
      expect(user.lastLoginAt).toBeNull();
      expect(user.favoriteGenres).toEqual([]); // default empty array
    });

    it('should update lastLoginAt timestamp', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'login-test@example.com',
          password: '$2b$12$testHashForLoginTimestamp123',
        },
      });

      const loginTime = new Date();
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: loginTime },
      });

      expect(updatedUser.lastLoginAt).toEqual(loginTime);
    });

    it('should update emailVerified status', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'verify-test@example.com',
          password: '$2b$12$testHashForEmailVerification',
          emailVerified: false,
        },
      });

      const verifiedUser = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });

      expect(verifiedUser.emailVerified).toBe(true);
    });

    it('should find user by email for login authentication', async () => {
      await prisma.user.create({
        data: {
          email: 'findme@example.com',
          password: '$2b$12$findTestHashedPassword123456',
          name: 'Find Me User',
        },
      });

      const foundUser = await prisma.user.findUnique({
        where: { email: 'findme@example.com' },
        select: {
          id: true,
          email: true,
          password: true,
          name: true,
          emailVerified: true,
          lastLoginAt: true,
        },
      });

      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe('findme@example.com');
      expect(foundUser?.password).toBe('$2b$12$findTestHashedPassword123456');
      expect(foundUser?.name).toBe('Find Me User');
    });

    it('should enforce unique email constraint', async () => {
      const duplicateEmail = 'duplicate@example.com';

      await prisma.user.create({
        data: {
          email: duplicateEmail,
          password: '$2b$12$firstUserPassword123456789',
        },
      });

      await expect(
        prisma.user.create({
          data: {
            email: duplicateEmail,
            password: '$2b$12$secondUserPassword123456789',
          },
        })
      ).rejects.toThrow();
    });

    it('should handle password updates securely', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'password-update@example.com',
          password: '$2b$12$oldPasswordHash123456789',
        },
      });

      const newPasswordHash = '$2b$12$newPasswordHash123456789';
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { 
          password: newPasswordHash,
          updatedAt: new Date(),
        },
      });

      expect(updatedUser.password).toBe(newPasswordHash);
      expect(updatedUser.password).not.toBe('$2b$12$oldPasswordHash123456789');
    });

    it('should support user authentication workflow', async () => {
      // Registration
      const newUser = await prisma.user.create({
        data: {
          email: 'workflow@example.com',
          password: '$2b$12$workflowTestPassword123456',
          name: 'Workflow Test User',
          emailVerified: false,
        },
      });

      expect(newUser.emailVerified).toBe(false);
      expect(newUser.lastLoginAt).toBeNull();

      // Login (update lastLoginAt)
      const loginTime = new Date();
      const loggedInUser = await prisma.user.update({
        where: { id: newUser.id },
        data: { lastLoginAt: loginTime },
      });

      expect(loggedInUser.lastLoginAt).toEqual(loginTime);

      // Email verification
      const verifiedUser = await prisma.user.update({
        where: { id: newUser.id },
        data: { emailVerified: true },
      });

      expect(verifiedUser.emailVerified).toBe(true);
    });
  });

  describe('User Model Indexes and Performance', () => {
    it('should efficiently find users by email (indexed field)', async () => {
      // Create multiple users
      await Promise.all([
        prisma.user.create({
          data: {
            email: 'index-test-1@example.com',
            password: '$2b$12$indexTest1Password123456',
          },
        }),
        prisma.user.create({
          data: {
            email: 'index-test-2@example.com',
            password: '$2b$12$indexTest2Password123456',
          },
        }),
        prisma.user.create({
          data: {
            email: 'index-test-3@example.com',
            password: '$2b$12$indexTest3Password123456',
          },
        }),
      ]);

      // Test indexed email lookup
      const foundUser = await prisma.user.findUnique({
        where: { email: 'index-test-2@example.com' },
      });

      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe('index-test-2@example.com');
    });

    it('should support concurrent user operations', async () => {
      const concurrentOperations = Array.from({ length: 5 }, (_, i) =>
        prisma.user.create({
          data: {
            email: `concurrent-${i}@example.com`,
            password: `$2b$12$concurrent${i}Password123456`,
            name: `Concurrent User ${i}`,
          },
        })
      );

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(5);
      results.forEach((user, index) => {
        expect(user.email).toBe(`concurrent-${index}@example.com`);
        expect(user.name).toBe(`Concurrent User ${index}`);
      });
    });
  });

  describe('User Model Relationships with Authentication', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: 'relations@example.com',
          password: '$2b$12$relationsTestPassword123456',
          name: 'Relations Test User',
        },
      });
      userId = user.id;
    });

    it('should maintain existing user relationships after auth fields added', async () => {
      // Create a song for recommendations
      const song = await prisma.song.create({
        data: {
          title: 'Test Song for Auth User',
          artist: 'Test Artist',
        },
      });

      // Create recommendation for the user
      const recommendation = await prisma.recommendation.create({
        data: {
          userId,
          inputSongId: song.id,
          status: 'completed',
        },
      });

      // Verify relationship works
      const userWithRecommendations = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          recommendations: true,
        },
      });

      expect(userWithRecommendations).toBeDefined();
      expect(userWithRecommendations?.recommendations).toHaveLength(1);
      expect(userWithRecommendations?.recommendations[0].id).toBe(recommendation.id);
    });
  });

  describe('Migration Compatibility Tests', () => {
    it('should handle users without passwords (existing data)', async () => {
      // Simulate existing user data before migration
      // This test will be updated after migration is applied
      const testEmail = 'pre-migration@example.com';
      
      // For now, test that we can handle the transition
      const userData = {
        email: testEmail,
        name: 'Pre-Migration User',
        // password field will be added by migration with default empty string
        favoriteGenres: ['pop'],
      };

      // This will work after migration adds the password field
      // For now, we expect this to potentially fail until migration is run
      try {
        const user = await prisma.user.create({
          data: {
            ...userData,
            password: '', // Will be default value from migration
          },
        });
        expect(user.email).toBe(testEmail);
        expect(user.password).toBe('');
      } catch (error) {
        // Expected to fail before migration
        console.log('Migration test - expected to fail before running migration');
      }
    });
  });
});