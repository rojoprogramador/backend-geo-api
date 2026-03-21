import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks (NOT using createAllModelMocks — must be sync) ---
const mockModels = {
  sequelize: {
    transaction: jest.fn(),
  },
  Usuario: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn()
  },
  Cliente: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Tecnico: {
    findOne: jest.fn(),
    create: jest.fn()
  },
  Rol: {
    findOne: jest.fn()
  },
  TipoDoc: {
    findByPk: jest.fn()
  },
  Ciudad: {
    findByPk: jest.fn()
  },
};

const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn(),
  finished: undefined,
};

const mockHandleError = jest.fn((res, error) => {
  const sc = error.statusCode || 500;
  return res.status(sc).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
  });
});

const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({
  handleError: mockHandleError,
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: mockLogger,
}));
jest.unstable_mockModule('bcrypt', () => ({
  default: mockBcrypt,
}));

// Import real error classes (not mocked)
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } =
  await import('../../../utils/errors/AppError.js');

const { registrarCliente, obtenerPerfilCliente, actualizarPerfilCliente } =
  await import('../../../controllers/clienteController.js');

describe('clienteController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // ============================================================================
  // registrarCliente
  // ============================================================================
  describe('registrarCliente', () => {
    const validData = {
      nombre: 'María Alejandra',
      apellido: 'González Ospina',
      correo_electronico: 'maria.gonzalez@example.com',
      telefono: '3101234567',
      contraseña: 'MiClave123!',
      confirmar_contraseña: 'MiClave123!',
      num_identificacion: '1098765432',
      id_tipoDoc: 1,
      fecha_nacimiento: '1995-03-20',
      acepta_terminos: true,
    };

    it('1. Success case → 201, creates Usuario + Cliente in transaction', async () => {
      req.body = { ...validData };

      mockModels.Usuario.findOne.mockResolvedValue(null); // No duplicates
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1, descripcion: 'CC' });
      mockModels.Rol.findOne.mockResolvedValue({ id_rol: 2, descripcion: 'CLIENTE' });
      mockBcrypt.hash.mockResolvedValue('hashedPassword123');
      mockModels.Usuario.create.mockResolvedValue({
        id_usuario: 12,
        nombre: 'María Alejandra',
        apellido: 'González Ospina',
        correo_electronico: 'maria.gonzalez@example.com',
        telefono: '3101234567',
      });
      mockModels.Cliente.create.mockResolvedValue({
        id_cliente: 8,
        id_usuario: 12,
      });

      await registrarCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.message).toContain('¡Bienvenido a Geo-API!');
      expect(res.jsonData.data.id_usuario).toBe(12);
      expect(res.jsonData.data.id_cliente).toBe(8);
      expect(res.jsonData.data.rol).toBe('CLIENTE');
      expect(mockBcrypt.hash).toHaveBeenCalledWith('MiClave123!', 10);
    });

    it('2. Missing required fields → 400 ValidationError with list', async () => {
      req.body = {
        nombre: 'María Alejandra',
        // Missing apellido, correo_electronico, telefono, contraseña, etc.
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockHandleError).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El campo apellido es requerido');
      expect(errorArg.errors).toContain('El campo correo_electronico es requerido');
      expect(errorArg.errors).toContain('El campo telefono es requerido');
      expect(errorArg.errors).toContain('El campo contraseña es requerido');
    });

    it('3. Invalid name format → 400', async () => {
      req.body = {
        ...validData,
        nombre: 'Mar', // Less than 5 characters
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El nombre solo puede contener letras y espacios, entre 5 y 100 caracteres');
    });

    it('4. Invalid email format → 400', async () => {
      req.body = {
        ...validData,
        correo_electronico: 'invalid-email',
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El correo electrónico no tiene un formato válido');
    });

    it('5. Invalid phone (not starting with 3, not 10 digits) → 400', async () => {
      req.body = {
        ...validData,
        telefono: '2001234567', // Does not start with 3
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El teléfono debe tener exactamente 10 dígitos y comenzar con 3 (ej: 3001234567)');
    });

    it('6. Invalid document number → 400', async () => {
      req.body = {
        ...validData,
        num_identificacion: '12345', // Less than 6 digits
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El número de identificación debe contener entre 6 y 12 dígitos');
    });

    it('7. Weak password → 400', async () => {
      req.body = {
        ...validData,
        contraseña: 'weak',
        confirmar_contraseña: 'weak',
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('La contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial');
    });

    it('8. Passwords don\'t match → 400', async () => {
      req.body = {
        ...validData,
        contraseña: 'MiClave123!',
        confirmar_contraseña: 'DifferentPassword123!',
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('La contraseña y su confirmación no coinciden');
    });

    it('9. Terms not accepted → 400', async () => {
      req.body = {
        ...validData,
        acepta_terminos: false,
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('Debe aceptar los términos y condiciones para registrarse');
    });

    it('10. Duplicate email → 409 ConflictError', async () => {
      req.body = { ...validData };

      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Usuario.findOne.mockResolvedValueOnce({
        id_usuario: 5,
        correo_electronico: 'maria.gonzalez@example.com',
      });

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ConflictError);
      expect(errorArg.message).toBe('El correo electrónico ya está registrado en el sistema');
    });

    it('11. Duplicate document → 409 ConflictError', async () => {
      req.body = { ...validData };

      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      // First call (email check) returns null, second call (document check) returns existing user
      mockModels.Usuario.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id_usuario: 6,
          num_identificacion: '1098765432',
        });

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ConflictError);
      expect(errorArg.message).toBe('El número de identificación ya está registrado en el sistema');
    });

    it('12. Invalid id_ciudad → 400', async () => {
      req.body = {
        ...validData,
        id_ciudad: -1, // Invalid
      };

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El campo id_ciudad debe ser un entero positivo');
    });

    it('13. City not found → 400', async () => {
      req.body = {
        ...validData,
        id_ciudad: 999,
      };

      mockModels.Ciudad.findByPk.mockResolvedValue(null);

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('La ciudad con id 999 no existe');
    });

    it('14. TipoDoc not found → 400', async () => {
      req.body = { ...validData };

      mockModels.TipoDoc.findByPk.mockResolvedValue(null);

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El tipo de documento con id 1 no existe');
    });

    it('15. Rol CLIENTE not found → 500', async () => {
      req.body = { ...validData };

      mockModels.Usuario.findOne.mockResolvedValue(null); // No duplicates
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Rol.findOne.mockResolvedValue(null); // Rol not found

      await registrarCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'registrarCliente: El rol "CLIENTE" no existe en la tabla Rol'
      );
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg.message).toBe('Configuración de roles incorrecta en el servidor');
    });

    it('16. Success with id_ciudad → creates Usuario with ciudad', async () => {
      req.body = {
        ...validData,
        id_ciudad: 1,
      };

      mockModels.Ciudad.findByPk.mockResolvedValue({ id_ciudad: 1, nombre_ciudad: 'Cali' });
      mockModels.Usuario.findOne.mockResolvedValue(null);
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Rol.findOne.mockResolvedValue({ id_rol: 2, descripcion: 'CLIENTE' });
      mockBcrypt.hash.mockResolvedValue('hashedPassword123');
      mockModels.Usuario.create.mockResolvedValue({
        id_usuario: 13,
        nombre: 'María Alejandra',
        apellido: 'González Ospina',
        correo_electronico: 'maria.gonzalez@example.com',
        telefono: '3101234567',
        id_ciudad: 1,
      });
      mockModels.Cliente.create.mockResolvedValue({
        id_cliente: 9,
        id_usuario: 13,
      });

      await registrarCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.success).toBe(true);
      expect(mockModels.Usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id_ciudad: 1,
        }),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // obtenerPerfilCliente
  // ============================================================================
  describe('obtenerPerfilCliente', () => {
    it('1. Success → 200', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };

      const mockCliente = {
        id_cliente: 8,
        datos_usuario: {
          id_usuario: 12,
          nombre: 'María Alejandra',
          apellido: 'González Ospina',
          correo_electronico: 'maria.gonzalez@example.com',
          telefono: '3101234567',
          num_identificacion: '1098765432',
          fecha_nacimiento: '1995-03-20',
          id_ciudad: 1,
          TipoDoc: {
            descripcion: 'CC',
          },
          Ciudad: {
            id_ciudad: 1,
            nombre_ciudad: 'Cali',
          },
        },
      };

      mockModels.Cliente.findOne.mockResolvedValue(mockCliente);

      await obtenerPerfilCliente(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.message).toBe('Perfil obtenido exitosamente');
      expect(res.jsonData.data.id_cliente).toBe(8);
      expect(res.jsonData.data.nombre).toBe('María Alejandra');
      expect(res.jsonData.data.tipo_documento).toBe('CC');
      expect(res.jsonData.data.id_ciudad).toBe(1);
      expect(res.jsonData.data.ciudad).toBe('Cali');
    });

    it('1b. Success without ciudad → null values', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };

      const mockCliente = {
        id_cliente: 8,
        datos_usuario: {
          id_usuario: 12,
          nombre: 'Test',
          apellido: 'User',
          correo_electronico: 'test@example.com',
          telefono: '3101234567',
          num_identificacion: '1098765432',
          fecha_nacimiento: '1995-03-20',
          id_ciudad: null,
          TipoDoc: null,
          Ciudad: null,
        },
      };

      mockModels.Cliente.findOne.mockResolvedValue(mockCliente);

      await obtenerPerfilCliente(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.id_ciudad).toBeNull();
      expect(res.jsonData.data.ciudad).toBeNull();
    });

    it('2. Not CLIENTE role → 403 ForbiddenError', async () => {
      req.usuario = { id_usuario: 12, rol: 'TÉCNICO' };

      await obtenerPerfilCliente(req, res);

      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ForbiddenError);
      expect(errorArg.message).toBe('Esta ruta es exclusiva para clientes');
    });

    it('3. Profile not found → 404', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };

      mockModels.Cliente.findOne.mockResolvedValue(null);

      await obtenerPerfilCliente(req, res);

      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(NotFoundError);
      expect(errorArg.message).toBe('No se encontró el perfil de cliente asociado a este usuario');
    });
  });

  // ============================================================================
  // actualizarPerfilCliente
  // ============================================================================
  describe('actualizarPerfilCliente', () => {
    it('1. Success updating phone → 200', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { telefono: '3209876543' };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 12,
        correo_electronico: 'maria.gonzalez@example.com',
        telefono: '3209876543',
      });

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.message).toBe('Perfil actualizado exitosamente');
      expect(res.jsonData.data.telefono).toBe('3209876543');
      expect(mockModels.Usuario.update).toHaveBeenCalledWith(
        { telefono: '3209876543' },
        expect.objectContaining({
          where: { id_usuario: 12 },
        })
      );
    });

    it('2. Success updating email → 200', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { correo_electronico: 'nueva.direccion@example.com' };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Usuario.findOne.mockResolvedValue(null); // No duplicate
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 12,
        correo_electronico: 'nueva.direccion@example.com',
        telefono: '3101234567',
      });

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.correo_electronico).toBe('nueva.direccion@example.com');
    });

    it('3. No editable fields sent → 400', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = {}; // Empty

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('Debe enviar al menos un campo para actualizar: telefono, correo_electronico o id_ciudad');
    });

    it('4. Invalid phone format → 400', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { telefono: '1234567890' }; // Does not start with 3

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El teléfono debe tener exactamente 10 dígitos y comenzar con 3 (ej: 3001234567)');
    });

    it('5. Duplicate email → 409', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { correo_electronico: 'otro.usuario@example.com' };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Usuario.findOne.mockResolvedValue({
        id_usuario: 99, // Different user
        correo_electronico: 'otro.usuario@example.com',
      });

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ConflictError);
      expect(errorArg.message).toBe('El correo electrónico ya está registrado en el sistema');
    });

    it('6. Not CLIENTE role → 403', async () => {
      req.usuario = { id_usuario: 12, rol: 'TÉCNICO' };
      req.body = { telefono: '3209876543' };

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ForbiddenError);
      expect(errorArg.message).toBe('Esta ruta es exclusiva para clientes');
    });

    it('7. Profile not found → 404', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { telefono: '3209876543' };

      mockModels.Cliente.findOne.mockResolvedValue(null);

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(NotFoundError);
      expect(errorArg.message).toBe('No se encontró el perfil de cliente asociado a este usuario');
    });

    it('8. Success updating both phone and email → 200', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = {
        telefono: '3001112233',
        correo_electronico: 'maria.nueva@example.com',
      };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Usuario.findOne.mockResolvedValue(null); // No duplicate
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 12,
        correo_electronico: 'maria.nueva@example.com',
        telefono: '3001112233',
      });

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.telefono).toBe('3001112233');
      expect(res.jsonData.data.correo_electronico).toBe('maria.nueva@example.com');
      expect(mockModels.Usuario.update).toHaveBeenCalledWith(
        {
          telefono: '3001112233',
          correo_electronico: 'maria.nueva@example.com',
        },
        expect.objectContaining({
          where: { id_usuario: 12 },
        })
      );
    });

    it('9. Email belongs to same user → allows update', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { correo_electronico: 'mismo.correo@example.com' };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Usuario.findOne.mockResolvedValue({
        id_usuario: 12, // Same user
        correo_electronico: 'mismo.correo@example.com',
      });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 12,
        correo_electronico: 'mismo.correo@example.com',
        telefono: '3101234567',
      });

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('10. Update id_ciudad success → 200', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { id_ciudad: 2 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Ciudad.findByPk.mockResolvedValue({ id_ciudad: 2, nombre_ciudad: 'Bogotá' });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 12,
        correo_electronico: 'maria@example.com',
        telefono: '3101234567',
        id_ciudad: 2,
        Ciudad: { id_ciudad: 2, nombre_ciudad: 'Bogotá' },
      });

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.id_ciudad).toBe(2);
      expect(res.jsonData.data.ciudad).toBe('Bogotá');
      expect(mockModels.Usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ id_ciudad: 2 }),
        expect.objectContaining({ where: { id_usuario: 12 } })
      );
    });

    it('11. Invalid id_ciudad format → 400', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { id_ciudad: -1 };

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El id_ciudad debe ser un entero positivo');
    });

    it('12. Ciudad not found → 404', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { id_ciudad: 999 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 8, id_usuario: 12 });
      mockModels.Ciudad.findByPk.mockResolvedValue(null);

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(NotFoundError);
      expect(errorArg.message).toBe('No se encontró la ciudad con id 999');
    });

    it('13. Invalid email format → 400', async () => {
      req.usuario = { id_usuario: 12, rol: 'CLIENTE' };
      req.body = { correo_electronico: 'invalid-email' };

      await actualizarPerfilCliente(req, res);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      const errorArg = mockHandleError.mock.calls[0][1];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.errors).toContain('El correo electrónico no tiene un formato válido');
    });
  });
});
