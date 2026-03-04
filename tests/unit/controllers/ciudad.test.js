import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock, createAllModelMocks, resetAllMocks } from '../../mocks/models.js';

// ----------------------------------------------------------------
// Mock de módulos con jest.unstable_mockModule (ANTES del import)
// ----------------------------------------------------------------
let mockModels;

jest.unstable_mockModule('../../../models/index.js', () => {
  mockModels = createAllModelMocks();
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

// ----------------------------------------------------------------
// Importar después de mockear
// ----------------------------------------------------------------
const { obtenerCiudades } = await import('../../../controllers/ciudadController.js');
const { ValidationError } = await import('../../../utils/errors/AppError.js');

describe('Controller: ciudadController - obtenerCiudades', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
  });

  it('debe retornar todas las ciudades activas sin filtro', async () => {
    // Arrange
    req.query = {};
    const mockCiudades = [
      {
        id_ciudad: 1,
        nombre_ciudad: 'Cali',
        id_pais: 1,
        Pais: { nombre_pais: 'Colombia' },
      },
      {
        id_ciudad: 2,
        nombre_ciudad: 'Medellín',
        id_pais: 1,
        Pais: { nombre_pais: 'Colombia' },
      },
      {
        id_ciudad: 3,
        nombre_ciudad: 'Bogotá',
        id_pais: 1,
        Pais: { nombre_pais: 'Colombia' },
      },
    ];

    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades);

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(mockModels.Ciudad.findAll).toHaveBeenCalledWith({
      where: { activo: true },
      include: [
        {
          model: mockModels.Pais,
          as: 'Pais',
          attributes: ['nombre_pais'],
        },
      ],
      attributes: ['id_ciudad', 'nombre_ciudad', 'id_pais'],
      order: [['nombre_ciudad', 'ASC']],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Ciudades obtenidas exitosamente',
      total: 3,
      data: [
        {
          id_ciudad: 1,
          nombre_ciudad: 'Cali',
          id_pais: 1,
          nombre_pais: 'Colombia',
        },
        {
          id_ciudad: 2,
          nombre_ciudad: 'Medellín',
          id_pais: 1,
          nombre_pais: 'Colombia',
        },
        {
          id_ciudad: 3,
          nombre_ciudad: 'Bogotá',
          id_pais: 1,
          nombre_pais: 'Colombia',
        },
      ],
    });
  });

  it('debe filtrar por id_pais válido', async () => {
    // Arrange
    req.query = { id_pais: '1' };
    const mockCiudades = [
      {
        id_ciudad: 1,
        nombre_ciudad: 'Cali',
        id_pais: 1,
        Pais: { nombre_pais: 'Colombia' },
      },
    ];

    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades);

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(mockModels.Ciudad.findAll).toHaveBeenCalledWith({
      where: { activo: true, id_pais: 1 },
      include: [
        {
          model: mockModels.Pais,
          as: 'Pais',
          attributes: ['nombre_pais'],
        },
      ],
      attributes: ['id_ciudad', 'nombre_ciudad', 'id_pais'],
      order: [['nombre_ciudad', 'ASC']],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.total).toBe(1);
  });

  it('debe retornar 400 si id_pais no es numérico', async () => {
    // Arrange
    req.query = { id_pais: 'abc' };

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toBe('El parámetro id_pais debe ser un entero positivo');
  });

  it('debe retornar 400 si id_pais es negativo', async () => {
    // Arrange
    req.query = { id_pais: '-1' };

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toBe('El parámetro id_pais debe ser un entero positivo');
  });

  it('debe retornar 400 si id_pais es cero', async () => {
    // Arrange
    req.query = { id_pais: '0' };

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toBe('El parámetro id_pais debe ser un entero positivo');
  });

  it('debe retornar lista vacía si no hay ciudades activas', async () => {
    // Arrange
    req.query = {};
    mockModels.Ciudad.findAll.mockResolvedValue([]);

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Ciudades obtenidas exitosamente',
      total: 0,
      data: [],
    });
  });

  it('debe manejar ciudades sin país asociado (nombre_pais null)', async () => {
    // Arrange
    req.query = {};
    const mockCiudades = [
      {
        id_ciudad: 1,
        nombre_ciudad: 'Cali',
        id_pais: 1,
        Pais: null, // Sin país asociado
      },
    ];

    mockModels.Ciudad.findAll.mockResolvedValue(mockCiudades);

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data[0].nombre_pais).toBeNull();
  });

  it('debe llamar handleError si Ciudad.findAll lanza error', async () => {
    // Arrange
    req.query = {};
    const dbError = new Error('Database connection failed');
    mockModels.Ciudad.findAll.mockRejectedValue(dbError);

    // Act
    await obtenerCiudades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith(res, dbError);
  });
});
