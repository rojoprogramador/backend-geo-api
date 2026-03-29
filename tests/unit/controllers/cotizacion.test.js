import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
  sequelize: { transaction: jest.fn() },
  Cotizacion: { findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  Solicitud: { findByPk: jest.fn(), update: jest.fn() },
  Cliente: { findOne: jest.fn(), findByPk: jest.fn() },
  Tecnico: { findOne: jest.fn(), findByPk: jest.fn() },
  Cita: { findOne: jest.fn() },
  Servicio: { findOne: jest.fn() },
  TecnicoSolicitudQueue: { findOne: jest.fn(), update: jest.fn() },
  EstadoSolicitud: {},
  Usuario: {},
};

const mockSocketEmitter = {
  emitNuevaCotizacion:  jest.fn(),
  emitCotizacionAceptada: jest.fn(),
  emitCotizacionRechazada: jest.fn(),
};

const mockCotizacionBatcher = {
  addCotizacion: jest.fn(),
  cancelBatch:   jest.fn(),
};

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), finished: undefined };

const mockHandleError = jest.fn((res, error) => {
  const sc = error.statusCode || 500;
  return res.status(sc).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
  });
});

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

const mockOp = { in: Symbol('in'), ne: Symbol('ne') };

const mockGetInmediataCutoffDate = jest.fn(() => new Date());

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('sequelize', () => ({ Op: mockOp }));
jest.unstable_mockModule('../../../services/immediateRequestExpiryService.js', () => ({ getInmediataCutoffDate: mockGetInmediataCutoffDate }));
jest.unstable_mockModule('../../../sockets/services/socketEmitter.js', () => mockSocketEmitter);
jest.unstable_mockModule('../../../sockets/services/cotizacionBatcher.js', () => mockCotizacionBatcher);

const { ValidationError, NotFoundError, ForbiddenError, ConflictError } =
  await import('../../../utils/errors/AppError.js');

const {
  crearCotizacion,
  obtenerCotizacionesSolicitud,
  aceptarCotizacion,
  rechazarCotizacion,
} = await import('../../../controllers/cotizacionController.js');

// -----------------------------------------------------------------------

describe('cotizacionController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // =====================================================================
  // crearCotizacion
  // =====================================================================
  describe('crearCotizacion', () => {
    const validBody = {
      id_solicitud: 15,
      valor_cotizacion: 180000,
      descripcion: 'Reparación de tubería rota, incluye sellante epoxi.',
      tiempo_estimado: '2-3 horas',
      incluye_materiales: true,
      dias_garantia: 30,
    };

    it('debe crear cotización exitosamente → 201', async () => {
      req.body = { ...validBody };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 2 });
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({ id_cola: 1 });
      mockModels.Cotizacion.findOne.mockResolvedValue(null);
      mockModels.Cotizacion.create.mockResolvedValue({
        id_cotizacion: 7, id_solicitud: 15, id_tecnico: 5,
        valor_cotizacion: 180000, estado: 'PENDIENTE',
      });
      mockModels.TecnicoSolicitudQueue.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 7, tecnico: { id_tecnico: 5, datos_usuario: { nombre: 'Andrés' } },
      });

      await crearCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe crear cotización sin campos opcionales → 201', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 95000 };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 3 }); // COTIZANDO
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({ id_cola: 2 });
      mockModels.Cotizacion.findOne.mockResolvedValue(null);
      mockModels.Cotizacion.create.mockResolvedValue({
        id_cotizacion: 8, id_solicitud: 15, id_tecnico: 5,
        valor_cotizacion: 95000, estado: 'PENDIENTE',
      });
      mockModels.TecnicoSolicitudQueue.update.mockResolvedValue([1]);
      // solicitud already COTIZANDO, no Solicitud.update needed for state
      mockModels.Cotizacion.findByPk.mockResolvedValue({ id_cotizacion: 8 });

      await crearCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debe retornar 400 si falta id_solicitud', async () => {
      req.body = { valor_cotizacion: 100000 };

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si falta valor_cotizacion', async () => {
      req.body = { id_solicitud: 15 };

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si id_solicitud no es entero positivo', async () => {
      req.body = { id_solicitud: -1, valor_cotizacion: 100000 };

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si valor_cotizacion <= 0', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 0 };

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si descripción < 10 caracteres', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000, descripcion: 'Corta' };

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si dias_garantia > 365', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000, dias_garantia: 400 };

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no encontrado', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 404 si solicitud no encontrada', async () => {
      req.body = { id_solicitud: 999, valor_cotizacion: 100000 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue(null);

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si solicitud INMEDIATO está expirada (TTL)', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000 };
      req.usuario = { id_usuario: 10 };

      // Mock una solicitud INMEDIATO con fecha_solicitud hace 30 minutos (más que 20 min TTL)
      const expiredDate = new Date(Date.now() - 30 * 60 * 1000);
      
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15,
        id_estado: 2,
        tipo_servicio: 'INMEDIATO',
        fecha_solicitud: expiredDate,
      });
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({ id_cola: 1 });
      // Mock cutoff hace 20 minutos
      mockGetInmediataCutoffDate.mockReturnValue(new Date(Date.now() - 20 * 60 * 1000));

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
      expect(mockModels.TecnicoSolicitudQueue.update).toHaveBeenCalledWith(
        expect.objectContaining({ estado_respuesta: 'IGNORADO', motivo_rechazo: 'EXPIRADA_TTL' }),
        expect.any(Object)
      );
    });

    it('debe retornar 409 si solicitud en estado inválido (ASIGNADA)', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 4 }); // ASIGNADA

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 403 si técnico no está en cola', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 2 });
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue(null);

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 409 si ya envió cotización', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 100000 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 2 });
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({ id_cola: 1 });
      mockModels.Cotizacion.findOne.mockResolvedValue({ id_cotizacion: 99 }); // already exists

      await crearCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe emitir WebSocket cuando idClienteUsuario está disponible → 201', async () => {
      req.body = { ...validBody };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 2, id_cliente: 3 });
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({ id_cola: 1 });
      mockModels.Cotizacion.findOne.mockResolvedValue(null);
      mockModels.Cotizacion.create.mockResolvedValue({
        id_cotizacion: 7, id_solicitud: 15, id_tecnico: 5, valor_cotizacion: 180000, estado: 'PENDIENTE',
      });
      mockModels.TecnicoSolicitudQueue.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.Cliente.findByPk.mockResolvedValue({ id_usuario: 20 }); // cliente owner con id_usuario
      mockModels.Cotizacion.findByPk.mockResolvedValue({ id_cotizacion: 7 });

      await crearCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockSocketEmitter.emitNuevaCotizacion).toHaveBeenCalled();
      expect(mockCotizacionBatcher.addCotizacion).toHaveBeenCalledWith(15, 20);
    });

    it('debe omitir WebSocket cuando Cliente.findByPk devuelve null → 201', async () => {
      req.body = { id_solicitud: 15, valor_cotizacion: 95000 };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_estado: 3, id_cliente: 3 });
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({ id_cola: 2 });
      mockModels.Cotizacion.findOne.mockResolvedValue(null);
      mockModels.Cotizacion.create.mockResolvedValue({ id_cotizacion: 8, id_tecnico: 5, valor_cotizacion: 95000 });
      mockModels.TecnicoSolicitudQueue.update.mockResolvedValue([1]);
      mockModels.Cliente.findByPk.mockResolvedValue(null); // no cliente → no emit
      mockModels.Cotizacion.findByPk.mockResolvedValue({ id_cotizacion: 8 });

      await crearCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockSocketEmitter.emitNuevaCotizacion).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // obtenerCotizacionesSolicitud
  // =====================================================================
  describe('obtenerCotizacionesSolicitud', () => {
    it('debe retornar cotizaciones de solicitud → 200', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_cliente: 3, id_estado: 3 });
      mockModels.Cotizacion.findAll.mockResolvedValue([
        { id_cotizacion: 7, valor_cotizacion: 95000, estado: 'PENDIENTE', tecnico: { id_tecnico: 5 } },
        { id_cotizacion: 8, valor_cotizacion: 180000, estado: 'PENDIENTE', tecnico: { id_tecnico: 6 } },
      ]);

      await obtenerCotizacionesSolicitud(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.total_cotizaciones).toBe(2);
    });

    it('debe retornar 400 con id_solicitud inválido', async () => {
      req.params = { id_solicitud: 'abc' };

      await obtenerCotizacionesSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si cliente no encontrado', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 999 };
      mockModels.Cliente.findOne.mockResolvedValue(null);

      await obtenerCotizacionesSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 404 si solicitud no encontrada', async () => {
      req.params = { id_solicitud: '999' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue(null);

      await obtenerCotizacionesSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si solicitud no pertenece al cliente', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({ id_solicitud: 15, id_cliente: 99 }); // another client

      await obtenerCotizacionesSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });
  });

  // =====================================================================
  // aceptarCotizacion
  // =====================================================================
  describe('aceptarCotizacion', () => {
    it('debe aceptar cotización exitosamente → 200', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk
        .mockResolvedValueOnce({
          id_cotizacion: 7, id_solicitud: 15, id_tecnico: 5, estado: 'PENDIENTE',
          solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3 },
        })
        .mockResolvedValueOnce({
          id_cotizacion: 7, estado: 'ACEPTADA',
          tecnico: { id_tecnico: 5, datos_usuario: { nombre: 'Andrés', apellido: 'Martínez' } },
          solicitud: { id_solicitud: 15, id_estado: 4, estado: { id_estado: 4, descripcion: 'ASIGNADA' } },
        });
      mockModels.Cotizacion.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);

      await aceptarCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockTransaction.commit).toHaveBeenCalled();
      // Verify accepted + others rejected + solicitud assigned
      expect(mockModels.Cotizacion.update).toHaveBeenCalledTimes(2);
      expect(mockModels.Solicitud.update).toHaveBeenCalled();
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: 'abc' };

      await aceptarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si cliente no encontrado', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 999 };
      mockModels.Cliente.findOne.mockResolvedValue(null);

      await aceptarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 404 si cotización no encontrada', async () => {
      req.params = { id: '999' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue(null);

      await aceptarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si cotización no está PENDIENTE', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 7, estado: 'ACEPTADA',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3 },
      });

      await aceptarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 403 si solicitud no pertenece al cliente', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 7, estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 99, id_estado: 3 },
      });

      await aceptarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 409 si solicitud no está en COTIZANDO', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 7, estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 4 }, // ASIGNADA, not COTIZANDO
      });

      await aceptarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe emitir WebSocket al aceptar cotización con técnico ganador → 200', async () => {
      req.params = { id: '7' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 7,
        id_solicitud: 15,
        id_tecnico: 5,
        estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3, tipo_servicio: 'PROGRAMADO' },
      });
      mockModels.Cotizacion.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.Tecnico.findByPk.mockResolvedValue({ id_tecnico: 5, id_usuario: 30 });
      mockModels.Cotizacion.findAll.mockResolvedValue([{ id_tecnico: 6 }]);
      
      // Mock para las búsquedas post-commit
      mockModels.Cita.findOne.mockResolvedValue({ id_cita: 100 });
      mockModels.Servicio.findOne.mockResolvedValue(null);

      await aceptarCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockSocketEmitter.emitCotizacionAceptada).toHaveBeenCalled();
      expect(mockCotizacionBatcher.cancelBatch).toHaveBeenCalledWith(15);
    });
  });

  // =====================================================================
  // rechazarCotizacion
  // =====================================================================
  describe('rechazarCotizacion', () => {
    it('debe rechazar cotización exitosamente → 200', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 8, id_solicitud: 15, estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3 },
      });
      mockModels.Cotizacion.update.mockResolvedValue([1]);
      mockModels.Cotizacion.count.mockResolvedValue(1); // still has pending

      await rechazarCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.solicitud_revertida).toBe(false);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe revertir solicitud a BUSCANDO_TECNICOS si no quedan pendientes', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 8, id_solicitud: 15, estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3 },
      });
      mockModels.Cotizacion.update.mockResolvedValue([1]);
      mockModels.Cotizacion.count.mockResolvedValue(0); // no more pending
      mockModels.Solicitud.update.mockResolvedValue([1]);

      await rechazarCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.solicitud_revertida).toBe(true);
      expect(mockModels.Solicitud.update).toHaveBeenCalled();
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: '0' };

      await rechazarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si cliente no encontrado', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 999 };
      mockModels.Cliente.findOne.mockResolvedValue(null);

      await rechazarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 404 si cotización no encontrada', async () => {
      req.params = { id: '999' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue(null);

      await rechazarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si cotización no está PENDIENTE', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 8, estado: 'RECHAZADA',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3 },
      });

      await rechazarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 403 si solicitud no pertenece al cliente', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 10 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 8, estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 99, id_estado: 3 },
      });

      await rechazarCotizacion(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe emitir WebSocket al rechazar cotización → 200', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 10 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Cotizacion.findByPk.mockResolvedValue({
        id_cotizacion: 8, id_solicitud: 15, id_tecnico: 6, estado: 'PENDIENTE',
        solicitud: { id_solicitud: 15, id_cliente: 3, id_estado: 3 },
      });
      mockModels.Cotizacion.update.mockResolvedValue([1]);
      mockModels.Cotizacion.count.mockResolvedValue(1);
      mockModels.Tecnico.findByPk.mockResolvedValue({ id_usuario: 31 });

      await rechazarCotizacion(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockSocketEmitter.emitCotizacionRechazada).toHaveBeenCalled();
    });
  });
});
