import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean existing data
  await prisma.userPreference.deleteMany();
  await prisma.recommendedSong.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.song.deleteMany();
  await prisma.user.deleteMany();
  await prisma.requestLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.systemHealth.deleteMany();

  // Create system health record
  const healthRecord = await prisma.systemHealth.create({
    data: {
      status: 'healthy',
      version: '1.0.0',
    },
  });
  console.log('✅ Created system health record');

  // Create API keys
  const apiKeys = await Promise.all([
    prisma.apiKey.create({
      data: {
        key: `mez_test_${uuidv4().replace(/-/g, '')}`,
        name: 'Test API Key',
        active: true,
      },
    }),
    prisma.apiKey.create({
      data: {
        key: `mez_demo_${uuidv4().replace(/-/g, '')}`,
        name: 'Demo API Key',
        active: true,
      },
    }),
  ]);
  console.log(`✅ Created ${apiKeys.length} API keys`);

  // Create sample users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'john.doe@example.com',
        name: 'John Doe',
        favoriteGenres: ['rock', 'alternative'],
      },
    }),
    prisma.user.create({
      data: {
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        favoriteGenres: ['pop', 'electronic'],
      },
    }),
  ]);
  console.log(`✅ Created ${users.length} users`);

  // Create sample songs
  const songs = await Promise.all([
    prisma.song.create({
      data: {
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
        genre: 'rock',
        releaseYear: 1975,
        tempo: 76,
        key: 'Bb',
        energy: 0.404,
        danceability: 0.391,
        valence: 0.228,
        acousticness: 0.271,
        instrumentalness: 0,
        popularity: 89,
        duration: 354320,
      },
    }),
    prisma.song.create({
      data: {
        title: 'Stairway to Heaven',
        artist: 'Led Zeppelin',
        album: 'Led Zeppelin IV',
        genre: 'rock',
        releaseYear: 1971,
        tempo: 83,
        key: 'A',
        energy: 0.466,
        danceability: 0.342,
        valence: 0.329,
        acousticness: 0.56,
        instrumentalness: 0.00108,
        popularity: 85,
        duration: 482830,
      },
    }),
    prisma.song.create({
      data: {
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        album: '÷ (Divide)',
        genre: 'pop',
        releaseYear: 2017,
        tempo: 96,
        key: 'C#',
        energy: 0.652,
        danceability: 0.825,
        valence: 0.931,
        acousticness: 0.581,
        instrumentalness: 0,
        popularity: 92,
        duration: 233713,
      },
    }),
    prisma.song.create({
      data: {
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        genre: 'pop',
        releaseYear: 2020,
        tempo: 171,
        key: 'F#',
        energy: 0.73,
        danceability: 0.514,
        valence: 0.334,
        acousticness: 0.00146,
        instrumentalness: 0.0000954,
        popularity: 95,
        duration: 200040,
      },
    }),
    prisma.song.create({
      data: {
        title: 'One More Time',
        artist: 'Daft Punk',
        album: 'Discovery',
        genre: 'electronic',
        releaseYear: 2000,
        tempo: 122,
        key: 'G',
        energy: 0.71,
        danceability: 0.61,
        valence: 0.44,
        acousticness: 0.0178,
        instrumentalness: 0.00294,
        popularity: 78,
        duration: 320357,
      },
    }),
    prisma.song.create({
      data: {
        title: 'Smells Like Teen Spirit',
        artist: 'Nirvana',
        album: 'Nevermind',
        genre: 'alternative',
        releaseYear: 1991,
        tempo: 117,
        key: 'F',
        energy: 0.912,
        danceability: 0.502,
        valence: 0.72,
        acousticness: 0.000173,
        instrumentalness: 0.000108,
        popularity: 83,
        duration: 301920,
      },
    }),
  ]);
  console.log(`✅ Created ${songs.length} songs`);

  // Create sample recommendations
  const recommendation = await prisma.recommendation.create({
    data: {
      userId: users[0].id,
      inputSongId: songs[0].id, // Bohemian Rhapsody
      status: 'completed',
      completedAt: new Date(),
      processingTime: 1250,
      recommendedSongs: {
        create: [
          {
            songId: songs[1].id, // Stairway to Heaven
            score: 0.92,
            reason: 'Similar classic rock era and epic composition style',
            position: 1,
          },
          {
            songId: songs[5].id, // Smells Like Teen Spirit
            score: 0.78,
            reason: 'Rock genre with high energy and cultural impact',
            position: 2,
          },
        ],
      },
    },
    include: {
      recommendedSongs: true,
    },
  });
  console.log('✅ Created sample recommendation with related songs');

  // Create user preferences
  const preferences = await Promise.all([
    prisma.userPreference.create({
      data: {
        userId: users[0].id,
        songId: songs[0].id,
        rating: 5,
        liked: true,
        playCount: 25,
      },
    }),
    prisma.userPreference.create({
      data: {
        userId: users[0].id,
        songId: songs[1].id,
        rating: 4,
        liked: true,
        playCount: 18,
      },
    }),
    prisma.userPreference.create({
      data: {
        userId: users[1].id,
        songId: songs[2].id,
        rating: 5,
        liked: true,
        playCount: 42,
      },
    }),
  ]);
  console.log(`✅ Created ${preferences.length} user preferences`);

  // Create sample request logs
  const requestLogs = await Promise.all([
    prisma.requestLog.create({
      data: {
        method: 'GET',
        path: '/health',
        statusCode: 200,
        duration: 15,
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      },
    }),
    prisma.requestLog.create({
      data: {
        method: 'POST',
        path: '/api/recommendations',
        statusCode: 201,
        duration: 1250,
        ip: '192.168.1.100',
        userAgent: 'MusicEZ-SDK/1.0',
      },
    }),
  ]);
  console.log(`✅ Created ${requestLogs.length} request logs`);

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`  - API Keys: ${apiKeys.length}`);
  console.log(`  - Users: ${users.length}`);
  console.log(`  - Songs: ${songs.length}`);
  console.log(`  - Recommendations: 1`);
  console.log(`  - User Preferences: ${preferences.length}`);
  console.log(`  - Request Logs: ${requestLogs.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });