import {
  hashApiKey,
  verifyApiKey,
  generateApiKey,
  encryptApiKey,
  decryptApiKey,
  sanitizeApiKeyForLogging,
  validateApiKeyFormat,
  hashApiKeyForLookup,
  generateSecureApiKey,
  ApiKeySecurityError,
} from '../../src/utils/api-key-security';

describe('API Key Security Utilities', () => {
  describe('hashApiKey', () => {
    it('should hash an API key successfully', async () => {
      const apiKey = 'test_api_key_123456789';
      const hashedKey = await hashApiKey(apiKey);

      expect(hashedKey).toBeDefined();
      expect(hashedKey).not.toBe(apiKey);
      expect(hashedKey.length).toBeGreaterThan(50);
    });

    it('should produce different hashes for the same key', async () => {
      const apiKey = 'test_api_key_123456789';
      const hash1 = await hashApiKey(apiKey);
      const hash2 = await hashApiKey(apiKey);

      expect(hash1).not.toBe(hash2);
    });

    it('should reject keys that are too short', async () => {
      await expect(hashApiKey('short')).rejects.toThrow(ApiKeySecurityError);
      await expect(hashApiKey('short')).rejects.toThrow('at least 8 characters');
    });

    it('should reject empty keys', async () => {
      await expect(hashApiKey('')).rejects.toThrow(ApiKeySecurityError);
    });
  });

  describe('verifyApiKey', () => {
    it('should verify a valid API key against its hash', async () => {
      const apiKey = 'test_api_key_123456789';
      const hashedKey = await hashApiKey(apiKey);

      const isValid = await verifyApiKey(apiKey, hashedKey);
      expect(isValid).toBe(true);
    });

    it('should reject an invalid API key', async () => {
      const apiKey = 'test_api_key_123456789';
      const wrongKey = 'wrong_api_key_123456789';
      const hashedKey = await hashApiKey(apiKey);

      const isValid = await verifyApiKey(wrongKey, hashedKey);
      expect(isValid).toBe(false);
    });

    it('should handle empty parameters gracefully', async () => {
      const apiKey = 'test_api_key_123456789';
      const hashedKey = await hashApiKey(apiKey);

      expect(await verifyApiKey('', hashedKey)).toBe(false);
      expect(await verifyApiKey(apiKey, '')).toBe(false);
    });
  });

  describe('generateApiKey', () => {
    it('should generate an API key with default length', () => {
      const apiKey = generateApiKey();

      expect(apiKey).toBeDefined();
      expect(apiKey.length).toBe(32);
      expect(/^[a-zA-Z0-9\-_]+$/.test(apiKey)).toBe(true);
    });

    it('should generate an API key with custom length', () => {
      const length = 64;
      const apiKey = generateApiKey(length);

      expect(apiKey.length).toBe(length);
      expect(/^[a-zA-Z0-9\-_]+$/.test(apiKey)).toBe(true);
    });

    it('should generate an API key with prefix', () => {
      const prefix = 'sk_';
      const apiKey = generateApiKey(32, prefix);

      expect(apiKey.startsWith(prefix)).toBe(true);
      expect(apiKey.length).toBe(32 + prefix.length);
    });

    it('should generate unique API keys', () => {
      const keys = Array.from({ length: 10 }, () => generateApiKey());
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(10);
    });

    it('should reject keys shorter than 16 characters', () => {
      expect(() => generateApiKey(15)).toThrow(ApiKeySecurityError);
      expect(() => generateApiKey(15)).toThrow('at least 16 characters');
    });
  });

  describe('encryptApiKey and decryptApiKey', () => {
    it('should encrypt and decrypt an API key successfully', () => {
      const originalKey = 'test_api_key_123456789';
      const masterKey = 'test-master-key-for-encryption';

      const encrypted = encryptApiKey(originalKey, masterKey);
      expect(encrypted.encryptedKey).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      const decrypted = decryptApiKey(encrypted.encryptedKey, masterKey);
      expect(decrypted).toBe(originalKey);
    });

    it('should produce different encryption results for the same key', () => {
      const apiKey = 'test_api_key_123456789';
      const masterKey = 'test-master-key';

      const encrypted1 = encryptApiKey(apiKey, masterKey);
      const encrypted2 = encryptApiKey(apiKey, masterKey);

      expect(encrypted1.encryptedKey).not.toBe(encrypted2.encryptedKey);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should fail to decrypt with wrong master key', () => {
      const apiKey = 'test_api_key_123456789';
      const masterKey = 'correct-master-key';
      const wrongKey = 'wrong-master-key';

      const encrypted = encryptApiKey(apiKey, masterKey);

      expect(() => decryptApiKey(encrypted.encryptedKey, wrongKey)).toThrow(ApiKeySecurityError);
    });

    it('should reject empty API key for encryption', () => {
      expect(() => encryptApiKey('', 'master-key')).toThrow(ApiKeySecurityError);
    });

    it('should reject empty encrypted data for decryption', () => {
      expect(() => decryptApiKey('', 'master-key')).toThrow(ApiKeySecurityError);
    });
  });

  describe('sanitizeApiKeyForLogging', () => {
    it('should sanitize a long API key', () => {
      const apiKey = 'sk_1234567890abcdefghijklmnopqrstuvwxyz';
      const sanitized = sanitizeApiKeyForLogging(apiKey);

      expect(sanitized.startsWith('sk_1')).toBe(true);
      expect(sanitized.endsWith('yz')).toBe(true);
      expect(sanitized.includes('*')).toBe(true);
      expect(sanitized.length).toBeLessThanOrEqual(apiKey.length);
    });

    it('should sanitize a medium API key', () => {
      const apiKey = 'short_key';
      const sanitized = sanitizeApiKeyForLogging(apiKey);

      expect(sanitized).toBe('shor***ey');
    });

    it('should handle very short keys', () => {
      const apiKey = 'abc';
      const sanitized = sanitizeApiKeyForLogging(apiKey);

      expect(sanitized).toBe('***');
    });

    it('should handle empty or null keys', () => {
      expect(sanitizeApiKeyForLogging('')).toBe('***');
      expect(sanitizeApiKeyForLogging('a')).toBe('***');
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should validate a properly formatted API key', () => {
      const apiKey = 'test_fake_api_key_for_testing_123456789';
      const result = validateApiKeyFormat(apiKey);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject keys that are too short', () => {
      const apiKey = 'short';
      const result = validateApiKeyFormat(apiKey);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key must be at least 8 characters long');
    });

    it('should reject keys that are too long', () => {
      const apiKey = 'a'.repeat(513);
      const result = validateApiKeyFormat(apiKey);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key must not exceed 512 characters');
    });

    it('should reject keys with invalid characters', () => {
      const apiKey = 'invalid key with spaces!';
      const result = validateApiKeyFormat(apiKey);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key can only contain letters, numbers, hyphens, underscores, and periods');
    });

    it('should reject weak patterns', () => {
      const testKey = 'test123456789';
      const result = validateApiKeyFormat(testKey);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key appears to use a weak or common pattern');
    });

    it('should reject keys with repeated characters', () => {
      const apiKey = 'aaaaaaaaaa';
      const result = validateApiKeyFormat(apiKey);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key appears to use a weak or common pattern');
    });

    it('should handle empty keys', () => {
      const result = validateApiKeyFormat('');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key is required');
    });
  });

  describe('hashApiKeyForLookup', () => {
    it('should create a consistent hash for the same key', () => {
      const apiKey = 'test_api_key_123456789';

      const hash1 = hashApiKeyForLookup(apiKey);
      const hash2 = hashApiKeyForLookup(apiKey);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex string length
    });

    it('should create different hashes for different keys', () => {
      const key1 = 'test_api_key_123456789';
      const key2 = 'test_api_key_987654321';

      const hash1 = hashApiKeyForLookup(key1);
      const hash2 = hashApiKeyForLookup(key2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateSecureApiKey', () => {
    it('should generate a Spotify API key with correct prefix', () => {
      const apiKey = generateSecureApiKey('spotify');

      expect(apiKey.startsWith('sk_sp_')).toBe(true);
      expect(apiKey.length).toBe(6 + 32); // prefix + random part
    });

    it('should generate an OpenAI API key with correct prefix', () => {
      const apiKey = generateSecureApiKey('openai');

      expect(apiKey.startsWith('sk_oa_')).toBe(true);
      expect(apiKey.length).toBe(6 + 32);
    });

    it('should generate a custom API key with default prefix', () => {
      const apiKey = generateSecureApiKey('custom');

      expect(apiKey.startsWith('sk_')).toBe(true);
      expect(apiKey.length).toBe(3 + 32);
    });

    it('should generate a custom API key with custom prefix', () => {
      const customPrefix = 'my_custom_';
      const apiKey = generateSecureApiKey('custom', customPrefix);

      expect(apiKey.startsWith(customPrefix)).toBe(true);
      expect(apiKey.length).toBe(customPrefix.length + 32);
    });

    it('should generate unique keys for the same service', () => {
      const keys = Array.from({ length: 5 }, () => generateSecureApiKey('spotify'));
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(5);
    });
  });
});