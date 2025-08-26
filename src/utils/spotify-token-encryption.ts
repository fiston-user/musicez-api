import crypto from 'crypto';
import logger from './logger';

export interface EncryptedTokenData {
  encryptedData: string;
  iv: string;
  tag: string;
}

export class SpotifyTokenEncryptionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'SpotifyTokenEncryptionError';
  }
}

const ALGORITHM = 'aes-256-gcm';
const REQUIRED_KEY_LENGTH = 32; // 32 bytes for AES-256

export async function encryptSpotifyToken(
  token: string, 
  encryptionKey: string
): Promise<EncryptedTokenData> {
  try {
    // Validate inputs
    if (!token || token.trim().length === 0) {
      throw new SpotifyTokenEncryptionError('Token cannot be empty');
    }

    if (encryptionKey.length !== REQUIRED_KEY_LENGTH) {
      throw new SpotifyTokenEncryptionError(
        `Invalid encryption key length. Key must be ${REQUIRED_KEY_LENGTH} bytes for AES-256.`
      );
    }

    // Generate a random initialization vector
    const iv = crypto.randomBytes(16); // 16 bytes for AES

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get the authentication tag
    const tag = cipher.getAuthTag();

    logger.debug('Spotify token encrypted successfully', {
      ivLength: iv.length,
      encryptedLength: encrypted.length,
      tagLength: tag.length,
    });

    return {
      encryptedData: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  } catch (error) {
    if (error instanceof SpotifyTokenEncryptionError) {
      throw error;
    }
    
    logger.error('Failed to encrypt Spotify token', { error: (error as Error).message });
    throw new SpotifyTokenEncryptionError('Failed to encrypt Spotify token', error as Error);
  }
}

export async function decryptSpotifyToken(
  encryptedData: EncryptedTokenData,
  encryptionKey: string
): Promise<string> {
  try {
    // Validate inputs
    if (!encryptedData.encryptedData || encryptedData.encryptedData.trim().length === 0) {
      throw new SpotifyTokenEncryptionError('Invalid encrypted data');
    }

    if (!encryptedData.iv || !encryptedData.tag) {
      throw new SpotifyTokenEncryptionError('Missing IV or authentication tag');
    }

    if (encryptionKey.length !== REQUIRED_KEY_LENGTH) {
      throw new SpotifyTokenEncryptionError(
        `Invalid encryption key length. Key must be ${REQUIRED_KEY_LENGTH} bytes for AES-256.`
      );
    }

    // Convert hex strings back to buffers
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(tag);

    // Decrypt the data
    let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug('Spotify token decrypted successfully', {
      decryptedLength: decrypted.length,
    });

    return decrypted;
  } catch (error) {
    if (error instanceof SpotifyTokenEncryptionError) {
      throw error;
    }
    
    logger.error('Failed to decrypt Spotify token', { error: (error as Error).message });
    throw new SpotifyTokenEncryptionError('Failed to decrypt Spotify token', error as Error);
  }
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(REQUIRED_KEY_LENGTH).toString('hex').substring(0, REQUIRED_KEY_LENGTH);
}

export function validateEncryptionKey(key: string): boolean {
  return key.length === REQUIRED_KEY_LENGTH;
}