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

const { ValidationError, NotFoundError, ConflictError } = await import(
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

  it('debe agregar una especialidad (legacy single) exitosamente', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { id_subcategoria: 5, experiencia: '5 años de experiencia' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoriasDB = [{
      id_subcategoria: 5,
      nombre: 'Reparación de fugas',
      Categoria: { id_categoria: 1, nombre: 'Plomería' },
    }];
    const mockNuevas = [{
      id_especialidad: 1,
      id_subcategoria: 5,
      experiencia: '5 años de experiencia',
    }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findAll.mockResolvedValue(mockSubcategoriasDB);
    mockModels.Especialidad.findAll.mockResolvedValue([]); // no existentes
    mockModels.Especialidad.bulkCreate.mockResolvedValue(mockNuevas);

    await agregarEspecialidad(req, res);

    expect(mockObtenerTecnico).toHaveBeenCalledWith(10, mockTransaction);
    expect(mockModels.Subcategoria.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_subcategoria: [5], activo: true },
        transaction: mockTransaction,
      })
    );
    expect(mockModels.Especialidad.bulkCreate).toHaveBeenCalledWith(
      [{ id_tecnico: 20, id_subcategoria: 5, experiencia: '5 años de experiencia' }],
      { transaction: mockTransaction }
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.data).toHaveLength(1);
    expect(res.jsonData.data[0].subcategoria).toBe('Reparación de fugas');
    expect(res.jsonData.data[0].categoria).toBe('Plomería');
  });

  it('debe agregar múltiples especialidades (batch) exitosamente', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = {
      especialidades: [
        { id_subcategoria: 5, experiencia: '5 años' },
        { id_subcategoria: 10 },
      ],
    };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoriasDB = [
      { id_subcategoria: 5, nombre: 'Reparación de fugas', Categoria: { id_categoria: 1, nombre: 'Plomería' } },
      { id_subcategoria: 10, nombre: 'Instalación de enchufes', Categoria: { id_categoria: 2, nombre: 'Electricidad' } },
    ];
    const mockNuevas = [
      { id_especialidad: 1, id_subcategoria: 5, experiencia: '5 años' },
      { id_especialidad: 2, id_subcategoria: 10, experiencia: null },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findAll.mockResolvedValue(mockSubcategoriasDB);
    mockModels.Especialidad.findAll.mockResolvedValue([]);
    mockModels.Especialidad.bulkCreate.mockResolvedValue(mockNuevas);

    await agregarEspecialidad(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData.data).toHaveLength(2);
    expect(res.jsonData.message).toContain('2 especialidades agregadas');
  });

  it('debe retornar 400 si no se envía id_subcategoria ni especialidades', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { experiencia: '5 años' };

    await agregarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  it('debe retornar 400 si el array especialidades está vacío', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { especialidades: [] };

    await agregarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('no puede estar vacío');
  });

  it('debe retornar 400 si un item tiene id_subcategoria inválido', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { especialidades: [{ id_subcategoria: -1 }] };

    await agregarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
  });

  it('debe retornar 400 si hay subcategorías duplicadas en el array', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { especialidades: [{ id_subcategoria: 5 }, { id_subcategoria: 5 }] };

    await agregarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.message).toContain('duplicadas');
  });

  it('debe retornar 404 si alguna subcategoría no existe o está inactiva', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { id_subcategoria: 999 };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findAll.mockResolvedValue([]); // ninguna encontrada

    await agregarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('no existen o están inactivas');
  });

  it('debe retornar 409 si el técnico ya tiene especialidades registradas', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { id_subcategoria: 5 };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoriasDB = [{ id_subcategoria: 5, nombre: 'X', Categoria: null }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findAll.mockResolvedValue(mockSubcategoriasDB);
    mockModels.Especialidad.findAll.mockResolvedValue([{ id_subcategoria: 5 }]); // ya existe

    await agregarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain('Ya tienes registradas');
    expect(mockModels.Especialidad.bulkCreate).not.toHaveBeenCalled();
  });

  it('debe agregar especialidad sin experiencia (campo opcional)', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.body = { id_subcategoria: 5 };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockSubcategoriasDB = [{
      id_subcategoria: 5, nombre: 'Instalación de grifos',
      Categoria: { id_categoria: 1, nombre: 'Plomería' },
    }];
    const mockNuevas = [{ id_especialidad: 2, id_subcategoria: 5, experiencia: null }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Subcategoria.findAll.mockResolvedValue(mockSubcategoriasDB);
    mockModels.Especialidad.findAll.mockResolvedValue([]);
    mockModels.Especialidad.bulkCreate.mockResolvedValue(mockNuevas);

    await agregarEspecialidad(req, res);

    expect(mockModels.Especialidad.bulkCreate).toHaveBeenCalledWith(
      [{ id_tecnico: 20, id_subcategoria: 5, experiencia: null }],
      { transaction: mockTransaction }
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData.data[0].experiencia).toBeNull();
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
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidades = [
      {
        id_especialidad: 1,
        id_subcategoria: 5,
        experiencia: '5 años',
        createdAt: new Date('2025-01-01'),
        Subcategoria: {
          id_subcategoria: 5,
          nombre: 'Reparación de fugas',
          Categoria: { nombre: 'Plomería' },
        },
      },
      {
        id_especialidad: 2,
        id_subcategoria: 10,
        experiencia: '3 años',
        createdAt: new Date('2025-01-02'),
        Subcategoria: {
          id_subcategoria: 10,
          nombre: 'Instalación de enchufes',
          Categoria: { nombre: 'Electricidad' },
        },
      },
    ];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue(mockEspecialidades);

    await obtenerMisEspecialidades(req, res);

    expect(mockObtenerTecnico).toHaveBeenCalledWith(10);
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
          fecha_agregada: new Date('2025-01-01'),
        },
        {
          id_especialidad: 2,
          id_subcategoria: 10,
          subcategoria: 'Instalación de enchufes',
          categoria: 'Electricidad',
          experiencia: '3 años',
          fecha_agregada: new Date('2025-01-02'),
        },
      ],
    });
  });

  it('debe retornar lista vacía si el técnico no tiene especialidades', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue([]);

    await obtenerMisEspecialidades(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data).toEqual([]);
  });

  it('debe manejar especialidades sin Subcategoria (null)', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidades = [{
      id_especialidad: 1,
      id_subcategoria: 5,
      experiencia: null,
      createdAt: new Date('2025-01-01'),
      Subcategoria: null,
    }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue(mockEspecialidades);

    await obtenerMisEspecialidades(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data[0]).toEqual({
      id_especialidad: 1,
      id_subcategoria: 5,
      subcategoria: null,
      categoria: null,
      experiencia: null,
      fecha_agregada: new Date('2025-01-01'),
    });
  });

  it('debe manejar Subcategoria sin Categoria (null)', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    const mockEspecialidades = [{
      id_especialidad: 1,
      id_subcategoria: 5,
      experiencia: '2 años',
      createdAt: new Date('2025-01-01'),
      Subcategoria: {
        id_subcategoria: 5,
        nombre: 'Servicio sin categoría',
        Categoria: null,
      },
    }];

    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findAll.mockResolvedValue(mockEspecialidades);

    await obtenerMisEspecialidades(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data[0]).toEqual({
      id_especialidad: 1,
      id_subcategoria: 5,
      subcategoria: 'Servicio sin categoría',
      categoria: null,
      experiencia: '2 años',
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

    await eliminarEspecialidad(req, res);

    expect(mockObtenerTecnico).toHaveBeenCalledWith(10);
    expect(mockEspecialidad.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Especialidad eliminada exitosamente',
    });
  });

  it('debe retornar 404 si la especialidad no existe', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.params = { id: '999' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findOne.mockResolvedValue(null);

    await eliminarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('Especialidad no encontrada o no te pertenece');
  });

  it('debe retornar 404 si la especialidad pertenece a otro técnico', async () => {
    req.usuario = { id_usuario: 10, rol: 'TECNICO' };
    req.params = { id: '1' };

    const mockTecnico = { id_tecnico: 20, id_usuario: 10 };
    mockObtenerTecnico.mockResolvedValue(mockTecnico);
    mockModels.Especialidad.findOne.mockResolvedValue(null);

    await eliminarEspecialidad(req, res);

    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
  });
});
