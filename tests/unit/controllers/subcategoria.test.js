import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
  sequelize: { transaction: jest.fn() },
  Categoria: { findByPk: jest.fn() },
  Subcategoria: { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Especialidad: { count: jest.fn() },
  Solicitud: { count: jest.fn() },
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

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

// Mock Op from sequelize
const mockOp = { iLike: Symbol('iLike'), ne: Symbol('ne') };

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('sequelize', () => ({ Op: mockOp }));

const { ValidationError, NotFoundError, ConflictError } =
  await import('../../../utils/errors/AppError.js');

const {
  obtenerSubcategorias,
  obtenerSubcategoriaPorId,
  crearSubcategoria,
  actualizarSubcategoria,
  eliminarSubcategoria,
} = await import('../../../controllers/subcategoriaController.js');

// -----------------------------------------------------------------------

describe('subcategoriaController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // =====================================================================
  // obtenerSubcategorias
  // =====================================================================
  describe('obtenerSubcategorias', () => {
    it('debe retornar todas las subcategorías → 200', async () => {
      req.query = {};
      mockModels.Subcategoria.findAll.mockResolvedValue([
        {
          id_subcategoria: 1, nombre: 'Reparación de tuberías', descripcion: 'Desc', activo: true,
          id_categoria: 1, Categoria: { id_categoria: 1, nombre: 'Plomería' },
        },
      ]);

      await obtenerSubcategorias(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.total).toBe(1);
      expect(res.jsonData.data[0].categoria.nombre).toBe('Plomería');
    });

    it('debe filtrar por activo=true', async () => {
      req.query = { activo: 'true' };
      mockModels.Subcategoria.findAll.mockResolvedValue([]);

      await obtenerSubcategorias(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe filtrar por id_categoria válido', async () => {
      req.query = { id_categoria: '1' };
      mockModels.Subcategoria.findAll.mockResolvedValue([]);

      await obtenerSubcategorias(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar 400 con id_categoria inválido', async () => {
      req.query = { id_categoria: 'abc' };

      await obtenerSubcategorias(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe manejar subcategorías sin categoría padre (null)', async () => {
      req.query = {};
      mockModels.Subcategoria.findAll.mockResolvedValue([
        {
          id_subcategoria: 1, nombre: 'Test', descripcion: null, activo: true,
          id_categoria: 1, Categoria: null,
        },
      ]);

      await obtenerSubcategorias(req, res);

      expect(res.jsonData.data[0].categoria).toBeNull();
    });
  });

  // =====================================================================
  // obtenerSubcategoriaPorId
  // =====================================================================
  describe('obtenerSubcategoriaPorId', () => {
    it('debe retornar subcategoría por ID → 200', async () => {
      req.params = { id: '3' };
      mockModels.Subcategoria.findByPk.mockResolvedValue({
        id_subcategoria: 3, nombre: 'Reparación', descripcion: 'Desc', activo: true,
        id_categoria: 1, Categoria: { id_categoria: 1, nombre: 'Plomería', descripcion: 'D', activo: true },
      });

      await obtenerSubcategoriaPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.id_subcategoria).toBe(3);
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: 'abc' };

      await obtenerSubcategoriaPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si no existe', async () => {
      req.params = { id: '999' };
      mockModels.Subcategoria.findByPk.mockResolvedValue(null);

      await obtenerSubcategoriaPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // crearSubcategoria
  // =====================================================================
  describe('crearSubcategoria', () => {
    it('debe crear subcategoría exitosamente → 201', async () => {
      req.body = { nombre: 'Reparación de tuberías', descripcion: 'Desc test', id_categoria: 1 };
      mockModels.Categoria.findByPk.mockResolvedValue({ id_categoria: 1, nombre: 'Plomería' });
      mockModels.Subcategoria.findOne.mockResolvedValue(null);
      mockModels.Subcategoria.create.mockResolvedValue({
        id_subcategoria: 7, nombre: 'Reparación de tuberías', descripcion: 'Desc test',
        id_categoria: 1, activo: true,
      });

      await crearSubcategoria(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe crear sin descripción → 201', async () => {
      req.body = { nombre: 'Apertura puertas', id_categoria: 1 };
      mockModels.Categoria.findByPk.mockResolvedValue({ id_categoria: 1, nombre: 'Cerrajería' });
      mockModels.Subcategoria.findOne.mockResolvedValue(null);
      mockModels.Subcategoria.create.mockResolvedValue({
        id_subcategoria: 8, nombre: 'Apertura puertas', descripcion: null,
        id_categoria: 1, activo: true,
      });

      await crearSubcategoria(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debe retornar 400 si falta nombre', async () => {
      req.body = { id_categoria: 1 };

      await crearSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si falta id_categoria', async () => {
      req.body = { nombre: 'Reparación' };

      await crearSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si nombre es inválido (< 3 chars)', async () => {
      req.body = { nombre: 'AB', id_categoria: 1 };

      await crearSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si descripción supera 300 caracteres', async () => {
      req.body = { nombre: 'Reparación', id_categoria: 1, descripcion: 'x'.repeat(301) };

      await crearSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si categoría no existe', async () => {
      req.body = { nombre: 'Reparación tuberías', id_categoria: 999 };
      mockModels.Categoria.findByPk.mockResolvedValue(null);

      await crearSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si nombre duplicado en misma categoría', async () => {
      req.body = { nombre: 'Reparación tuberías', id_categoria: 1 };
      mockModels.Categoria.findByPk.mockResolvedValue({ id_categoria: 1, nombre: 'Plomería' });
      mockModels.Subcategoria.findOne.mockResolvedValue({ id_subcategoria: 2 });

      await crearSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });
  });

  // =====================================================================
  // actualizarSubcategoria
  // =====================================================================
  describe('actualizarSubcategoria', () => {
    it('debe actualizar nombre exitosamente → 200', async () => {
      req.params = { id: '3' };
      req.body = { nombre: 'Detección de fugas' };
      mockModels.Subcategoria.findByPk
        .mockResolvedValueOnce({ id_subcategoria: 3, nombre: 'Reparación', id_categoria: 1 }) // check exists
        .mockResolvedValueOnce({ id_subcategoria: 3, nombre: 'Detección de fugas', descripcion: null, id_categoria: 1, activo: true }); // after update
      mockModels.Subcategoria.findOne.mockResolvedValue(null); // no duplicate

      await actualizarSubcategoria(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: 'abc' };
      req.body = { nombre: 'Test' };

      await actualizarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si no envía campos', async () => {
      req.params = { id: '3' };
      req.body = {};

      await actualizarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si subcategoría no existe', async () => {
      req.params = { id: '999' };
      req.body = { nombre: 'Test' };
      mockModels.Subcategoria.findByPk.mockResolvedValue(null);

      await actualizarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si nombre duplicado', async () => {
      req.params = { id: '3' };
      req.body = { nombre: 'Duplicado' };
      mockModels.Subcategoria.findByPk.mockResolvedValueOnce({ id_subcategoria: 3, nombre: 'Original', id_categoria: 1 });
      mockModels.Subcategoria.findOne.mockResolvedValue({ id_subcategoria: 5 }); // duplicate found

      await actualizarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 404 si nueva categoría no existe', async () => {
      req.params = { id: '3' };
      req.body = { id_categoria: 999 };
      mockModels.Subcategoria.findByPk.mockResolvedValueOnce({ id_subcategoria: 3, nombre: 'Test', id_categoria: 1 });
      mockModels.Categoria.findByPk.mockResolvedValue(null);

      await actualizarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // eliminarSubcategoria
  // =====================================================================
  describe('eliminarSubcategoria', () => {
    it('debe eliminar subcategoría exitosamente → 200', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 1 };
      const mockSubcat = { id_subcategoria: 7, nombre: 'Apertura', destroy: jest.fn() };
      mockModels.Subcategoria.findByPk.mockResolvedValue(mockSubcat);
      mockModels.Especialidad.count.mockResolvedValue(0);
      mockModels.Solicitud.count.mockResolvedValue(0);

      await eliminarSubcategoria(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockSubcat.destroy).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: '-1' };

      await eliminarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si no existe', async () => {
      req.params = { id: '999' };
      mockModels.Subcategoria.findByPk.mockResolvedValue(null);

      await eliminarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si tiene especialidades asociadas', async () => {
      req.params = { id: '3' };
      mockModels.Subcategoria.findByPk.mockResolvedValue({ id_subcategoria: 3, nombre: 'Test' });
      mockModels.Especialidad.count.mockResolvedValue(5);

      await eliminarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 409 si tiene solicitudes asociadas', async () => {
      req.params = { id: '3' };
      mockModels.Subcategoria.findByPk.mockResolvedValue({ id_subcategoria: 3, nombre: 'Test' });
      mockModels.Especialidad.count.mockResolvedValue(0);
      mockModels.Solicitud.count.mockResolvedValue(12);

      await eliminarSubcategoria(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });
  });
});
