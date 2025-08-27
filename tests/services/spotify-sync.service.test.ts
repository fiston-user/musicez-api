import { SpotifySyncService } from '../../src/services/spotify-sync.service';
import { PrismaClient } from '@prisma/client';
import logger from '../../src/utils/logger';

jest.mock('../../src/config/redis');
jest.mock('../../src/utils/spotify-client');
jest.mock('../../src/utils/logger');

// Create a mock Prisma client
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockDeleteMany = jest.fn();

const mockPrisma = {
  spotifySyncJob: {
    create: mockCreate,
    findUnique: mockFindUnique,
    deleteMany: mockDeleteMany,
  },
} as unknown as PrismaClient;

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('SpotifySyncService', () => {
  let service: SpotifySyncService;

  beforeEach(() => {
    service = new SpotifySyncService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('createSyncJob', () => {
    it('should create a sync job successfully', async () => {
      const mockJob = {
        id: 'job_1',
        userId: 'user_1',
        jobType: 'USER_PLAYLISTS_SYNC',
        status: 'pending',
        parameters: { includePrivate: true },
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValue(mockJob);

      const result = await service.createSyncJob('user_1', 'USER_PLAYLISTS_SYNC', { includePrivate: true });

      expect(result).toEqual(mockJob);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user_1',
          jobType: 'USER_PLAYLISTS_SYNC',
          status: 'pending',
          parameters: { includePrivate: true },
          createdAt: expect.any(Date),
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Sync job created', {
        jobId: 'job_1',
        userId: 'user_1',
        jobType: 'USER_PLAYLISTS_SYNC',
      });
    });

    it('should handle job creation errors', async () => {
      const error = new Error('Database error');
      mockCreate.mockRejectedValue(error);

      await expect(
        service.createSyncJob('user_1', 'USER_PLAYLISTS_SYNC')
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create sync job', {
        userId: 'user_1',
        jobType: 'USER_PLAYLISTS_SYNC',
        error: 'Database error',
      });
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      const mockJob = {
        id: 'job_1',
        userId: 'user_1',
        status: 'completed',
      };

      mockFindUnique.mockResolvedValue(mockJob);

      const result = await service.getJobStatus('job_1');
      expect(result).toEqual(mockJob);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should clean up old completed sync jobs', async () => {
      mockDeleteMany.mockResolvedValue({ count: 5 });

      await service.cleanupOldJobs();

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          completedAt: {
            lte: expect.any(Date),
          },
          status: {
            in: ["completed", "failed"],
          },
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up old sync jobs',
        { deletedCount: 5, cutoffDate: expect.any(Date) }
      );
    });
  });
});
