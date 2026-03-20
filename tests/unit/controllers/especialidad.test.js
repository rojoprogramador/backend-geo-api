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
  agregarEspecialidad,
  obtenerMisEspecialidades,
  eliminarEspecialidad,
} = await import('../../../controllers/especialidadController.js');

const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = await import(
  '../../../utils/errors/AppError.js'
);

describe('Controller: especialidadController - agregarEspecialidad', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockObtenerTecnico.mockClear();
  });

  it('debe agregar especialidad exitosamente con todos los campos', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      id_subcategoria: 5,
      experiencia: '5 años de experiencia',
      precio_estimado: 50000,
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoria = {
      id_subcategoria: 5,
      nombre: 'Reparación de fugas',
      activo: true,
      Categoria: {
        nombre: 'Plomería',
      },
    };
    const mockNuevaEspecialidad = {
      id_especialidad: 1,
      id_tecnico: 20,
      id_subcategoria: 5,
      experiencia: '5 años de experiencia',
      precio_estimado: 50000,
    };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findOne.mockResolvedValue(mockSubcategoria);
    mockModels.Especialidad.findOne.mockResolvedValue(null); // No existe
    mockModels.Especialidad.create.mockResolvedValue(mockNuevaEspecialidad);

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockObtenerTecnico).toHaveBeenCalledWith(10);
    expect(mockModels.Subcategoria.findOne).toHaveBeenCalledWith({
      where: { id_subcategoria: 5, activo: true },
      include: [{ model: mockModels.Categoria, attributes: ['nombre'] }],
    });
    expect(mockModels.Especialidad.findOne).toHaveBeenCalledWith({
      where: {
        id_tecnico: 20,
        id_subcategoria: 5,
      },
    });
    expect(mockModels.Especialidad.create).toHaveBeenCalledWith({
      id_tecnico: 20,
      id_subcategoria: 5,
      experiencia: '5 años de experiencia',
      precio_estimado: 50000,
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Especialidad agregada exitosamente',
      data: {
        id_especialidad: 1,
        subcategoria: 'Reparación de fugas',
        categoria: 'Plomería',
        experiencia: '5 años de experiencia',
        precio_estimado: 50000,
      },
    });
  });

  it('debe agregar especialidad sin experiencia ni precio_estimado (campos opcionales)', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      id_subcategoria: 5,
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoria = {
      id_subcategoria: 5,
      nombre: 'Instalación de grifos',
      activo: true,
      Categoria: {
        nombre: 'Plomería',
      },
    };
    const mockNuevaEspecialidad = {
      id_especialidad: 2,
      id_tecnico: 20,
      id_subcategoria: 5,
      experiencia: null,
      precio_estimado: null,
    };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findOne.mockResolvedValue(mockSubcategoria);
    mockModels.Especialidad.findOne.mockResolvedValue(null);
    mockModels.Especialidad.create.mockResolvedValue(mockNuevaEspecialidad);

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockModels.Especialidad.create).toHaveBeenCalledWith({
      id_tecnico: 20,
      id_subcategoria: 5,
      experiencia: null,
      precio_estimado: null,
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData.data.experiencia).toBeNull();
    expect(res.jsonData.data.precio_estimado).toBeNull();
  });

  it('debe retornar 403 si el usuario no es TECNICO', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'CLIENTE' };
    req.body = {
      id_subcategoria: 5,
    };

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ForbiddenError);
    expect(errorArg.message).toContain('Esta ruta es exclusiva para técnicos');
    expect(mockObtenerTecnico).not.toHaveBeenCalled();
  });

  it('debe retornar 400 si id_subcategoria no se proporciona', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      experiencia: '5 años',
    };

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('El campo id_subcategoria es requerido');
  });

  it('debe retornar 404 si la subcategoría no existe', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      id_subcategoria: 999,
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findOne.mockResolvedValue(null);

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('La subcategoría no existe o está inactiva');
  });

  it('debe retornar 404 si la subcategoría está inactiva', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      id_subcategoria: 5,
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findOne.mockResolvedValue(null); // Query filters by activo: true

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('La subcategoría no existe o está inactiva');
  });

  it('debe retornar 409 si el técnico ya tiene esta especialidad registrada', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      id_subcategoria: 5,
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoria = {
      id_subcategoria: 5,
      nombre: 'Reparación de fugas',
      activo: true,
      Categoria: { nombre: 'Plomería' },
    };
    const mockEspecialidadExistente = {
      id_especialidad: 1,
      id_tecnico: 20,
      id_subcategoria: 5,
    };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findOne.mockResolvedValue(mockSubcategoria);
    mockModels.Especialidad.findOne.mockResolvedValue(mockEspecialidadExistente);

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain('Ya tienes esta especialidad registrada');
    expect(mockModels.Especialidad.create).not.toHaveBeenCalled();
  });

  it('debe manejar subcategoría sin categoría asociada (Categoria null)', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      id_subcategoria: 5,
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoria = {
      id_subcategoria: 5,
      nombre: 'Servicio genérico',
      activo: true,
      Categoria: null,
    };
    const mockNuevaEspecialidad = {
      id_especialidad: 1,
      id_tecnico: 20,
      id_subcategoria: 5,
      experiencia: null,
      precio_estimado: null,
    };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findOne.mockResolvedValue(mockSubcategoria);
    mockModels.Especialidad.findOne.mockResolvedValue(null);
    mockModels.Especialidad.create.mockResolvedValue(mockNuevaEspecialidad);

    // Act
    await agregarEspecialidad(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData.data.categoria).toBeUndefined();
  });
});

describe('Controller: especialidadController - obtenerMisEspecialidades', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockObtenerTecnico.mockClear();
  });

  it('debe retornar lista de especialidades del técnico autenticado', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidades = [
      {
        id_especialidad: 1,
        id_subcategoria: 5,
        experiencia: '5 años',
        precio_estimado: 50000,
        createdAt: new Date('2025-01-01'),
        Subcategoria: {
          id_subcategoria: 5,
          nombre: 'Reparación de fugas',
          Categoria: {
            nombre: 'Plomería',
          },
        },
      },
      {
        id_especialidad: 2,
        id_subcategoria: 10,
        experiencia: '3 años',
        precio_estimado: 60000,
        createdAt: new Date('2025-01-02'),
        Subcategoria: {
          id_subcategoria: 10,
          nombre: 'Instalación de enchufes',
          Categoria: {
            nombre: 'Electricidad',
          },
        },
      },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue(mockEspecialidades);

    // Act
    await obtenerMisEspecialidades(req, res);

    // Assert
    expect(mockObtenerTecnico).toHaveBeenCalledWith(10);
    expect(mockModels.Especialidad.findAll).toHaveBeenCalledWith({
      where: { id_tecnico: 20 },
      include: [
        {
          model: mockModels.Subcategoria,
          as: 'Subcategoria',
          attributes: ['id_subcategoria', 'nombre'],
          include: [
            {
              model: mockModels.Categoria,
              attributes: ['nombre'],
            },
          ],
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Especialidades obtenidas exitosamente',
      data: [
        {
          id_especialidad: 1,
          id_subcategoria: 5,
          subcategoria: 'Reparación de fugas',
          categoria: 'Plomería',
          experiencia: '5 años',
          precio_estimado: 50000,
          fecha_agregada: new Date('2025-01-01'),
        },
        {
          id_especialidad: 2,
          id_subcategoria: 10,
          subcategoria: 'Instalación de enchufes',
          categoria: 'Electricidad',
          experiencia: '3 años',
          precio_estimado: 60000,
          fecha_agregada: new Date('2025-01-02'),
        },
      ],
    });
  });

  it('debe retornar lista vacía si el técnico no tiene especialidades', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue([]);

    // Act
    await obtenerMisEspecialidades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Especialidades obtenidas exitosamente',
      data: [],
    });
  });

  it('debe retornar 403 si el usuario no es TECNICO', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'CLIENTE' };

    // Act
    await obtenerMisEspecialidades(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ForbiddenError);
    expect(errorArg.message).toContain('Esta ruta es exclusiva para técnicos');
    expect(mockObtenerTecnico).not.toHaveBeenCalled();
  });

  it('debe manejar especialidades sin Subcategoria (null)', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidades = [
      {
        id_especialidad: 1,
        id_subcategoria: 5,
        experiencia: null,
        precio_estimado: null,
        createdAt: new Date('2025-01-01'),
        Subcategoria: null,
      },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue(mockEspecialidades);

    // Act
    await obtenerMisEspecialidades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data[0]).toEqual({
      id_especialidad: 1,
      id_subcategoria: 5,
      subcategoria: null,
      categoria: null,
      experiencia: null,
      precio_estimado: null,
      fecha_agregada: new Date('2025-01-01'),
    });
  });

  it('debe manejar Subcategoria sin Categoria (null)', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidades = [
      {
        id_especialidad: 1,
        id_subcategoria: 5,
        experiencia: '2 años',
        precio_estimado: 40000,
        createdAt: new Date('2025-01-01'),
        Subcategoria: {
          id_subcategoria: 5,
          nombre: 'Servicio sin categoría',
          Categoria: null,
        },
      },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue(mockEspecialidades);

    // Act
    await obtenerMisEspecialidades(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data[0]).toEqual({
      id_especialidad: 1,
      id_subcategoria: 5,
      subcategoria: 'Servicio sin categoría',
      categoria: null,
      experiencia: '2 años',
      precio_estimado: 40000,
      fecha_agregada: new Date('2025-01-01'),
    });
  });
});

describe('Controller: especialidadController - eliminarEspecialidad', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockObtenerTecnico.mockClear();
  });

  it('debe eliminar especialidad exitosamente', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.params = { id: '1' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidad = createInstanceMock({
      id_especialidad: 1,
      id_tecnico: 20,
      id_subcategoria: 5,
    });

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findOne.mockResolvedValue(mockEspecialidad);

    // Act
    await eliminarEspecialidad(req, res);

    // Assert
    expect(mockObtenerTecnico).toHaveBeenCalledWith(10);
    expect(mockModels.Especialidad.findOne).toHaveBeenCalledWith({
      where: {
        id_especialidad: '1',
        id_tecnico: 20,
      },
    });
    expect(mockEspecialidad.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Especialidad eliminada exitosamente',
    });
  });

  it('debe retornar 403 si el usuario no es TECNICO', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'ADMIN' };
    req.params = { id: '1' };

    // Act
    await eliminarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ForbiddenError);
    expect(errorArg.message).toContain('Esta ruta es exclusiva para técnicos');
    expect(mockObtenerTecnico).not.toHaveBeenCalled();
  });

  it('debe retornar 404 si la especialidad no existe', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.params = { id: '999' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findOne.mockResolvedValue(null);

    // Act
    await eliminarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('Especialidad no encontrada o no te pertenece');
  });

  it('debe retornar 404 si la especialidad pertenece a otro técnico', async () => {
    // Arrange
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.params = { id: '1' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findOne.mockResolvedValue(null); // Query filters by id_tecnico

    // Act
    await eliminarEspecialidad(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('Especialidad no encontrada o no te pertenece');
  });
});
