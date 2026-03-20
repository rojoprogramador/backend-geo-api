/**
 * @fileoverview Unit Tests for JWT Utilities
 * Tests generateToken, verifyToken, extractTokenFromHeader, decodeTokenUnsafe
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock jsonwebtoken BEFORE importing jwtUtils
const mockJwt = {
  sign: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn()
};

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: mockJwt
}));

// Mock AppError classes
jest.unstable_mockModule('../../../utils/errors/AppError.js', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message = 'No autorizado') {
      super(message);
      this.statusCode = 401;
      this.isOperational = true;
    }
  }
}));

// Import modules AFTER mocking
const {
  generateToken,
  verifyToken,
  extractTokenFromHeader,
  decodeTokenUnsafe
} = await import('../../../utils/jwtUtils.js');
const { UnauthorizedError } = await import('../../../utils/errors/AppError.js');

describe('jwtUtils - generateToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.JWT_EXPIRES_IN = '24h';
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should generate a token with valid payload', () => {
    const payload = { id_usuario: 1, rol: 'Cliente' };
    const expectedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

    mockJwt.sign.mockReturnValue(expectedToken);

    const token = generateToken(payload);

    expect(mockJwt.sign).toHaveBeenCalledWith(
      payload,
      'test-secret-key',
      { expiresIn: '24h' }
    );
    expect(token).toBe(expectedToken);
  });

  it('should use custom expiresIn if provided', () => {
    const payload = { id_usuario: 2, rol: 'Técnico' };
    mockJwt.sign.mockReturnValue('token');

    generateToken(payload, '7d');

    expect(mockJwt.sign).toHaveBeenCalledWith(
      payload,
      'test-secret-key',
      { expiresIn: '7d' }
    );
  });

  it('should use default 24h if expiresIn not provided and JWT_EXPIRES_IN not set', () => {
    delete process.env.JWT_EXPIRES_IN;
    const payload = { id_usuario: 3, rol: 'Administrador' };
    mockJwt.sign.mockReturnValue('token');

    generateToken(payload);

    expect(mockJwt.sign).toHaveBeenCalledWith(
      payload,
      'test-secret-key',
      { expiresIn: '24h' }
    );
  });

  it('should throw error if JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    const payload = { id_usuario: 1, rol: 'Cliente' };

    expect(() => generateToken(payload)).toThrow('JWT_SECRET no está configurado en las variables de entorno');
  });

  it('should throw error if payload is not an object', () => {
    expect(() => generateToken('invalid')).toThrow('El payload del token debe ser un objeto');
    expect(() => generateToken(null)).toThrow('El payload del token debe ser un objeto');
    expect(() => generateToken(undefined)).toThrow('El payload del token debe ser un objeto');
  });

  it('should wrap jwt.sign errors with descriptive message', () => {
    const payload = { id_usuario: 1 };
    mockJwt.sign.mockImplementation(() => {
      throw new Error('Signing error');
    });

    expect(() => generateToken(payload)).toThrow('Error al generar token: Signing error');
  });
});

describe('jwtUtils - verifyToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key';
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should verify and decode a valid token', () => {
    const token = 'valid.jwt.token';
    const expectedPayload = { id_usuario: 1, rol: 'Cliente', iat: 1234567890 };

    mockJwt.verify.mockReturnValue(expectedPayload);

    const decoded = verifyToken(token);

    expect(mockJwt.verify).toHaveBeenCalledWith(token, 'test-secret-key');
    expect(decoded).toEqual(expectedPayload);
  });

  it('should throw error if JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    const token = 'some.jwt.token';

    expect(() => verifyToken(token)).toThrow('JWT_SECRET no está configurado en las variables de entorno');
  });

  it('should throw UnauthorizedError if token is not provided', () => {
    expect(() => verifyToken(null)).toThrow(UnauthorizedError);
    expect(() => verifyToken(null)).toThrow('Token no proporcionado');
  });

  it('should throw UnauthorizedError if token is not a string', () => {
    expect(() => verifyToken(123)).toThrow(UnauthorizedError);
    expect(() => verifyToken({})).toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError for TokenExpiredError', () => {
    const token = 'expired.jwt.token';
    const error = new Error('jwt expired');
    error.name = 'TokenExpiredError';

    mockJwt.verify.mockImplementation(() => {
      throw error;
    });

    expect(() => verifyToken(token)).toThrow(UnauthorizedError);
    expect(() => verifyToken(token)).toThrow('El token ha expirado');
  });

  it('should throw UnauthorizedError for JsonWebTokenError', () => {
    const token = 'invalid.jwt.token';
    const error = new Error('jwt malformed');
    error.name = 'JsonWebTokenError';

    mockJwt.verify.mockImplementation(() => {
      throw error;
    });

    expect(() => verifyToken(token)).toThrow(UnauthorizedError);
    expect(() => verifyToken(token)).toThrow('Token inválido');
  });

  it('should throw generic UnauthorizedError for other JWT errors', () => {
    const token = 'some.jwt.token';
    const error = new Error('Unknown JWT error');
    error.name = 'UnknownError';

    mockJwt.verify.mockImplementation(() => {
      throw error;
    });

    expect(() => verifyToken(token)).toThrow(UnauthorizedError);
    expect(() => verifyToken(token)).toThrow('Error al verificar el token');
  });
});

describe('jwtUtils - extractTokenFromHeader', () => {
  it('should extract token from valid Bearer header', () => {
    const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    const token = extractTokenFromHeader(authHeader);

    expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
  });

  it('should return null if authHeader is not provided', () => {
    expect(extractTokenFromHeader(null)).toBeNull();
    expect(extractTokenFromHeader(undefined)).toBeNull();
  });

  it('should return null if authHeader is not a string', () => {
    expect(extractTokenFromHeader(123)).toBeNull();
    expect(extractTokenFromHeader({})).toBeNull();
    expect(extractTokenFromHeader([])).toBeNull();
  });

  it('should return null if format is incorrect (not Bearer)', () => {
    expect(extractTokenFromHeader('Basic abc123')).toBeNull();
    expect(extractTokenFromHeader('Token abc123')).toBeNull();
  });

  it('should return null if format has wrong number of parts', () => {
    expect(extractTokenFromHeader('Bearer')).toBeNull();
    expect(extractTokenFromHeader('Bearer token extra')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractTokenFromHeader('')).toBeNull();
  });

  it('should handle tokens with dots and special characters', () => {
    const authHeader = 'Bearer eyJ.abc.xyz-123_456';
    const token = extractTokenFromHeader(authHeader);

    expect(token).toBe('eyJ.abc.xyz-123_456');
  });
});

describe('jwtUtils - decodeTokenUnsafe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should decode a valid token without verification', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    const expectedPayload = { id_usuario: 1, rol: 'Cliente' };

    mockJwt.decode.mockReturnValue(expectedPayload);

    const decoded = decodeTokenUnsafe(token);

    expect(mockJwt.decode).toHaveBeenCalledWith(token);
    expect(decoded).toEqual(expectedPayload);
  });

  it('should return null if decoding fails', () => {
    const token = 'invalid-token';

    mockJwt.decode.mockImplementation(() => {
      throw new Error('Decode error');
    });

    const decoded = decodeTokenUnsafe(token);

    expect(decoded).toBeNull();
  });

  it('should handle null token gracefully', () => {
    mockJwt.decode.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const decoded = decodeTokenUnsafe(null);

    expect(decoded).toBeNull();
  });

  it('should return decoded payload for expired token (no verification)', () => {
    const token = 'expired.jwt.token';
    const expiredPayload = { id_usuario: 1, rol: 'Cliente', exp: 1234567890 };

    mockJwt.decode.mockReturnValue(expiredPayload);

    const decoded = decodeTokenUnsafe(token);

    expect(decoded).toEqual(expiredPayload);
  });
});
