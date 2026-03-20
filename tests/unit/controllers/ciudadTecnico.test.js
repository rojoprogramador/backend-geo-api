import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  createReqMock,
  createResMock,
  createAllModelMocks,
  createInstanceMock,
  createTransactionMock,
  resetAllMocks,
} from '../../mocks/models.js';

// ----------------------------------------------------------------
// Mock de módulos con jest.unstable_mockModule (ANTES del import)
// ----------------------------------------------------------------
let mockModels;
let mockTransaction;

jest.unstable_mockModule('../../../models/index.js', () => {
  mockModels = createAllModelMocks();
  mockTransaction = mockModels._transaction;
  return mockModels;
});

const mockHandleError = jest.fn((res, error) => {
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
  });
});

jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({
  handleError: mockHandleError,
}));

jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockObtenerTecnico = jest.fn();

jest.unstable_mockModule('../../../utils/profileHelpers.js', () => ({
  obtenerTecnico: mockObtenerTecnico,
}));

// ----------------------------------------------------------------
// Importar después de mockear
// ----------------------------------------------------------------
const {
  agregarCiudadOperacion,
  obtenerMisCiudades,
  eliminarCiudadOperacion,
} = await import('../../../controllers/ciudadTecnicoController.js');

const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = await import(
  '../../../utils/errors/AppError.js'
);

describe('Controller: ciudadTecnicoController - agregarCiudadOperacion', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockObtenerTecnico.mockClear();
    mockTransaction.finished = undefined;
  });

  it('debe agregar ciudades exitosamente', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 5] };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
      reload: jest.fn().mockResolvedValue(undefined),
    });

    const mockCiudades = [
      { id_ciudad: 3, nombre_ciudad: 'Palmira', activo: true },
      { id_ciudad: 5, nombre_ciudad: 'Jamundí', activo: true },
    ];

    const mockNuevasCiudades = [
      { id_ciudad_tecnico: 1, id_tecnico: 10, id_ciudad: 3 },
      { id_ciudad_tecnico: 2, id_tecnico: 10, id_ciudad: 5 },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades);
    mockModels.CiudadTecnico.findAll.mockResolvedValue([]); // No existentes
    mockModels.CiudadTecnico.bulkCreate.mockResolvedValue(mockNuevasCiudades);

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockObtenerTecnico).toHaveBeenCalledWith(1, mockTransaction);
    expect(mockModels.Ciudad.findAll).toHaveBeenCalledWith({
      where: { id_ciudad: [3, 5], activo: true },
      transaction: mockTransaction,
    });
    expect(mockModels.CiudadTecnico.findAll).toHaveBeenCalledWith({
      where: { id_tecnico: 10, id_ciudad: [3, 5] },
      transaction: mockTransaction,
    });
    expect(mockModels.CiudadTecnico.bulkCreate).toHaveBeenCalledWith(
      [
        { id_tecnico: 10, id_ciudad: 3 },
        { id_tecnico: 10, id_ciudad: 5 },
      ],
      { transaction: mockTransaction }
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData).toEqual({
      success: true,
      message: '2 ciudades de operación agregadas exitosamente',
      data: [
        { id_ciudad_tecnico: 1, id_ciudad: 3, nombre_ciudad: 'Palmira' },
        { id_ciudad_tecnico: 2, id_ciudad: 5, nombre_ciudad: 'Jamundí' },
      ],
    });
  });

  it('debe agregar una sola ciudad exitosamente (singular en mensaje)', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3] };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
    });

    const mockCiudades = [{ id_ciudad: 3, nombre_ciudad: 'Palmira', activo: true }];
    const mockNuevasCiudades = [{ id_ciudad_tecnico: 1, id_tecnico: 10, id_ciudad: 3 }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades);
    mockModels.CiudadTecnico.findAll.mockResolvedValue([]);
    mockModels.CiudadTecnico.bulkCreate.mockResolvedValue(mockNuevasCiudades);

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData.message).toBe('1 ciudad de operación agregada exitosamente');
  });

  it('debe rechazar si no es TECNICO', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'CLIENTE' };
    req.body = { ciudades: [3] };

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ForbiddenError);
    expect(errorArg.message).toContain('exclusiva para técnicos');
  });

  it('debe rechazar si ciudades no es array', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: 'not-an-array' };

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('Debe enviar un array "ciudades"');
  });

  it('debe rechazar si ciudades es array vacío', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [] };

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('al menos un id_ciudad');
  });

  it('debe rechazar si array contiene IDs inválidos (no enteros)', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 'abc', 5] };

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('enteros positivos');
  });

  it('debe rechazar si array contiene IDs negativos o cero', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 0, -1] };

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('enteros positivos');
  });

  it('debe rechazar si array tiene duplicados', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 5, 3] };

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('IDs duplicados');
  });

  it('debe rechazar si es la ciudad base', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [1, 3] };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain('ciudad base');
  });

  it('debe rechazar si ciudad no existe', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 999] };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
    });

    const mockCiudades = [{ id_ciudad: 3, nombre_ciudad: 'Palmira', activo: true }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades); // Solo retorna 1 de 2

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('no existen o están inactivas');
    expect(errorArg.message).toContain('999');
  });

  it('debe rechazar si ciudad está inactiva', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 5] };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
    });

    const mockCiudades = [{ id_ciudad: 3, nombre_ciudad: 'Palmira', activo: true }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades); // Solo 1 activa de 2

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('5');
  });

  it('debe rechazar si ciudad ya registrada', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3, 5] };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
    });

    const mockCiudades = [
      { id_ciudad: 3, nombre_ciudad: 'Palmira', activo: true },
      { id_ciudad: 5, nombre_ciudad: 'Jamundí', activo: true },
    ];

    const mockExistentes = [
      { id_ciudad_tecnico: 1, id_tecnico: 10, id_ciudad: 3 },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades);
    mockModels.CiudadTecnico.findAll.mockResolvedValue(mockExistentes);

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain('ya están registradas');
    expect(errorArg.message).toContain('3');
  });

  it('debe manejar error de base de datos', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.body = { ciudades: [3] };

    const dbError = new Error('Database connection failed');
    mockObtenerTecnico.mockRejectedValue(dbError);

    // Act
    await agregarCiudadOperacion(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith(res, dbError);
  });
});

describe('Controller: ciudadTecnicoController - obtenerMisCiudades', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockObtenerTecnico.mockClear();
  });

  it('debe retornar ciudad base y ciudades adicionales', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };

    const mockCiudadBase = { id_ciudad: 1, nombre_ciudad: 'Cali' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
      Ciudad: mockCiudadBase,
    });
    mockTecnico.reload = jest.fn().mockResolvedValue({
      ...mockTecnico,
      Ciudad: mockCiudadBase,
    });

    const mockCiudadesAdicionales = [
      {
        id_ciudad_tecnico: 1,
        id_tecnico: 10,
        id_ciudad: 3,
        createdAt: new Date('2024-01-01'),
        Ciudad: { id_ciudad: 3, nombre_ciudad: 'Palmira' },
      },
      {
        id_ciudad_tecnico: 2,
        id_tecnico: 10,
        id_ciudad: 5,
        createdAt: new Date('2024-01-02'),
        Ciudad: { id_ciudad: 5, nombre_ciudad: 'Jamundí' },
      },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findAll.mockResolvedValue(mockCiudadesAdicionales);

    // Act
    await obtenerMisCiudades(req, res);

    // Assert
    expect(mockObtenerTecnico).toHaveBeenCalledWith(1);
    expect(mockTecnico.reload).toHaveBeenCalledWith({
      include: [
        {
          model: mockModels.Ciudad,
          attributes: ['id_ciudad', 'nombre_ciudad'],
        },
      ],
    });
    expect(mockModels.CiudadTecnico.findAll).toHaveBeenCalledWith({
      where: { id_tecnico: 10 },
      include: [
        {
          model: mockModels.Ciudad,
          attributes: ['id_ciudad', 'nombre_ciudad'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Ciudades de operación obtenidas exitosamente',
      data: {
        ciudad_base: {
          id_ciudad: 1,
          nombre_ciudad: 'Cali',
        },
        ciudades_adicionales: [
          { id_ciudad_tecnico: 1, id_ciudad: 3, nombre_ciudad: 'Palmira' },
          { id_ciudad_tecnico: 2, id_ciudad: 5, nombre_ciudad: 'Jamundí' },
        ],
      },
    });
  });

  it('debe retornar ciudad base null si no existe', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: null,
      Ciudad: null,
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findAll.mockResolvedValue([]);

    // Act
    await obtenerMisCiudades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data.ciudad_base).toBeNull();
  });

  it('debe retornar array vacío si no hay ciudades adicionales', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
      Ciudad: { id_ciudad: 1, nombre_ciudad: 'Cali' },
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findAll.mockResolvedValue([]);

    // Act
    await obtenerMisCiudades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data.ciudades_adicionales).toEqual([]);
  });

  it('debe rechazar si no es TECNICO', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'CLIENTE' };

    // Act
    await obtenerMisCiudades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ForbiddenError);
    expect(errorArg.message).toContain('exclusiva para técnicos');
  });

  it('debe manejar ciudades adicionales con Ciudad null', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
      ciudad_base: 1,
      Ciudad: { id_ciudad: 1, nombre_ciudad: 'Cali' },
    });

    const mockCiudadesAdicionales = [
      {
        id_ciudad_tecnico: 1,
        id_tecnico: 10,
        id_ciudad: 3,
        createdAt: new Date('2024-01-01'),
        Ciudad: null, // Ciudad eliminada o inactiva
      },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findAll.mockResolvedValue(mockCiudadesAdicionales);

    // Act
    await obtenerMisCiudades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data.ciudades_adicionales).toEqual([
      { id_ciudad_tecnico: 1, id_ciudad: null, nombre_ciudad: null },
    ]);
  });

  it('debe manejar error de base de datos', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };

    const dbError = new Error('Database error');
    mockObtenerTecnico.mockRejectedValue(dbError);

    // Act
    await obtenerMisCiudades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith(res, dbError);
  });
});

describe('Controller: ciudadTecnicoController - eliminarCiudadOperacion', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockObtenerTecnico.mockClear();
  });

  it('debe eliminar ciudad exitosamente', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.params = { id: '5' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
    });

    const mockCiudadTecnico = createInstanceMock({
      id_ciudad_tecnico: 5,
      id_tecnico: 10,
      id_ciudad: 3,
      Ciudad: { nombre_ciudad: 'Palmira' },
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findOne.mockResolvedValue(mockCiudadTecnico);

    // Act
    await eliminarCiudadOperacion(req, res);

    // Assert
    expect(mockObtenerTecnico).toHaveBeenCalledWith(1);
    expect(mockModels.CiudadTecnico.findOne).toHaveBeenCalledWith({
      where: {
        id_ciudad_tecnico: '5',
        id_tecnico: 10,
      },
      include: [{ model: mockModels.Ciudad, attributes: ['nombre_ciudad'] }],
    });
    expect(mockCiudadTecnico.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Ciudad de operación eliminada exitosamente',
    });
  });

  it('debe rechazar si no es TECNICO', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'CLIENTE' };
    req.params = { id: '5' };

    // Act
    await eliminarCiudadOperacion(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ForbiddenError);
    expect(errorArg.message).toContain('exclusiva para técnicos');
  });

  it('debe retornar 404 si ciudad no encontrada', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.params = { id: '999' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findOne.mockResolvedValue(null);

    // Act
    await eliminarCiudadOperacion(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('no encontrada o no te pertenece');
  });

  it('debe manejar ciudad sin nombre (Ciudad null)', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.params = { id: '5' };

    const mockTecnico = createInstanceMock({
      id_tecnico: 10,
    });

    const mockCiudadTecnico = createInstanceMock({
      id_ciudad_tecnico: 5,
      id_tecnico: 10,
      id_ciudad: 3,
      Ciudad: null, // Ciudad eliminada
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.CiudadTecnico.findOne.mockResolvedValue(mockCiudadTecnico);

    // Act
    await eliminarCiudadOperacion(req, res);

    // Assert
    expect(mockCiudadTecnico.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('debe manejar error de base de datos', async () => {
    // Arrange
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };
    req.params = { id: '5' };

    const dbError = new Error('Database error');
    mockObtenerTecnico.mockRejectedValue(dbError);

    // Act
    await eliminarCiudadOperacion(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith(res, dbError);
  });
});
