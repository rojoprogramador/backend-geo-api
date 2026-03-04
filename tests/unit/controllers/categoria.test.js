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

// ----------------------------------------------------------------
// Importar después de mockear
// ----------------------------------------------------------------
const {
  obtenerCategorias,
  obtenerCategoriaPorId,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
} = await import('../../../controllers/categoriaController.js');

const { ValidationError, NotFoundError, ConflictError } = await import(
  '../../../utils/errors/AppError.js'
);

describe('Controller: categoriaController - obtenerCategorias', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
  });

  it('debe retornar todas las categorías con conteo de subcategorías', async () => {
    // Arrange
    req.query = {};
    const mockCategorias = [
      {
        id_categoria: 1,
        nombre: 'Plomería',
        descripcion: 'Servicios de instalación y reparación de tuberías',
        activo: true,
        dataValues: { total_subcategorias: '4' },
      },
      {
        id_categoria: 2,
        nombre: 'Electricidad',
        descripcion: 'Instalaciones eléctricas',
        activo: true,
        dataValues: { total_subcategorias: '3' },
      },
    ];

    mockModels.Categoria.findAll.mockResolvedValue(mockCategorias);

    // Act
    await obtenerCategorias(req, res);

    // Assert
    expect(mockModels.Categoria.findAll).toHaveBeenCalledWith({
      where: {},
      include: [
        {
          model: mockModels.Subcategoria,
          attributes: [],
          where: { activo: true },
          required: false,
        },
      ],
      attributes: {
        include: [
          [
            'COUNT(Subcategoria.id_subcategoria)',
            'total_subcategorias',
          ],
        ],
      },
      group: ['Categoria.id_categoria'],
      order: [['nombre', 'ASC']],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Categorías obtenidas exitosamente',
      total: 2,
      data: [
        {
          id_categoria: 1,
          nombre: 'Plomería',
          descripcion: 'Servicios de instalación y reparación de tuberías',
          activo: true,
          total_subcategorias: 4,
        },
        {
          id_categoria: 2,
          nombre: 'Electricidad',
          descripcion: 'Instalaciones eléctricas',
          activo: true,
          total_subcategorias: 3,
        },
      ],
    });
  });

  it('debe retornar lista vacía si no hay categorías', async () => {
    // Arrange
    req.query = {};
    mockModels.Categoria.findAll.mockResolvedValue([]);

    // Act
    await obtenerCategorias(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Categorías obtenidas exitosamente',
      total: 0,
      data: [],
    });
  });

  it('debe filtrar por activo=true cuando se especifica en query', async () => {
    // Arrange
    req.query = { activo: 'true' };
    mockModels.Categoria.findAll.mockResolvedValue([]);

    // Act
    await obtenerCategorias(req, res);

    // Assert
    expect(mockModels.Categoria.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true },
      })
    );
  });

  it('debe filtrar por activo=false cuando se especifica en query', async () => {
    // Arrange
    req.query = { activo: 'false' };
    mockModels.Categoria.findAll.mockResolvedValue([]);

    // Act
    await obtenerCategorias(req, res);

    // Assert
    expect(mockModels.Categoria.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: false },
      })
    );
  });

  it('debe llamar handleError si Categoria.findAll lanza error', async () => {
    // Arrange
    req.query = {};
    const dbError = new Error('Database error');
    mockModels.Categoria.findAll.mockRejectedValue(dbError);

    // Act
    await obtenerCategorias(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalledWith(res, dbError);
  });
});

describe('Controller: categoriaController - obtenerCategoriaPorId', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
  });

  it('debe retornar categoría encontrada con sus subcategorías', async () => {
    // Arrange
    req.params = { id: '1' };
    const mockCategoria = {
      id_categoria: 1,
      nombre: 'Plomería',
      descripcion: 'Servicios de tuberías',
      activo: true,
      Subcategoria: [
        {
          id_subcategoria: 1,
          nombre: 'Reparación de fugas',
          descripcion: 'Detección y reparación',
          activo: true,
        },
        {
          id_subcategoria: 2,
          nombre: 'Instalación de grifos',
          descripcion: 'Instalación completa',
          activo: true,
        },
      ],
    };

    mockModels.Categoria.findByPk.mockResolvedValue(mockCategoria);

    // Act
    await obtenerCategoriaPorId(req, res);

    // Assert
    expect(mockModels.Categoria.findByPk).toHaveBeenCalledWith(1, {
      include: [
        {
          model: mockModels.Subcategoria,
          attributes: ['id_subcategoria', 'nombre', 'descripcion', 'activo'],
        },
      ],
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Categoría obtenida exitosamente',
      data: {
        id_categoria: 1,
        nombre: 'Plomería',
        descripcion: 'Servicios de tuberías',
        activo: true,
        subcategorias: [
          {
            id_subcategoria: 1,
            nombre: 'Reparación de fugas',
            descripcion: 'Detección y reparación',
            activo: true,
          },
          {
            id_subcategoria: 2,
            nombre: 'Instalación de grifos',
            descripcion: 'Instalación completa',
            activo: true,
          },
        ],
      },
    });
  });

  it('debe retornar 404 si la categoría no existe', async () => {
    // Arrange
    req.params = { id: '999' };
    mockModels.Categoria.findByPk.mockResolvedValue(null);

    // Act
    await obtenerCategoriaPorId(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('No se encontró la categoría con ID 999');
  });

  it('debe retornar 400 si el ID no es un número válido', async () => {
    // Arrange
    req.params = { id: 'abc' };

    // Act
    await obtenerCategoriaPorId(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors).toContain('El ID de la categoría debe ser un número entero positivo');
  });

  it('debe retornar 400 si el ID es negativo', async () => {
    // Arrange
    req.params = { id: '-1' };

    // Act
    await obtenerCategoriaPorId(req, res);

    // Assert
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
  });

  it('debe manejar categorías sin subcategorías (array vacío)', async () => {
    // Arrange
    req.params = { id: '1' };
    const mockCategoria = {
      id_categoria: 1,
      nombre: 'Plomería',
      descripcion: 'Servicios de tuberías',
      activo: true,
      Subcategoria: null,
    };

    mockModels.Categoria.findByPk.mockResolvedValue(mockCategoria);

    // Act
    await obtenerCategoriaPorId(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData.data.subcategorias).toEqual([]);
  });
});

describe('Controller: categoriaController - crearCategoria', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockTransaction.finished = false;
  });

  it('debe crear categoría exitosamente con todos los campos', async () => {
    // Arrange
    req.body = {
      nombre: 'Plomería',
      descripcion: 'Servicios de instalación y reparación de tuberías',
      activo: true,
    };

    const mockNuevaCategoria = {
      id_categoria: 1,
      nombre: 'Plomería',
      descripcion: 'Servicios de instalación y reparación de tuberías',
      activo: true,
    };

    mockModels.Categoria.findOne.mockResolvedValue(null); // No existe duplicado
    mockModels.Categoria.create.mockResolvedValue(mockNuevaCategoria);

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockModels.Categoria.findOne).toHaveBeenCalled();
    expect(mockModels.Categoria.create).toHaveBeenCalledWith(
      {
        nombre: 'Plomería',
        descripcion: 'Servicios de instalación y reparación de tuberías',
        activo: true,
      },
      { transaction: mockTransaction }
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Categoría creada exitosamente',
      data: {
        id_categoria: 1,
        nombre: 'Plomería',
        descripcion: 'Servicios de instalación y reparación de tuberías',
        activo: true,
      },
    });
  });

  it('debe crear categoría sin descripción (campo opcional)', async () => {
    // Arrange
    req.body = {
      nombre: 'Cerrajería',
    };

    const mockNuevaCategoria = {
      id_categoria: 2,
      nombre: 'Cerrajería',
      descripcion: null,
      activo: true,
    };

    mockModels.Categoria.findOne.mockResolvedValue(null);
    mockModels.Categoria.create.mockResolvedValue(mockNuevaCategoria);

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockModels.Categoria.create).toHaveBeenCalledWith(
      {
        nombre: 'Cerrajería',
        descripcion: null,
        activo: true,
      },
      { transaction: mockTransaction }
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('debe retornar 400 si el nombre está vacío', async () => {
    // Arrange
    req.body = {
      nombre: '',
      descripcion: 'Test',
    };

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors).toContain('El campo nombre es requerido');
  });

  it('debe retornar 400 si el nombre no se proporciona', async () => {
    // Arrange
    req.body = {
      descripcion: 'Test',
    };

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors).toContain('El campo nombre es requerido');
  });

  it('debe retornar 400 si el nombre tiene caracteres inválidos', async () => {
    // Arrange
    req.body = {
      nombre: 'Plomería@123!',
    };

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors[0]).toContain('solo puede contener letras');
  });

  it('debe retornar 400 si el nombre es demasiado corto (< 3 caracteres)', async () => {
    // Arrange
    req.body = {
      nombre: 'AB',
    };

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
  });

  it('debe retornar 400 si la descripción supera 200 caracteres', async () => {
    // Arrange
    req.body = {
      nombre: 'Plomería',
      descripcion: 'A'.repeat(201),
    };

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors).toContain('La descripción no puede superar los 200 caracteres');
  });

  it('debe retornar 409 si ya existe una categoría con el mismo nombre', async () => {
    // Arrange
    req.body = {
      nombre: 'Plomería',
    };

    mockModels.Categoria.findOne.mockResolvedValue({ id_categoria: 1, nombre: 'plomeria' });

    // Act
    await crearCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain("Ya existe una categoría con el nombre 'Plomería'");
  });
});

describe('Controller: categoriaController - actualizarCategoria', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockTransaction.finished = false;
  });

  it('debe actualizar categoría exitosamente', async () => {
    // Arrange
    req.params = { id: '1' };
    req.body = {
      nombre: 'Fontanería',
      descripcion: 'Servicios hidráulicos',
      activo: false,
    };

    const mockCategoriaExistente = {
      id_categoria: 1,
      nombre: 'Plomería',
      descripcion: 'Servicios',
      activo: true,
    };

    const mockCategoriaActualizada = {
      id_categoria: 1,
      nombre: 'Fontanería',
      descripcion: 'Servicios hidráulicos',
      activo: false,
    };

    mockModels.Categoria.findByPk
      .mockResolvedValueOnce(mockCategoriaExistente) // Primera llamada (con transaction)
      .mockResolvedValueOnce(mockCategoriaActualizada); // Segunda llamada (sin transaction)
    mockModels.Categoria.findOne.mockResolvedValue(null); // No duplicado
    mockModels.Categoria.update.mockResolvedValue([1]);

    // Act
    await actualizarCategoria(req, res);

    // Assert
    expect(mockModels.Categoria.update).toHaveBeenCalledWith(
      {
        nombre: 'Fontanería',
        descripcion: 'Servicios hidráulicos',
        activo: false,
      },
      {
        where: { id_categoria: 1 },
        transaction: mockTransaction,
      }
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Categoría actualizada exitosamente',
      data: {
        id_categoria: 1,
        nombre: 'Fontanería',
        descripcion: 'Servicios hidráulicos',
        activo: false,
      },
    });
  });

  it('debe actualizar solo el nombre', async () => {
    // Arrange
    req.params = { id: '1' };
    req.body = {
      nombre: 'Fontanería',
    };

    const mockCategoriaExistente = {
      id_categoria: 1,
      nombre: 'Plomería',
      descripcion: 'Servicios',
      activo: true,
    };

    const mockCategoriaActualizada = {
      id_categoria: 1,
      nombre: 'Fontanería',
      descripcion: 'Servicios',
      activo: true,
    };

    mockModels.Categoria.findByPk
      .mockResolvedValueOnce(mockCategoriaExistente)
      .mockResolvedValueOnce(mockCategoriaActualizada);
    mockModels.Categoria.findOne.mockResolvedValue(null);
    mockModels.Categoria.update.mockResolvedValue([1]);

    // Act
    await actualizarCategoria(req, res);

    // Assert
    expect(mockModels.Categoria.update).toHaveBeenCalledWith(
      {
        nombre: 'Fontanería',
      },
      {
        where: { id_categoria: 1 },
        transaction: mockTransaction,
      }
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it('debe retornar 404 si la categoría no existe', async () => {
    // Arrange
    req.params = { id: '999' };
    req.body = {
      nombre: 'Nuevo nombre',
    };

    mockModels.Categoria.findByPk.mockResolvedValue(null);

    // Act
    await actualizarCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('No se encontró la categoría con ID 999');
  });

  it('debe retornar 400 si no se envía ningún campo para actualizar', async () => {
    // Arrange
    req.params = { id: '1' };
    req.body = {};

    // Act
    await actualizarCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors[0]).toContain('Debe enviar al menos un campo para actualizar');
  });

  it('debe retornar 409 si el nuevo nombre ya existe en otra categoría', async () => {
    // Arrange
    req.params = { id: '1' };
    req.body = {
      nombre: 'Electricidad',
    };

    const mockCategoriaExistente = {
      id_categoria: 1,
      nombre: 'Plomería',
    };

    const mockDuplicado = {
      id_categoria: 2,
      nombre: 'electricidad',
    };

    mockModels.Categoria.findByPk.mockResolvedValue(mockCategoriaExistente);
    mockModels.Categoria.findOne.mockResolvedValue(mockDuplicado);

    // Act
    await actualizarCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain("Ya existe una categoría con el nombre 'Electricidad'");
  });
});

describe('Controller: categoriaController - eliminarCategoria', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    resetAllMocks(mockModels);
    mockHandleError.mockClear();
    mockTransaction.finished = false;
  });

  it('debe eliminar categoría exitosamente', async () => {
    // Arrange
    req.params = { id: '3' };
    req.usuario = { id_usuario: 1 };

    const mockCategoria = createInstanceMock({
      id_categoria: 3,
      nombre: 'Cerrajería',
      activo: true,
    });

    mockModels.Categoria.findByPk.mockResolvedValue(mockCategoria);
    mockModels.Subcategoria.count.mockResolvedValue(0); // Sin subcategorías

    // Act
    await eliminarCategoria(req, res);

    // Assert
    expect(mockModels.Subcategoria.count).toHaveBeenCalledWith({
      where: { id_categoria: 3 },
      transaction: mockTransaction,
    });
    expect(mockCategoria.destroy).toHaveBeenCalledWith({ transaction: mockTransaction });
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonData).toEqual({
      success: true,
      message: 'Categoría eliminada exitosamente',
      data: {
        id_categoria: 3,
        nombre: 'Cerrajería',
      },
    });
  });

  it('debe retornar 404 si la categoría no existe', async () => {
    // Arrange
    req.params = { id: '999' };

    mockModels.Categoria.findByPk.mockResolvedValue(null);

    // Act
    await eliminarCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(NotFoundError);
    expect(errorArg.message).toContain('No se encontró la categoría con ID 999');
  });

  it('debe retornar 409 si la categoría tiene subcategorías asociadas', async () => {
    // Arrange
    req.params = { id: '1' };

    const mockCategoria = {
      id_categoria: 1,
      nombre: 'Plomería',
    };

    mockModels.Categoria.findByPk.mockResolvedValue(mockCategoria);
    mockModels.Subcategoria.count.mockResolvedValue(4); // Tiene 4 subcategorías

    // Act
    await eliminarCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ConflictError);
    expect(errorArg.message).toContain('No se puede eliminar la categoría porque tiene 4 subcategoría(s) asociada(s)');
  });

  it('debe retornar 400 si el ID no es válido', async () => {
    // Arrange
    req.params = { id: 'abc' };

    // Act
    await eliminarCategoria(req, res);

    // Assert
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
    const errorArg = mockHandleError.mock.calls[0][1];
    expect(errorArg).toBeInstanceOf(ValidationError);
    expect(errorArg.errors).toContain('El ID de la categoría debe ser un número entero positivo');
  });
});
