import bcrypt from 'bcrypt';

/**
 * Custom error class for password validation failures
 */
export class PasswordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordValidationError';
  }
}

/**
 * Password complexity requirements
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  specialChars: '!@#$%^&*()_+-={}[]|\\:";\'<>,.?/~`',
};

/**
 * bcrypt configuration
 */
export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Validates password complexity according to security requirements
 * 
 * Requirements:
 * - At least 8 characters long
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter  
 * - Contains at least one number
 * - Contains at least one special character
 * 
 * @param password - The password to validate
 * @throws {PasswordValidationError} If password doesn't meet requirements
 */
export function validatePassword(password: any): void {
  // Input type validation
  if (typeof password !== 'string') {
    throw new PasswordValidationError('Password must be a string');
  }

  // Handle null/undefined
  if (password === null || password === undefined) {
    throw new PasswordValidationError('Password is required');
  }

  // Length validation
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    throw new PasswordValidationError(
      `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
    );
  }

  // Uppercase letter validation
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    throw new PasswordValidationError(
      'Password must contain at least one uppercase letter'
    );
  }

  // Lowercase letter validation
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    throw new PasswordValidationError(
      'Password must contain at least one lowercase letter'
    );
  }

  // Number validation
  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    throw new PasswordValidationError(
      'Password must contain at least one number'
    );
  }

  // Special character validation
  if (PASSWORD_REQUIREMENTS.requireSpecialChar) {
    // Escape special regex characters for use in character class
    const escapedChars = PASSWORD_REQUIREMENTS.specialChars
      .replace(/\\/g, '\\\\')  // Escape backslash first
      .replace(/\]/g, '\\]')   // Escape closing bracket
      .replace(/\^/g, '\\^')   // Escape caret
      .replace(/-/g, '\\-');   // Escape hyphen
    
    const specialCharRegex = new RegExp(`[${escapedChars}]`);
    if (!specialCharRegex.test(password)) {
      throw new PasswordValidationError(
        'Password must contain at least one special character (!@#$%^&*()_+-={}[]|\\:";\'<>,.?/~`)'
      );
    }
  }

  // Additional security checks
  if (password.trim().length !== password.length) {
    throw new PasswordValidationError(
      'Password cannot start or end with whitespace'
    );
  }

  if (password.trim().length === 0) {
    throw new PasswordValidationError(
      'Password cannot be empty or contain only whitespace'
    );
  }
}

/**
 * Hashes a password using bcrypt with configured salt rounds
 * 
 * @param password - The plain text password to hash
 * @returns Promise<string> - The bcrypt hash
 * @throws {Error} If password is invalid or hashing fails
 */
export async function hashPassword(password: string): Promise<string> {
  // Input validation
  if (typeof password !== 'string') {
    throw new Error('Password must be a string');
  }

  if (password === null || password === undefined) {
    throw new Error('Password is required');
  }

  if (password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  try {
    // Generate salt and hash password
    const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    return hash;
  } catch (error) {
    throw new Error(`Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compares a plain text password with a bcrypt hash
 * 
 * @param password - The plain text password to verify
 * @param hash - The bcrypt hash to compare against
 * @returns Promise<boolean> - True if password matches hash, false otherwise
 * @throws {Error} If inputs are invalid or comparison fails
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  // Input validation
  if (typeof password !== 'string') {
    throw new Error('Password must be a string');
  }

  if (typeof hash !== 'string') {
    throw new Error('Hash must be a string');
  }

  if (password === null || password === undefined) {
    throw new Error('Password is required');
  }

  if (hash === null || hash === undefined) {
    throw new Error('Hash is required');
  }

  if (hash.length === 0) {
    throw new Error('Hash cannot be empty');
  }

  // Basic bcrypt hash format validation
  if (!hash.startsWith('$2b$') && !hash.startsWith('$2a$') && !hash.startsWith('$2y$')) {
    throw new Error('Invalid hash format');
  }

  // Additional format validation for bcrypt
  const bcryptPattern = /^\$2[aby]\$\d{1,2}\$[A-Za-z0-9\.\/]{53}$/;
  if (!bcryptPattern.test(hash)) {
    throw new Error('Invalid hash format');
  }

  try {
    // Use bcrypt to compare password with hash
    const result = await bcrypt.compare(password, hash);
    return result;
  } catch (error) {
    throw new Error(`Password comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validates and hashes a password in one step (convenience function)
 * 
 * @param password - The plain text password to validate and hash
 * @returns Promise<string> - The bcrypt hash
 * @throws {PasswordValidationError} If password validation fails
 * @throws {Error} If hashing fails
 */
export async function validateAndHashPassword(password: string): Promise<string> {
  validatePassword(password);
  return await hashPassword(password);
}

/**
 * Utility function to get password requirements as a human-readable string
 * 
 * @returns string - Description of password requirements
 */
export function getPasswordRequirements(): string {
  const requirements = [];
  
  requirements.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  
  if (PASSWORD_REQUIREMENTS.requireUppercase) {
    requirements.push('At least one uppercase letter');
  }
  
  if (PASSWORD_REQUIREMENTS.requireLowercase) {
    requirements.push('At least one lowercase letter');
  }
  
  if (PASSWORD_REQUIREMENTS.requireNumber) {
    requirements.push('At least one number');
  }
  
  if (PASSWORD_REQUIREMENTS.requireSpecialChar) {
    requirements.push('At least one special character');
  }
  
  return requirements.join(', ');
}

/**
 * Checks if a string contains potential security issues for passwords
 * (This is for additional security analysis, not for validation)
 * 
 * @param password - The password to analyze
 * @returns object - Analysis results
 */
export function analyzePasswordSecurity(password: string): {
  strength: 'weak' | 'moderate' | 'strong' | 'very-strong';
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{}|;':".,<>?/~`]/.test(password)) score += 1;

  // Check for common patterns
  if (/(.)\1{2,}/.test(password)) {
    issues.push('Contains repeated characters');
    suggestions.push('Avoid using the same character multiple times in a row');
    score -= 1;
  }

  if (/123|abc|qwerty|password|admin/i.test(password)) {
    issues.push('Contains common sequences or words');
    suggestions.push('Avoid common words and sequential patterns');
    score -= 2;
  }

  if (password.length < 8) {
    issues.push('Too short');
    suggestions.push('Use at least 8 characters');
  }

  if (!/[a-z]/.test(password)) {
    issues.push('Missing lowercase letters');
    suggestions.push('Include lowercase letters');
  }

  if (!/[A-Z]/.test(password)) {
    issues.push('Missing uppercase letters');
    suggestions.push('Include uppercase letters');
  }

  if (!/[0-9]/.test(password)) {
    issues.push('Missing numbers');
    suggestions.push('Include numbers');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{}|;':".,<>?/~`]/.test(password)) {
    issues.push('Missing special characters');
    suggestions.push('Include special characters');
  }

  let strength: 'weak' | 'moderate' | 'strong' | 'very-strong';
  if (score <= 3) {
    strength = 'weak';
  } else if (score <= 5) {
    strength = 'moderate';
  } else if (score <= 7) {
    strength = 'strong';
  } else {
    strength = 'very-strong';
  }

  return {
    strength,
    issues,
    suggestions,
  };
}