/**
 * @fileoverview Unit tests for authController
 * Tests login and cambiarContrasena endpoints with comprehensive coverage
 */

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// MOCKS — Must be declared BEFORE imports
// ---------------------------------------------------------------------------

// Mock models — inline mocks (can't use await inside non-async factory)
const mockModels = {
  sequelize: { transaction: jest.fn(), fn: jest.fn(), col: jest.fn(), query: jest.fn() },
  Usuario: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() },
  Rol: { findOne: jest.fn(), _name: 'Rol' },
  Tecnico: { findOne: jest.fn(), findByPk: jest.fn(), _name: 'Tecnico' },
};
jest.unstable_mockModule('../../../models/index.js', () => mockModels);

// Mock bcrypt
jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}));

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn(),
  },
}));

// Mock dotenv
jest.unstable_mockModule('dotenv', () => ({
  default: {
    config: jest.fn(),
  },
}));

// Mock logger
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock handleError - behaves like the real one but is a mock we can inspect
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({
  handleError: jest.fn((res, error) => {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
    });
  }),
}));

// ---------------------------------------------------------------------------
// IMPORTS — Must come AFTER all jest.unstable_mockModule calls
// ---------------------------------------------------------------------------

const { Usuario, Rol, Tecnico } = await import('../../../models/index.js');
const bcrypt = await import('bcrypt');
const jwt = await import('jsonwebtoken');
const logger = await import('../../../utils/logger.js');
const { handleError } = await import('../../../utils/errorHandler.js');

// Import REAL error classes (not mocked)
const { ValidationError, UnauthorizedError } = await import(
  '../../../utils/errors/AppError.js'
);

// Import controller under test
const { login, cambiarContrasena } = await import(
  '../../../controllers/authController.js'
);

// Import mock helpers
const { createReqMock, createResMock, resetAllMocks } = await import(
  '../../mocks/models.js'
);

// ---------------------------------------------------------------------------
// TEST SUITES
// ---------------------------------------------------------------------------

describe('authController', () => {
  beforeEach(() => {
    // Set environment variables
    process.env.JWT_SECRET = 'test_secret';
    process.env.JWT_EXPIRES_IN = '1h';

    // Reset all mocks
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // LOGIN TESTS
  // -------------------------------------------------------------------------

  describe('login', () => {
    it('debe autenticar exitosamente un cliente y retornar token', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          correo_electronico: 'cliente@example.com',
          contraseña: 'Cliente123!',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 1,
        nombre: 'Juan',
        apellido: 'Pérez',
        correo_electronico: 'cliente@example.com',
        contraseña: '$2b$10$hashedPassword',
        Rol: {
          descripcion: 'CLIENTE',
        },
        perfil_tecnico: null,
      };

      Usuario.findOne.mockResolvedValue(mockUsuario);
      bcrypt.default.compare.mockResolvedValue(true);
      jwt.default.sign.mockReturnValue('fake_jwt_token_12345');

      // Act
      await login(req, res);

      // Assert
      expect(Usuario.findOne).toHaveBeenCalledWith({
        where: { correo_electronico: 'cliente@example.com' },
        include: [
          { model: Rol, attributes: ['descripcion'] },
          {
            model: Tecnico,
            as: 'perfil_tecnico',
            attributes: ['estado_validacion'],
            required: false,
          },
        ],
      });

      expect(bcrypt.default.compare).toHaveBeenCalledWith(
        'Cliente123!',
        '$2b$10$hashedPassword'
      );

      expect(jwt.default.sign).toHaveBeenCalledWith(
        {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
        'test_secret',
        {
          expiresIn: '1h',
        }
      );

      expect(res.statusCode).toBeNull(); // No explicit status call for 200
      expect(res.json).toHaveBeenCalledWith({
        message: 'Autenticación exitosa',
        token: 'fake_jwt_token_12345',
        usuario: {
          nombre: 'Juan',
          rol: 'CLIENTE',
        },
      });

      // Verify estado_validacion is NOT included for cliente
      expect(res.jsonData.usuario.estado_validacion).toBeUndefined();
    });

    it('debe autenticar exitosamente un técnico e incluir estado_validacion', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          correo_electronico: 'tecnico@example.com',
          contraseña: 'Tecnico123!',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 2,
        nombre: 'Carlos',
        apellido: 'Ramírez',
        correo_electronico: 'tecnico@example.com',
        contraseña: '$2b$10$hashedPasswordTecnico',
        Rol: {
          descripcion: 'TECNICO',
        },
        perfil_tecnico: {
          estado_validacion: 'ACTIVO',
        },
      };

      Usuario.findOne.mockResolvedValue(mockUsuario);
      bcrypt.default.compare.mockResolvedValue(true);
      jwt.default.sign.mockReturnValue('fake_jwt_token_tecnico');

      // Act
      await login(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        message: 'Autenticación exitosa',
        token: 'fake_jwt_token_tecnico',
        usuario: {
          nombre: 'Carlos',
          rol: 'TECNICO',
          estado_validacion: 'ACTIVO',
        },
      });

      // Verify estado_validacion IS included for tecnico
      expect(res.jsonData.usuario.estado_validacion).toBe('ACTIVO');
    });

    it('debe retornar 401 cuando el usuario no existe', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          correo_electronico: 'noexiste@example.com',
          contraseña: 'Password123!',
        },
      });
      const res = createResMock();

      Usuario.findOne.mockResolvedValue(null);

      // Act
      await login(req, res);

      // Assert
      expect(Usuario.findOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Credenciales inválidas, usuario no encontrado',
      });

      // Verify bcrypt.compare was NOT called
      expect(bcrypt.default.compare).not.toHaveBeenCalled();
      expect(jwt.default.sign).not.toHaveBeenCalled();
    });

    it('debe retornar 401 cuando la contraseña es incorrecta', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          correo_electronico: 'cliente@example.com',
          contraseña: 'WrongPassword123!',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 1,
        nombre: 'Juan',
        correo_electronico: 'cliente@example.com',
        contraseña: '$2b$10$hashedPassword',
        Rol: {
          descripcion: 'CLIENTE',
        },
      };

      Usuario.findOne.mockResolvedValue(mockUsuario);
      bcrypt.default.compare.mockResolvedValue(false); // Password mismatch

      // Act
      await login(req, res);

      // Assert
      expect(bcrypt.default.compare).toHaveBeenCalledWith(
        'WrongPassword123!',
        '$2b$10$hashedPassword'
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Credenciales inválidas, contraseña incorrecta',
      });

      // Verify JWT was NOT generated
      expect(jwt.default.sign).not.toHaveBeenCalled();
    });

    it('debe retornar 500 cuando ocurre un error interno', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          correo_electronico: 'cliente@example.com',
          contraseña: 'Cliente123!',
        },
      });
      const res = createResMock();

      const dbError = new Error('Database connection failed');
      Usuario.findOne.mockRejectedValue(dbError);

      // Spy on console.error
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Act
      await login(req, res);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error durante el login:',
        dbError
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Error interno del servidor durante el login',
      });

      // Cleanup
      consoleErrorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // CAMBIAR CONTRASEÑA TESTS
  // -------------------------------------------------------------------------

  describe('cambiarContrasena', () => {
    it('debe cambiar la contraseña exitosamente', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'OldPassword123!',
          nueva_contrasena: 'NewPassword456@',
          confirmar_nueva_contrasena: 'NewPassword456@',
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 1,
        nombre: 'Juan',
        contraseña: '$2b$10$hashedOldPassword',
      };

      Usuario.findByPk.mockResolvedValue(mockUsuario);
      bcrypt.default.compare
        .mockResolvedValueOnce(true) // contrasena_actual es correcta
        .mockResolvedValueOnce(false); // nueva_contrasena es diferente a actual
      bcrypt.default.hash.mockResolvedValue('$2b$10$hashedNewPassword');
      Usuario.update.mockResolvedValue([1]);

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(Usuario.findByPk).toHaveBeenCalledWith(1);

      // First bcrypt.compare: verify current password
      expect(bcrypt.default.compare).toHaveBeenNthCalledWith(
        1,
        'OldPassword123!',
        '$2b$10$hashedOldPassword'
      );

      // Second bcrypt.compare: verify new password is different
      expect(bcrypt.default.compare).toHaveBeenNthCalledWith(
        2,
        'NewPassword456@',
        '$2b$10$hashedOldPassword'
      );

      expect(bcrypt.default.hash).toHaveBeenCalledWith('NewPassword456@', 10);

      expect(Usuario.update).toHaveBeenCalledWith(
        { contraseña: '$2b$10$hashedNewPassword' },
        { where: { id_usuario: 1 } }
      );

      expect(logger.default.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'cambiarContrasena: Contraseña actualizada para id_usuario 1'
        )
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Contraseña actualizada exitosamente',
      });
    });

    it('debe retornar 400 cuando faltan campos requeridos', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'OldPassword123!',
          // nueva_contrasena missing
          // confirmar_nueva_contrasena missing
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(handleError).toHaveBeenCalled();
      const errorArg = handleError.mock.calls[0][1];

      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.message).toBe('Error de validación');
      expect(errorArg.errors).toEqual([
        'El campo nueva_contrasena es requerido',
        'El campo confirmar_nueva_contrasena es requerido',
      ]);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.errors).toHaveLength(2);

      // Verify no database calls were made
      expect(Usuario.findByPk).not.toHaveBeenCalled();
    });

    it('debe retornar 400 cuando la nueva contraseña es débil', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'OldPassword123!',
          nueva_contrasena: 'weak', // Too short, no uppercase, no special char
          confirmar_nueva_contrasena: 'weak',
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(handleError).toHaveBeenCalled();
      const errorArg = handleError.mock.calls[0][1];

      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toEqual([
        'La nueva contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial',
      ]);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.success).toBe(false);

      // Verify no database calls were made
      expect(Usuario.findByPk).not.toHaveBeenCalled();
    });

    it('debe retornar 400 cuando la confirmación no coincide', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'OldPassword123!',
          nueva_contrasena: 'NewPassword456@',
          confirmar_nueva_contrasena: 'DifferentPassword789#',
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(handleError).toHaveBeenCalled();
      const errorArg = handleError.mock.calls[0][1];

      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toEqual([
        'La nueva contraseña y su confirmación no coinciden',
      ]);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.success).toBe(false);

      // Verify no database calls were made
      expect(Usuario.findByPk).not.toHaveBeenCalled();
    });

    it('debe retornar 401 cuando la contraseña actual es incorrecta', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'WrongOldPassword123!',
          nueva_contrasena: 'NewPassword456@',
          confirmar_nueva_contrasena: 'NewPassword456@',
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 1,
        nombre: 'Juan',
        contraseña: '$2b$10$hashedOldPassword',
      };

      Usuario.findByPk.mockResolvedValue(mockUsuario);
      bcrypt.default.compare.mockResolvedValue(false); // Current password mismatch

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(Usuario.findByPk).toHaveBeenCalledWith(1);
      expect(bcrypt.default.compare).toHaveBeenCalledWith(
        'WrongOldPassword123!',
        '$2b$10$hashedOldPassword'
      );

      expect(handleError).toHaveBeenCalled();
      const errorArg = handleError.mock.calls[0][1];

      expect(errorArg).toBeInstanceOf(UnauthorizedError);
      expect(errorArg.message).toBe('La contraseña actual es incorrecta');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);

      // Verify update was NOT called
      expect(Usuario.update).not.toHaveBeenCalled();
    });

    it('debe retornar 400 cuando la nueva contraseña es igual a la actual', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'SamePassword123!',
          nueva_contrasena: 'SamePassword123!',
          confirmar_nueva_contrasena: 'SamePassword123!',
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 1,
        nombre: 'Juan',
        contraseña: '$2b$10$hashedSamePassword',
      };

      Usuario.findByPk.mockResolvedValue(mockUsuario);
      bcrypt.default.compare
        .mockResolvedValueOnce(true) // contrasena_actual es correcta
        .mockResolvedValueOnce(true); // nueva_contrasena es igual a actual

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(Usuario.findByPk).toHaveBeenCalledWith(1);

      // First compare: verify current password
      expect(bcrypt.default.compare).toHaveBeenNthCalledWith(
        1,
        'SamePassword123!',
        '$2b$10$hashedSamePassword'
      );

      // Second compare: verify new is different (returns true = same)
      expect(bcrypt.default.compare).toHaveBeenNthCalledWith(
        2,
        'SamePassword123!',
        '$2b$10$hashedSamePassword'
      );

      expect(handleError).toHaveBeenCalled();
      const errorArg = handleError.mock.calls[0][1];

      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toEqual([
        'La nueva contraseña no puede ser igual a la contraseña actual',
      ]);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.success).toBe(false);

      // Verify update was NOT called
      expect(Usuario.update).not.toHaveBeenCalled();
    });

    it('debe retornar 401 cuando el usuario no existe (token inválido edge case)', async () => {
      // Arrange
      const req = createReqMock({
        body: {
          contrasena_actual: 'OldPassword123!',
          nueva_contrasena: 'NewPassword456@',
          confirmar_nueva_contrasena: 'NewPassword456@',
        },
        usuario: {
          id_usuario: 999, // Non-existent user
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      Usuario.findByPk.mockResolvedValue(null); // User not found

      // Act
      await cambiarContrasena(req, res);

      // Assert
      expect(Usuario.findByPk).toHaveBeenCalledWith(999);

      expect(handleError).toHaveBeenCalled();
      const errorArg = handleError.mock.calls[0][1];

      expect(errorArg).toBeInstanceOf(UnauthorizedError);
      expect(errorArg.message).toBe(
        'Usuario no encontrado. El token puede ser inválido'
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);

      // Verify bcrypt and update were NOT called
      expect(bcrypt.default.compare).not.toHaveBeenCalled();
      expect(Usuario.update).not.toHaveBeenCalled();
    });

    it('debe soportar nombres de campos con ñ (variante alternativa)', async () => {
      // Arrange - using ñ variants in field names
      const req = createReqMock({
        body: {
          contraseña_actual: 'OldPassword123!',
          'nueva_contraseña': 'NewPassword456@',
          'confirmar_nueva_contraseña': 'NewPassword456@',
        },
        usuario: {
          id_usuario: 1,
          rol: 'CLIENTE',
        },
      });
      const res = createResMock();

      const mockUsuario = {
        id_usuario: 1,
        nombre: 'Juan',
        contraseña: '$2b$10$hashedOldPassword',
      };

      Usuario.findByPk.mockResolvedValue(mockUsuario);
      bcrypt.default.compare
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      bcrypt.default.hash.mockResolvedValue('$2b$10$hashedNewPassword');
      Usuario.update.mockResolvedValue([1]);

      // Act
      await cambiarContrasena(req, res);

      // Assert - should work exactly the same
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Contraseña actualizada exitosamente',
      });
    });
  });
});
