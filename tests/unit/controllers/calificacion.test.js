import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Mocks ---
const mockModels = {
  sequelize: {
    transaction: jest.fn(),
    fn: jest.fn((name, col) => `${name}(${col})`),
    col: jest.fn((c) => c),
  },
  Calificacion: {
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  },
  Servicio: { findByPk: jest.fn() },
  Cliente: { findOne: jest.fn() },
  Tecnico: { findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn() },
  Usuario: {},
  Subcategoria: {},
  EstadoSolicitud: {},
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

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({
  handleError: mockHandleError,
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Import real error classes (not mocked)
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } =
  await import('../../../utils/errors/AppError.js');

const {
  crearCalificacion,
  obtenerCalificacionesTecnico,
  obtenerMiCalificacionComoTecnico,
  obtenerCalificacionServicio,
} = await import('../../../controllers/calificacionController.js');

// --- Tests ---
describe('calificacionController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // ===========================================================================
  // crearCalificacion
  // ===========================================================================
  describe('crearCalificacion', () => {
    it('debe crear calificación exitosamente → 201', async () => {
      req.body = { id_servicio: 1, puntuacion: 5, comentario: 'Excelente trabajo' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_estado: 6,
        id_cliente: 5,
        id_tecnico: 3,
      });
      mockModels.Calificacion.findOne
        .mockResolvedValueOnce(null) // no existe calificación previa
        .mockResolvedValueOnce({ promedio: '4.50', total: '10' }); // AVG query
      mockModels.Calificacion.create.mockResolvedValue({
        id_calificacion: 100,
        id_servicio: 1,
        puntuacion: 5,
      });
      mockModels.Tecnico.update.mockResolvedValue([1]);
      mockModels.Calificacion.findByPk.mockResolvedValue({
        id_calificacion: 100,
        puntuacion: 5,
      });

      await crearCalificacion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.message).toBe('Calificación registrada exitosamente');
      expect(res.jsonData.data.nuevo_promedio_tecnico).toBe(4.5);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe retornar 400 si falta id_servicio', async () => {
      req.body = { puntuacion: 5 };
      req.usuario = { id_usuario: 10 };

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.statusCode).toBe(400);
    });

    it('debe retornar 400 si falta puntuacion', async () => {
      req.body = { id_servicio: 1 };
      req.usuario = { id_usuario: 10 };

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si puntuacion fuera de rango (0 o 6)', async () => {
      req.body = { id_servicio: 1, puntuacion: 6 };
      req.usuario = { id_usuario: 10 };

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('entre 1 y 5'),
        ])
      );
    });

    it('debe retornar 404 si el servicio no existe', async () => {
      req.body = { id_servicio: 999, puntuacion: 4 };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue(null);

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si el servicio no está en estado COMPLETADA', async () => {
      req.body = { id_servicio: 1, puntuacion: 4 };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_estado: 5, // EN_PROCESO, no COMPLETADA (6)
        id_cliente: 5,
        id_tecnico: 3,
      });

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain('COMPLETADA');
    });

    it('debe retornar 403 si el cliente no es propietario del servicio', async () => {
      req.body = { id_servicio: 1, puntuacion: 4 };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_estado: 6,
        id_cliente: 99, // otro cliente
        id_tecnico: 3,
      });

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 409 si el servicio ya fue calificado', async () => {
      req.body = { id_servicio: 1, puntuacion: 4 };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_estado: 6,
        id_cliente: 5,
        id_tecnico: 3,
      });
      mockModels.Calificacion.findOne.mockResolvedValue({
        id_calificacion: 50,
      }); // ya existe

      await crearCalificacion(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toContain('ya fue calificado');
    });
  });

  // ===========================================================================
  // obtenerCalificacionesTecnico
  // ===========================================================================
  describe('obtenerCalificacionesTecnico', () => {
    it('debe retornar calificaciones paginadas → 200', async () => {
      req.params = { id_tecnico: '3' };
      req.query = { page: '1', limit: '10' };

      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 3,
        prom_calificacion: 4.5,
        datos_usuario: { nombre: 'Carlos', apellido: 'Lopez' },
      });

      mockModels.Calificacion.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: [
          { id_calificacion: 1, puntuacion: 5 },
          { id_calificacion: 2, puntuacion: 4 },
        ],
      });

      await obtenerCalificacionesTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.data.total_calificaciones).toBe(2);
      expect(res.jsonData.data.calificaciones).toHaveLength(2);
    });

    it('debe retornar 400 si id_tecnico es inválido', async () => {
      req.params = { id_tecnico: 'abc' };
      req.query = {};

      await obtenerCalificacionesTecnico(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si el técnico no existe', async () => {
      req.params = { id_tecnico: '999' };
      req.query = {};

      mockModels.Tecnico.findByPk.mockResolvedValue(null);

      await obtenerCalificacionesTecnico(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  // ===========================================================================
  // obtenerMiCalificacionComoTecnico
  // ===========================================================================
  describe('obtenerMiCalificacionComoTecnico', () => {
    it('debe retornar estadísticas del técnico → 200', async () => {
      req.usuario = { id_usuario: 20 };

      mockModels.Tecnico.findOne.mockResolvedValue({
        id_tecnico: 3,
        prom_calificacion: 4.5,
        reload: jest.fn().mockResolvedValue(undefined),
      });

      mockModels.Calificacion.findOne.mockResolvedValue({
        promedio: '4.50',
        total: '10',
      });

      mockModels.Calificacion.findAll.mockResolvedValue([
        { puntuacion: 5, cantidad: '6' },
        { puntuacion: 4, cantidad: '3' },
        { puntuacion: 3, cantidad: '1' },
      ]);

      await obtenerMiCalificacionComoTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.data.prom_calificacion).toBe(4.5);
      expect(res.jsonData.data.total_calificaciones).toBe(10);
      expect(res.jsonData.data.desglose_por_estrellas).toEqual({
        1: 0,
        2: 0,
        3: 1,
        4: 3,
        5: 6,
      });
    });

    it('debe retornar 404 si no hay perfil de técnico', async () => {
      req.usuario = { id_usuario: 20 };
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await obtenerMiCalificacionComoTecnico(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  // ===========================================================================
  // obtenerCalificacionServicio
  // ===========================================================================
  describe('obtenerCalificacionServicio', () => {
    it('debe retornar calificación existente → 200', async () => {
      req.params = { id_servicio: '1' };
      req.usuario = { id_usuario: 10, rol: 'ADMIN' };

      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_cliente: 5,
        id_tecnico: 3,
      });

      mockModels.Calificacion.findOne.mockResolvedValue({
        id_calificacion: 100,
        puntuacion: 5,
      });

      await obtenerCalificacionServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.calificacion).toBeTruthy();
    });

    it('debe retornar null si el servicio no tiene calificación → 200', async () => {
      req.params = { id_servicio: '1' };
      req.usuario = { id_usuario: 10, rol: 'ADMIN' };

      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_cliente: 5,
        id_tecnico: 3,
      });

      mockModels.Calificacion.findOne.mockResolvedValue(null);

      await obtenerCalificacionServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.calificacion).toBeNull();
      expect(res.jsonData.message).toContain('no ha sido calificado');
    });

    it('debe retornar 400 si id_servicio es inválido', async () => {
      req.params = { id_servicio: 'abc' };
      req.usuario = { id_usuario: 10, rol: 'ADMIN' };

      await obtenerCalificacionServicio(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si el servicio no existe', async () => {
      req.params = { id_servicio: '999' };
      req.usuario = { id_usuario: 10, rol: 'ADMIN' };

      mockModels.Servicio.findByPk.mockResolvedValue(null);

      await obtenerCalificacionServicio(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si el cliente no es propietario del servicio', async () => {
      req.params = { id_servicio: '1' };
      req.usuario = { id_usuario: 10, rol: 'CLIENTE' };

      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 1,
        id_cliente: 99,
        id_tecnico: 3,
      });

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 5 });

      await obtenerCalificacionServicio(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const error = mockHandleError.mock.calls[0][1];
      expect(error).toBeInstanceOf(ForbiddenError);
    });
  });
});
