import Docker from 'dockerode';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const docker = new Docker();

describe('Docker Environment Health', () => {
  const projectRoot = path.join(__dirname, '../..');
  const dockerComposeFile = path.join(projectRoot, 'docker-compose.yml');
  
  describe('Docker Compose Configuration', () => {
    it('should have docker-compose.yml file', async () => {
      const exists = await fs.access(dockerComposeFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should have valid docker-compose configuration', async () => {
      const { stderr } = await execAsync(`docker-compose -f ${dockerComposeFile} config`, {
        cwd: projectRoot
      });
      expect(stderr).toBe('');
    });

    it('should define required services', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toContain('postgres:');
      expect(composeContent).toContain('redis:');
      expect(composeContent).toContain('app:');
    });
  });

  describe('PostgreSQL Container', () => {
    let postgresContainer: Docker.Container | null = null;

    beforeAll(async () => {
      try {
        const containers = await docker.listContainers({
          filters: { label: ['com.docker.compose.service=postgres'] }
        });
        if (containers.length > 0) {
          postgresContainer = docker.getContainer(containers[0].Id);
        }
      } catch (error) {
        // Container not running yet
      }
    });

    it('should have PostgreSQL service configured', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/postgres:[\s\S]*?image:\s*postgres:16/);
    });

    it('should expose PostgreSQL port 5432', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/postgres:[\s\S]*?ports:[\s\S]*?5432:5432/);
    });

    it('should have health check configured', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/postgres:[\s\S]*?healthcheck:/);
    });

    it('should connect to PostgreSQL when running', async () => {
      if (!postgresContainer) {
        console.log('PostgreSQL container not running - skipping connection test');
        return;
      }

      const info = await postgresContainer.inspect();
      expect(info.State.Status).toBe('running');
      expect(info.State.Health?.Status).toMatch(/healthy|starting/);
    });
  });

  describe('Redis Container', () => {
    let redisContainer: Docker.Container | null = null;

    beforeAll(async () => {
      try {
        const containers = await docker.listContainers({
          filters: { label: ['com.docker.compose.service=redis'] }
        });
        if (containers.length > 0) {
          redisContainer = docker.getContainer(containers[0].Id);
        }
      } catch (error) {
        // Container not running yet
      }
    });

    it('should have Redis service configured', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/redis:[\s\S]*?image:\s*redis:7/);
    });

    it('should expose Redis port 6379', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/redis:[\s\S]*?ports:[\s\S]*?6379:6379/);
    });

    it('should have health check configured', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/redis:[\s\S]*?healthcheck:/);
    });

    it('should connect to Redis when running', async () => {
      if (!redisContainer) {
        console.log('Redis container not running - skipping connection test');
        return;
      }

      const info = await redisContainer.inspect();
      expect(info.State.Status).toBe('running');
      expect(info.State.Health?.Status).toMatch(/healthy|starting/);
    });
  });

  describe('Application Container', () => {
    it('should have Dockerfile', async () => {
      const dockerfilePath = path.join(projectRoot, 'Dockerfile');
      const exists = await fs.access(dockerfilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should have app service configured', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/app:[\s\S]*?build:/);
    });

    it('should expose application port 3000', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/app:[\s\S]*?ports:[\s\S]*?3000:3000/);
    });

    it('should have volume mounts for development', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/app:[\s\S]*?volumes:/);
      expect(composeContent).toContain('./src:/app/src');
    });

    it('should depend on postgres and redis', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toMatch(/app:[\s\S]*?depends_on:[\s\S]*?postgres/);
      expect(composeContent).toMatch(/app:[\s\S]*?depends_on:[\s\S]*?redis/);
    });
  });

  describe('Environment Variables', () => {
    it('should have .env.example file', async () => {
      const envExamplePath = path.join(projectRoot, '.env.example');
      const exists = await fs.access(envExamplePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should have required environment variables in .env.example', async () => {
      const envExamplePath = path.join(projectRoot, '.env.example');
      const content = await fs.readFile(envExamplePath, 'utf-8');
      
      expect(content).toContain('DATABASE_URL=');
      expect(content).toContain('REDIS_URL=');
      expect(content).toContain('NODE_ENV=');
      expect(content).toContain('PORT=');
    });
  });

  describe('Docker Networks', () => {
    it('should configure network for service communication', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toContain('networks:');
    });
  });

  describe('Docker Volumes', () => {
    it('should configure persistent volumes for databases', async () => {
      const composeContent = await fs.readFile(dockerComposeFile, 'utf-8');
      expect(composeContent).toContain('postgres_data:');
      expect(composeContent).toContain('redis_data:');
    });
  });
});