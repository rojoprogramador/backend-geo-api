/**
 * @fileoverview Unit Tests for Password Utilities
 * Tests hashPassword, comparePassword, validatePasswordStrength
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock bcrypt BEFORE importing passwordUtils
const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn()
};

jest.unstable_mockModule('bcrypt', () => ({
  default: mockBcrypt
}));

// Mock ValidationError
jest.unstable_mockModule('../../../utils/errors/AppError.js', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(message = 'Error de validación', errors = []) {
      super(message);
      this.statusCode = 400;
      this.isOperational = true;
      this.errors = errors;
    }
  }
}));

// Import modules AFTER mocking
const {
  hashPassword,
  comparePassword,
  validatePasswordStrength
} = await import('../../../utils/passwordUtils.js');
const { ValidationError } = await import('../../../utils/errors/AppError.js');

describe('passwordUtils - hashPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should hash a valid password', async () => {
    const password = 'MySecurePassword123!';
    const hashedPassword = '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890';

    mockBcrypt.hash.mockResolvedValue(hashedPassword);

    const result = await hashPassword(password);

    expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 10);
    expect(result).toBe(hashedPassword);
  });

  it('should use SALT_ROUNDS = 10', async () => {
    const password = 'TestPassword123!';
    mockBcrypt.hash.mockResolvedValue('hashed');

    await hashPassword(password);

    expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 10);
  });

  it('should throw ValidationError if password is empty', async () => {
    await expect(hashPassword('')).rejects.toThrow(ValidationError);
    await expect(hashPassword('')).rejects.toThrow('La contraseña es requerida');
  });

  it('should throw ValidationError if password is null', async () => {
    await expect(hashPassword(null)).rejects.toThrow(ValidationError);
    await expect(hashPassword(null)).rejects.toThrow('La contraseña es requerida');
  });

  it('should throw ValidationError if password is undefined', async () => {
    await expect(hashPassword(undefined)).rejects.toThrow(ValidationError);
    await expect(hashPassword(undefined)).rejects.toThrow('La contraseña es requerida');
  });

  it('should throw ValidationError if password is not a string', async () => {
    await expect(hashPassword(123)).rejects.toThrow(ValidationError);
    await expect(hashPassword({})).rejects.toThrow(ValidationError);
    await expect(hashPassword([])).rejects.toThrow(ValidationError);
  });

  it('should wrap bcrypt errors with descriptive message', async () => {
    const password = 'ValidPassword123!';
    mockBcrypt.hash.mockRejectedValue(new Error('Bcrypt internal error'));

    await expect(hashPassword(password)).rejects.toThrow('Error al hashear la contraseña: Bcrypt internal error');
  });

  it('should handle long passwords', async () => {
    const longPassword = 'a'.repeat(100) + 'A1!';
    mockBcrypt.hash.mockResolvedValue('hashed');

    await hashPassword(longPassword);

    expect(mockBcrypt.hash).toHaveBeenCalledWith(longPassword, 10);
  });
});

describe('passwordUtils - comparePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true for matching password and hash', async () => {
    const password = 'MyPassword123!';
    const hash = '$2b$10$hashedpasswordhere';

    mockBcrypt.compare.mockResolvedValue(true);

    const result = await comparePassword(password, hash);

    expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
    expect(result).toBe(true);
  });

  it('should return false for non-matching password and hash', async () => {
    const password = 'WrongPassword123!';
    const hash = '$2b$10$hashedpasswordhere';

    mockBcrypt.compare.mockResolvedValue(false);

    const result = await comparePassword(password, hash);

    expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
    expect(result).toBe(false);
  });

  it('should throw ValidationError if password is missing', async () => {
    const hash = '$2b$10$hashedpasswordhere';

    await expect(comparePassword('', hash)).rejects.toThrow(ValidationError);
    await expect(comparePassword(null, hash)).rejects.toThrow(ValidationError);
    await expect(comparePassword(undefined, hash)).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError if hash is missing', async () => {
    const password = 'MyPassword123!';

    await expect(comparePassword(password, '')).rejects.toThrow(ValidationError);
    await expect(comparePassword(password, null)).rejects.toThrow(ValidationError);
    await expect(comparePassword(password, undefined)).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError with appropriate message when parameters are missing', async () => {
    await expect(comparePassword(null, null)).rejects.toThrow('Se requieren contraseña y hash para comparar');
  });

  it('should wrap bcrypt errors with descriptive message', async () => {
    const password = 'MyPassword123!';
    const hash = '$2b$10$hashedpasswordhere';

    mockBcrypt.compare.mockRejectedValue(new Error('Bcrypt comparison failed'));

    await expect(comparePassword(password, hash)).rejects.toThrow('Error al comparar contraseñas: Bcrypt comparison failed');
  });

  it('should handle various password formats', async () => {
    const testCases = [
      { password: 'Simple123!', hash: '$2b$10$hash1' },
      { password: 'With Spaces 123!', hash: '$2b$10$hash2' },
      { password: 'Símbolos@#$%123Aa', hash: '$2b$10$hash3' },
      { password: '12345678Aa!', hash: '$2b$10$hash4' }
    ];

    for (const { password, hash } of testCases) {
      mockBcrypt.compare.mockResolvedValue(true);
      await comparePassword(password, hash);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
    }
  });
});

describe('passwordUtils - validatePasswordStrength', () => {
  describe('Valid passwords', () => {
    it('should validate a strong password', () => {
      const result = validatePasswordStrength('SecurePass123!');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept password with all required elements', () => {
      const result = validatePasswordStrength('Abcd1234!@#$');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept minimum valid password (8 chars)', () => {
      const result = validatePasswordStrength('Pass123!');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password with various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', ':', '"', '\\', '|', ',', '.', '<', '>', '/', '?'];

      for (const char of specialChars) {
        const password = `SecurePass123${char}`;
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('Invalid passwords', () => {
    it('should return error if password is null', () => {
      const result = validatePasswordStrength(null);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(['La contraseña es requerida']);
    });

    it('should return error if password is undefined', () => {
      const result = validatePasswordStrength(undefined);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(['La contraseña es requerida']);
    });

    it('should return error if password is not a string', () => {
      const result = validatePasswordStrength(123);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(['La contraseña es requerida']);
    });

    it('should return error if password is too short', () => {
      const result = validatePasswordStrength('Pass1!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('La contraseña debe tener al menos 8 caracteres');
    });

    it('should return error if password lacks uppercase letter', () => {
      const result = validatePasswordStrength('password123!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos una letra mayúscula');
    });

    it('should return error if password lacks lowercase letter', () => {
      const result = validatePasswordStrength('PASSWORD123!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos una letra minúscula');
    });

    it('should return error if password lacks number', () => {
      const result = validatePasswordStrength('Password!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos un número');
    });

    it('should return error if password lacks special character', () => {
      const result = validatePasswordStrength('Password123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('La contraseña debe contener al menos un carácter especial (!@#$%^&*)');
    });

    it('should return multiple errors for weak password', () => {
      const result = validatePasswordStrength('pass');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors).toContain('La contraseña debe tener al menos 8 caracteres');
      expect(result.errors).toContain('La contraseña debe contener al menos una letra mayúscula');
      expect(result.errors).toContain('La contraseña debe contener al menos un número');
      expect(result.errors).toContain('La contraseña debe contener al menos un carácter especial (!@#$%^&*)');
    });

    it('should return required error for empty string', () => {
      const result = validatePasswordStrength('');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors).toContain('La contraseña es requerida');
    });

    it('should validate exactly 8 characters edge case', () => {
      const result = validatePasswordStrength('Pass12!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('La contraseña debe tener al menos 8 caracteres');
    });
  });

  describe('Edge cases', () => {
    it('should handle password with only spaces', () => {
      const result = validatePasswordStrength('        ');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle very long password', () => {
      const longPassword = 'A1!' + 'a'.repeat(100);
      const result = validatePasswordStrength(longPassword);

      expect(result.isValid).toBe(true);
    });

    it('should handle password with unicode characters', () => {
      const result = validatePasswordStrength('Contraseña123!');

      expect(result.isValid).toBe(true);
    });

    it('should return object with correct structure', () => {
      const result = validatePasswordStrength('TestPass123!');

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(typeof result.isValid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should validate password with multiple special characters', () => {
      const result = validatePasswordStrength('P@ssw0rd!#$');

      expect(result.isValid).toBe(true);
    });

    it('should validate password with numbers at different positions', () => {
      const passwords = ['1Password!', 'Pass1word!', 'Password1!'];

      passwords.forEach(password => {
        const result = validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
      });
    });
  });
});
