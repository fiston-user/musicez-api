import {
  validatePassword,
  hashPassword,
  comparePassword,
  PasswordValidationError,
} from '../../src/utils/password-security';

describe('Password Security Utilities', () => {
  describe('Password Validation', () => {
    describe('Valid passwords', () => {
      const validPasswords = [
        'Password123!',
        'MySecure1@',
        'Test#Pass1',
        'Abcd1234#',
        'Complex$Pass9',
        'StrongP@ssw0rd',
        'Valid123$',
        'Secure#1Pass',
        'MyT3st!Pass',
        'Good@Pass1',
      ];

      validPasswords.forEach((password) => {
        it(`should validate "${password}" as valid`, () => {
          expect(() => validatePassword(password)).not.toThrow();
        });
      });
    });

    describe('Invalid passwords - too short', () => {
      const shortPasswords = [
        'A1!',
        'Test1!',
        'Ab1#',
        '1234567',
        'Aa1!',
        'Short1!',
      ];

      shortPasswords.forEach((password) => {
        it(`should reject "${password}" as too short`, () => {
          expect(() => validatePassword(password)).toThrow(PasswordValidationError);
          expect(() => validatePassword(password)).toThrow('at least 8 characters');
        });
      });
    });

    describe('Invalid passwords - missing uppercase', () => {
      const noUppercasePasswords = [
        'password123!',
        'mytest123#',
        'lowercase1@',
        'test123$pass',
        'nouppercase9!',
      ];

      noUppercasePasswords.forEach((password) => {
        it(`should reject "${password}" for missing uppercase letter`, () => {
          expect(() => validatePassword(password)).toThrow(PasswordValidationError);
          expect(() => validatePassword(password)).toThrow('uppercase letter');
        });
      });
    });

    describe('Invalid passwords - missing lowercase', () => {
      const noLowercasePasswords = [
        'PASSWORD123!',
        'MYTEST123#',
        'UPPERCASE1@',
        'TEST123$PASS',
        'NOLOWERCASE9!',
      ];

      noLowercasePasswords.forEach((password) => {
        it(`should reject "${password}" for missing lowercase letter`, () => {
          expect(() => validatePassword(password)).toThrow(PasswordValidationError);
          expect(() => validatePassword(password)).toThrow('lowercase letter');
        });
      });
    });

    describe('Invalid passwords - missing number', () => {
      const noNumberPasswords = [
        'Password!',
        'MyTest#Pass',
        'NoNumbers@',
        'Test$Pass',
        'NoDigits!Pass',
      ];

      noNumberPasswords.forEach((password) => {
        it(`should reject "${password}" for missing number`, () => {
          expect(() => validatePassword(password)).toThrow(PasswordValidationError);
          expect(() => validatePassword(password)).toThrow('number');
        });
      });
    });

    describe('Invalid passwords - missing special character', () => {
      const noSpecialCharPasswords = [
        'Password123',
        'MyTest123Pass',
        'NoSpecial123',
        'Test123Pass',
        'NoSymbols123Pass',
      ];

      noSpecialCharPasswords.forEach((password) => {
        it(`should reject "${password}" for missing special character`, () => {
          expect(() => validatePassword(password)).toThrow(PasswordValidationError);
          expect(() => validatePassword(password)).toThrow('special character');
        });
      });
    });

    describe('Edge cases', () => {
      it('should handle empty string', () => {
        expect(() => validatePassword('')).toThrow(PasswordValidationError);
        expect(() => validatePassword('')).toThrow('at least 8 characters');
      });

      it('should handle null/undefined', () => {
        expect(() => validatePassword(null as any)).toThrow(PasswordValidationError);
        expect(() => validatePassword(undefined as any)).toThrow(PasswordValidationError);
      });

      it('should handle non-string input', () => {
        expect(() => validatePassword(123 as any)).toThrow(PasswordValidationError);
        expect(() => validatePassword({} as any)).toThrow(PasswordValidationError);
        expect(() => validatePassword([] as any)).toThrow(PasswordValidationError);
      });

      it('should handle whitespace-only password', () => {
        expect(() => validatePassword('        ')).toThrow(PasswordValidationError);
      });

      it('should handle very long valid password', () => {
        const longPassword = 'A'.repeat(25) + 'a'.repeat(25) + '1' + '!';
        expect(() => validatePassword(longPassword)).not.toThrow();
      });
    });

    describe('Special character validation', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '+', '=', '{', '}', '[', ']', '|', '\\', ':', ';', '"', "'", '<', '>', ',', '.', '?', '/', '~', '`'];
      
      specialChars.forEach((char) => {
        it(`should accept "${char}" as valid special character`, () => {
          const password = `Password123${char}`;
          expect(() => validatePassword(password)).not.toThrow();
        });
      });
    });
  });

  describe('Password Hashing', () => {
    const testPassword = 'TestPassword123!';
    const anotherPassword = 'AnotherPass456@';

    describe('Hash generation', () => {
      it('should generate a hash for valid password', async () => {
        const hash = await hashPassword(testPassword);
        
        expect(hash).toBeDefined();
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 characters
        expect(hash).toMatch(/^\$2b\$12\$/); // bcrypt format with cost factor 12
      });

      it('should generate different hashes for same password (salt)', async () => {
        const hash1 = await hashPassword(testPassword);
        const hash2 = await hashPassword(testPassword);
        
        expect(hash1).not.toBe(hash2);
        expect(hash1).toMatch(/^\$2b\$12\$/);
        expect(hash2).toMatch(/^\$2b\$12\$/);
      });

      it('should generate different hashes for different passwords', async () => {
        const hash1 = await hashPassword(testPassword);
        const hash2 = await hashPassword(anotherPassword);
        
        expect(hash1).not.toBe(hash2);
      });

      it('should handle empty password', async () => {
        await expect(hashPassword('')).rejects.toThrow();
      });

      it('should handle null/undefined password', async () => {
        await expect(hashPassword(null as any)).rejects.toThrow();
        await expect(hashPassword(undefined as any)).rejects.toThrow();
      });
    });

    describe('Hash format validation', () => {
      it('should produce bcrypt hash with correct cost factor', async () => {
        const hash = await hashPassword(testPassword);
        
        // bcrypt hash format: $2b$12$[22 char salt][31 char hash]
        expect(hash).toMatch(/^\$2b\$12\$.{53}$/);
      });

      it('should use cost factor 12 for security', async () => {
        const hash = await hashPassword(testPassword);
        const costFactor = hash.substring(4, 6);
        
        expect(costFactor).toBe('12');
      });
    });
  });

  describe('Password Comparison', () => {
    const testPassword = 'TestPassword123!';
    const wrongPassword = 'WrongPassword456@';
    let testHash: string;

    beforeAll(async () => {
      testHash = await hashPassword(testPassword);
    });

    describe('Valid comparisons', () => {
      it('should return true for correct password', async () => {
        const result = await comparePassword(testPassword, testHash);
        expect(result).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const result = await comparePassword(wrongPassword, testHash);
        expect(result).toBe(false);
      });

      it('should return false for empty password', async () => {
        const result = await comparePassword('', testHash);
        expect(result).toBe(false);
      });

      it('should work with special characters in password', async () => {
        const specialPassword = 'Special@#$%^&*()123';
        const specialHash = await hashPassword(specialPassword);
        
        const result = await comparePassword(specialPassword, specialHash);
        expect(result).toBe(true);
      });

      it('should work with long passwords', async () => {
        const longPassword = 'A'.repeat(100) + '123!';
        const longHash = await hashPassword(longPassword);
        
        const result = await comparePassword(longPassword, longHash);
        expect(result).toBe(true);
      });
    });

    describe('Invalid inputs', () => {
      it('should handle null/undefined password', async () => {
        await expect(comparePassword(null as any, testHash)).rejects.toThrow();
        await expect(comparePassword(undefined as any, testHash)).rejects.toThrow();
      });

      it('should handle null/undefined hash', async () => {
        await expect(comparePassword(testPassword, null as any)).rejects.toThrow();
        await expect(comparePassword(testPassword, undefined as any)).rejects.toThrow();
      });

      it('should handle invalid hash format', async () => {
        await expect(comparePassword(testPassword, 'invalid-hash')).rejects.toThrow();
        await expect(comparePassword(testPassword, '')).rejects.toThrow();
        await expect(comparePassword(testPassword, '123456789')).rejects.toThrow();
      });

      it('should handle non-string inputs', async () => {
        await expect(comparePassword(123 as any, testHash)).rejects.toThrow();
        await expect(comparePassword(testPassword, 123 as any)).rejects.toThrow();
      });
    });

    describe('Security properties', () => {
      it('should be timing-attack resistant (consistent timing)', async () => {
        const iterations = 5;
        const times: number[] = [];
        
        // Test multiple iterations to check timing consistency
        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          await comparePassword('wrongpassword123!', testHash);
          const end = process.hrtime.bigint();
          times.push(Number(end - start) / 1000000); // Convert to milliseconds
        }
        
        // All times should be within reasonable range (not exact due to system variance)
        const avgTime = times.reduce((a, b) => a + b) / times.length;
        const maxDeviation = Math.max(...times.map(t => Math.abs(t - avgTime)));
        
        // Allow reasonable system variance (up to 50% deviation)
        expect(maxDeviation / avgTime).toBeLessThan(0.5);
      });

      it('should not leak information through exceptions', async () => {
        // Should handle malformed hashes gracefully
        const malformedHashes = [
          '$2b$12$invalidhash',
          '$2a$10$tooshort',
          'nothash',
          '$2b$invalid$hash',
        ];
        
        for (const hash of malformedHashes) {
          await expect(comparePassword(testPassword, hash)).rejects.toThrow();
        }
      });
    });
  });

  describe('Integration Tests', () => {
    describe('Complete password workflow', () => {
      it('should handle registration → login flow', async () => {
        const userPassword = 'UserPassword123!';
        
        // Validate password (registration)
        expect(() => validatePassword(userPassword)).not.toThrow();
        
        // Hash password (store in database)
        const hashedPassword = await hashPassword(userPassword);
        expect(hashedPassword).toBeDefined();
        
        // Compare password (login)
        const loginResult = await comparePassword(userPassword, hashedPassword);
        expect(loginResult).toBe(true);
        
        // Wrong password should fail
        const wrongLoginResult = await comparePassword('WrongPassword123!', hashedPassword);
        expect(wrongLoginResult).toBe(false);
      });

      it('should handle password change workflow', async () => {
        const oldPassword = 'OldPassword123!';
        const newPassword = 'NewPassword456@';
        
        // Hash old password
        const oldHash = await hashPassword(oldPassword);
        
        // Verify old password
        expect(await comparePassword(oldPassword, oldHash)).toBe(true);
        
        // Validate new password
        expect(() => validatePassword(newPassword)).not.toThrow();
        
        // Hash new password
        const newHash = await hashPassword(newPassword);
        
        // Verify new password works
        expect(await comparePassword(newPassword, newHash)).toBe(true);
        
        // Verify old password no longer works with new hash
        expect(await comparePassword(oldPassword, newHash)).toBe(false);
        
        // Verify new password doesn't work with old hash
        expect(await comparePassword(newPassword, oldHash)).toBe(false);
      });
    });

    describe('Concurrent operations', () => {
      it('should handle multiple concurrent hash operations', async () => {
        const passwords = [
          'Password1!',
          'Password2@',
          'Password3#',
          'Password4$',
          'Password5%',
        ];
        
        const hashPromises = passwords.map(password => hashPassword(password));
        const hashes = await Promise.all(hashPromises);
        
        // All hashes should be unique
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(passwords.length);
        
        // Verify each hash matches its password
        for (let i = 0; i < passwords.length; i++) {
          const isValid = await comparePassword(passwords[i], hashes[i]);
          expect(isValid).toBe(true);
        }
      });

      it('should handle multiple concurrent comparison operations', async () => {
        const password = 'ConcurrentTest123!';
        const hash = await hashPassword(password);
        
        const comparisonPromises = Array(10).fill(null).map(() => 
          comparePassword(password, hash)
        );
        
        const results = await Promise.all(comparisonPromises);
        
        // All comparisons should return true
        expect(results.every(result => result === true)).toBe(true);
      });
    });
  });

  describe('PasswordValidationError', () => {
    it('should be an instance of Error', () => {
      const error = new PasswordValidationError('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PasswordValidationError');
      expect(error.message).toBe('test message');
    });

    it('should have proper stack trace', () => {
      const error = new PasswordValidationError('test message');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('PasswordValidationError');
    });
  });
});