/**
 * @fileoverview Unit Tests for Error Handler Utilities
 * Tests handleError, globalErrorHandler, and Sequelize/JWT error mapping
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock logger BEFORE importing errorHandler
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

// Define base class so subclasses can extend it (instanceof works)
class MockAppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  }
}

// Mock AppError classes BEFORE importing errorHandler
jest.unstable_mockModule('../../../utils/errors/AppError.js', () => ({
  AppError: MockAppError,
  ValidationError: class ValidationError extends MockAppError {
    constructor(message = 'Error de validación', errors = []) {
      super(message, 400);
      this.errors = errors;
    }
  },
  UnauthorizedError: class UnauthorizedError extends MockAppError {
    constructor(message = 'No autorizado') {
      super(message, 401);
    }
  },
  NotFoundError: class NotFoundError extends MockAppError {
    constructor(message = 'Recurso no encontrado') {
      super(message, 404);
    }
  },
  ConflictError: class ConflictError extends MockAppError {
    constructor(message = 'Conflicto') {
      super(message, 409);
    }
  }
}));

// Import modules AFTER mocking
const { handleError, globalErrorHandler } = await import('../../../utils/errorHandler.js');
const logger = (await import('../../../utils/logger.js')).default;
const {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError
} = await import('../../../utils/errors/AppError.js');

describe('errorHandler - handleError', () => {
  let mockRes;

  beforeEach(() => {
    // Mock Express response object
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('AppError handling', () => {
    it('should handle ValidationError (400)', () => {
      const error = new ValidationError('Datos inválidos', ['Campo requerido']);

      handleError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Datos inválidos',
        errors: ['Campo requerido']
      });
    });

    it('should handle UnauthorizedError (401)', () => {
      const error = new UnauthorizedError('Token inválido');

      handleError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token inválido'
      });
    });

    it('should handle NotFoundError (404)', () => {
      const error = new NotFoundError('Usuario no encontrado');

      handleError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Usuario no encontrado'
      });
    });

    it('should handle ConflictError (409)', () => {
      const error = new ConflictError('Correo ya registrado');

      handleError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Correo ya registrado'
      });
    });

    it('should handle AppError with custom status code (500)', () => {
      const error = new AppError('Error interno', 500);

      handleError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error interno'
      });
    });

    it('should include errors array if present', () => {
      const error = new ValidationError('Validación fallida', ['Error 1', 'Error 2']);

      handleError(mockRes, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validación fallida',
        errors: ['Error 1', 'Error 2']
      });
    });
  });

  describe('Non-AppError handling', () => {
    it('should handle generic Error (500)', () => {
      const error = new Error('Error desconocido');

      handleError(mockRes, error);

      expect(logger.error).toHaveBeenCalledWith('Error no controlado:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error interno del servidor'
      });
    });

    it('should log non-AppError before responding', () => {
      const error = new Error('Unexpected error');

      handleError(mockRes, error);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error no controlado:', error);
    });
  });
});

describe('errorHandler - globalErrorHandler', () => {
  let mockReq, mockRes, mockNext;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockReq = {
      originalUrl: '/api/test',
      method: 'POST',
      ip: '127.0.0.1'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Sequelize error handling', () => {
    it('should handle SequelizeUniqueConstraintError (409)', () => {
      const error = {
        name: 'SequelizeUniqueConstraintError',
        errors: [{ path: 'correo_electronico' }],
        message: 'Validation error'
      };

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'El correo_electronico ya está registrado en el sistema'
        })
      );
    });

    it('should handle SequelizeValidationError (400)', () => {
      const error = {
        name: 'SequelizeValidationError',
        errors: [
          { message: 'El nombre es requerido' },
          { message: 'El correo es inválido' }
        ],
        message: 'Validation error'
      };

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Error de validación',
          errors: ['El nombre es requerido', 'El correo es inválido']
        })
      );
    });

    it('should handle SequelizeForeignKeyConstraintError (409)', () => {
      const error = {
        name: 'SequelizeForeignKeyConstraintError',
        message: 'Foreign key constraint'
      };

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'No se puede completar la operación debido a restricciones de integridad referencial'
        })
      );
    });

    it('should handle SequelizeConnectionError (503)', () => {
      const error = {
        name: 'SequelizeConnectionError',
        message: 'Connection refused'
      };

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Error de conexión con la base de datos'
        })
      );
    });
  });

  describe('JWT error handling', () => {
    it('should handle JsonWebTokenError (401)', () => {
      const error = {
        name: 'JsonWebTokenError',
        message: 'jwt malformed'
      };

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Token inválido'
        })
      );
    });

    it('should handle TokenExpiredError (401)', () => {
      const error = {
        name: 'TokenExpiredError',
        message: 'jwt expired'
      };

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'El token ha expirado'
        })
      );
    });
  });

  describe('Environment-based responses', () => {
    it('should include error details in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      error.statusCode = 500;

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Test error'
        })
      );
    });

    it('should hide stack trace in production mode for operational errors', () => {
      process.env.NODE_ENV = 'production';
      const error = new ValidationError('Datos inválidos');

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Datos inválidos'
        })
      );
      expect(mockRes.json.mock.calls[0][0]).not.toHaveProperty('stack');
    });

    it('should send generic message for non-operational errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Programming error');
      error.isOperational = false;

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Ha ocurrido un error interno del servidor'
      });
    });
  });

  describe('Error logging', () => {
    it('should log error details with request context', () => {
      const error = new Error('Test error');

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error',
          url: '/api/test',
          method: 'POST',
          ip: '127.0.0.1'
        })
      );
    });

    it('should log additional error details for non-operational errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Programming bug');
      error.isOperational = false;

      globalErrorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledTimes(2); // Once in main handler, once in sendErrorProd
    });
  });
});
