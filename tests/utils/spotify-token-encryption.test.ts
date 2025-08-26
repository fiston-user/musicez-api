import { 
  encryptSpotifyToken,
  decryptSpotifyToken,
  SpotifyTokenEncryptionError,
  generateEncryptionKey,
  validateEncryptionKey,
} from '../../src/utils/spotify-token-encryption';

// Simple functional test without mocking crypto
describe('SpotifyTokenEncryption', () => {
  const testKey = '12345678901234567890123456789012'; // Exactly 32 bytes
  const shortKey = 'short_key';
  const testToken = 'BQDHx9vN-Spotify_Access_Token_Example_123456789';

  describe('Key Validation', () => {
    it('should validate correct key length', () => {
      expect(validateEncryptionKey(testKey)).toBe(true);
      expect(validateEncryptionKey(shortKey)).toBe(false);
    });

    it('should generate valid encryption key', () => {
      const key = generateEncryptionKey();
      expect(key).toHaveLength(32);
      expect(validateEncryptionKey(key)).toBe(true);
    });
  });

  describe('Token Encryption/Decryption', () => {
    it('should successfully encrypt and decrypt token', async () => {
      const encrypted = await encryptSpotifyToken(testToken, testKey);
      
      expect(encrypted.encryptedData).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.tag).toBeTruthy();

      const decrypted = await decryptSpotifyToken(encrypted, testKey);
      expect(decrypted).toBe(testToken);
    });

    it('should generate different encrypted data for same token', async () => {
      const encrypted1 = await encryptSpotifyToken(testToken, testKey);
      const encrypted2 = await encryptSpotifyToken(testToken, testKey);
      
      // Different IVs should produce different encrypted data
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
      
      // But both should decrypt to the same token
      const decrypted1 = await decryptSpotifyToken(encrypted1, testKey);
      const decrypted2 = await decryptSpotifyToken(encrypted2, testKey);
      expect(decrypted1).toBe(testToken);
      expect(decrypted2).toBe(testToken);
    });

    it('should reject empty token', async () => {
      await expect(encryptSpotifyToken('', testKey)).rejects.toThrow(SpotifyTokenEncryptionError);
      await expect(encryptSpotifyToken('', testKey)).rejects.toThrow('Token cannot be empty');
    });

    it('should reject invalid key length', async () => {
      await expect(encryptSpotifyToken(testToken, shortKey)).rejects.toThrow(SpotifyTokenEncryptionError);
      await expect(encryptSpotifyToken(testToken, shortKey)).rejects.toThrow('Invalid encryption key length');
    });

    it('should reject invalid encrypted data', async () => {
      const invalidData = {
        encryptedData: '',
        iv: '1234567890123456',
        tag: 'authentication_tag',
      };

      await expect(decryptSpotifyToken(invalidData, testKey)).rejects.toThrow(SpotifyTokenEncryptionError);
    });

    it('should reject missing IV', async () => {
      const invalidData = {
        encryptedData: 'encrypted_data',
        iv: '',
        tag: 'authentication_tag',
      };

      await expect(decryptSpotifyToken(invalidData, testKey)).rejects.toThrow(SpotifyTokenEncryptionError);
      await expect(decryptSpotifyToken(invalidData, testKey)).rejects.toThrow('Missing IV or authentication tag');
    });

    it('should reject missing authentication tag', async () => {
      const invalidData = {
        encryptedData: 'encrypted_data',
        iv: '1234567890123456',
        tag: '',
      };

      await expect(decryptSpotifyToken(invalidData, testKey)).rejects.toThrow(SpotifyTokenEncryptionError);
      await expect(decryptSpotifyToken(invalidData, testKey)).rejects.toThrow('Missing IV or authentication tag');
    });

    it('should handle wrong decryption key', async () => {
      const encrypted = await encryptSpotifyToken(testToken, testKey);
      const wrongKey = '98765432109876543210987654321098'; // Different 32-byte key
      
      await expect(decryptSpotifyToken(encrypted, wrongKey)).rejects.toThrow(SpotifyTokenEncryptionError);
    });

    it('should handle corrupted encrypted data', async () => {
      const encrypted = await encryptSpotifyToken(testToken, testKey);
      const corruptedData = {
        ...encrypted,
        encryptedData: 'corrupted_data_that_wont_decrypt',
      };
      
      await expect(decryptSpotifyToken(corruptedData, testKey)).rejects.toThrow(SpotifyTokenEncryptionError);
    });
  });

  describe('SpotifyTokenEncryptionError', () => {
    it('should create custom error with proper message and cause', () => {
      const originalError = new Error('Original error');
      const customError = new SpotifyTokenEncryptionError('Custom error message', originalError);

      expect(customError.message).toBe('Custom error message');
      expect(customError.cause).toBe(originalError);
      expect(customError.name).toBe('SpotifyTokenEncryptionError');
      expect(customError).toBeInstanceOf(Error);
    });

    it('should create custom error without cause', () => {
      const customError = new SpotifyTokenEncryptionError('Custom error message');

      expect(customError.message).toBe('Custom error message');
      expect(customError.cause).toBeUndefined();
      expect(customError.name).toBe('SpotifyTokenEncryptionError');
    });
  });
});