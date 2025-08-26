import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * API key security configuration
 */
export const API_KEY_SECURITY = {
  hashSaltRounds: 12,
  encryptionAlgorithm: 'aes-256-gcm' as const,
  keyDerivationIterations: 100000,
  authTagLength: 16,
};

/**
 * Custom error class for API key security operations
 */
export class ApiKeySecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeySecurityError';
  }
}

/**
 * Hash an API key value for secure storage using bcrypt
 * Used for API keys that need to be verified but not decrypted
 */
export const hashApiKey = async (apiKey: string): Promise<string> => {
  try {
    if (!apiKey || apiKey.length < 8) {
      throw new ApiKeySecurityError('API key must be at least 8 characters long');
    }

    const hashedKey = await bcrypt.hash(apiKey, API_KEY_SECURITY.hashSaltRounds);
    return hashedKey;
  } catch (error) {
    if (error instanceof ApiKeySecurityError) {
      throw error;
    }
    throw new ApiKeySecurityError(`Failed to hash API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Verify an API key against its hash
 */
export const verifyApiKey = async (apiKey: string, hashedKey: string): Promise<boolean> => {
  try {
    if (!apiKey || !hashedKey) {
      return false;
    }

    return await bcrypt.compare(apiKey, hashedKey);
  } catch (error) {
    throw new ApiKeySecurityError(`Failed to verify API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Generate a random API key with specified length and character set
 */
export const generateApiKey = (length: number = 32, prefix?: string): string => {
  if (length < 16) {
    throw new ApiKeySecurityError('API key length must be at least 16 characters');
  }

  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return prefix ? `${prefix}${result}` : result;
};

/**
 * Encrypt an API key value for secure storage (for keys that need to be retrieved)
 * Uses AES-256-GCM with a key derived from environment variables
 */
export const encryptApiKey = (apiKey: string, masterKey?: string): {
  encryptedKey: string;
  iv: string;
  authTag: string;
} => {
  try {
    if (!apiKey) {
      throw new ApiKeySecurityError('API key cannot be empty');
    }

    // Use provided master key or derive from environment
    const keySource = masterKey || process.env.API_KEY_ENCRYPTION_KEY || 'default-key-change-in-production';
    
    // Derive encryption key using PBKDF2
    const salt = crypto.randomBytes(32);
    const derivedKey = crypto.pbkdf2Sync(keySource, salt, API_KEY_SECURITY.keyDerivationIterations, 32, 'sha256');
    
    // Generate random IV
    const iv = crypto.randomBytes(12);
    
    // Create cipher
    const cipher = crypto.createCipheriv(API_KEY_SECURITY.encryptionAlgorithm, derivedKey, iv);
    
    // Encrypt the API key
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine salt, iv, authTag, and encrypted data
    const combined = Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, 'hex')]);
    
    return {
      encryptedKey: combined.toString('base64'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (error) {
    throw new ApiKeySecurityError(`Failed to encrypt API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Decrypt an API key value from secure storage
 */
export const decryptApiKey = (encryptedData: string, masterKey?: string): string => {
  try {
    if (!encryptedData) {
      throw new ApiKeySecurityError('Encrypted data cannot be empty');
    }

    // Use provided master key or derive from environment
    const keySource = masterKey || process.env.API_KEY_ENCRYPTION_KEY || 'default-key-change-in-production';
    
    // Decode the combined data
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, 32);
    const iv = combined.subarray(32, 44);
    const authTag = combined.subarray(44, 60);
    const encrypted = combined.subarray(60);
    
    // Derive the same key using the extracted salt
    const derivedKey = crypto.pbkdf2Sync(keySource, salt, API_KEY_SECURITY.keyDerivationIterations, 32, 'sha256');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(API_KEY_SECURITY.encryptionAlgorithm, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the API key
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new ApiKeySecurityError(`Failed to decrypt API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Sanitize API key value for logging (masks most characters)
 */
export const sanitizeApiKeyForLogging = (apiKey: string): string => {
  if (!apiKey || apiKey.length < 4) {
    return '***';
  }
  
  if (apiKey.length <= 8) {
    return apiKey.substring(0, 2) + '*'.repeat(apiKey.length - 2);
  }
  
  const start = apiKey.substring(0, 4);
  const end = apiKey.substring(apiKey.length - 2);
  const masked = '*'.repeat(Math.max(3, apiKey.length - 6));
  
  return `${start}${masked}${end}`;
};

/**
 * Validate API key format and strength
 */
export const validateApiKeyFormat = (apiKey: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (!apiKey) {
    errors.push('API key is required');
  } else {
    if (apiKey.length < 8) {
      errors.push('API key must be at least 8 characters long');
    }
    
    if (apiKey.length > 512) {
      errors.push('API key must not exceed 512 characters');
    }
    
    // Check for valid characters (alphanumeric, hyphens, underscores, periods)
    const validCharacterPattern = /^[a-zA-Z0-9\-_.]+$/;
    if (!validCharacterPattern.test(apiKey)) {
      errors.push('API key can only contain letters, numbers, hyphens, underscores, and periods');
    }
    
    // Check for common weak patterns
    const weakPatterns = [
      /^(test|demo|sample|example)/i,
      /^(123|abc|qwerty)/i,
      /(.)\1{7,}/, // Repeated characters
    ];
    
    for (const pattern of weakPatterns) {
      if (pattern.test(apiKey)) {
        errors.push('API key appears to use a weak or common pattern');
        break;
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Hash API key for quick lookup (non-reversible)
 * Used for indexing and duplicate detection
 */
export const hashApiKeyForLookup = (apiKey: string): string => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Generate a secure random API key with prefix
 */
export const generateSecureApiKey = (service: 'spotify' | 'openai' | 'custom', customPrefix?: string): string => {
  const prefixes = {
    spotify: 'sk_sp_',
    openai: 'sk_oa_',
    custom: customPrefix || 'sk_',
  };
  
  const prefix = prefixes[service];
  const randomPart = generateApiKey(32);
  
  return `${prefix}${randomPart}`;
};