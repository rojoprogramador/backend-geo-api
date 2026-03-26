import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
  sequelize: { transaction: jest.fn(), query: jest.fn(), fn: jest.fn(), col: jest.fn() },
  Cliente: { findOne: jest.fn() },
  Tecnico: { findOne: jest.fn() },
  Solicitud: { create: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn() },
  EstadoSolicitud: {},
  Subcategoria: { findByPk: jest.fn() },
  Categoria: {},
  TecnicoSolicitudQueue: { bulkCreate: jest.fn(), findAndCountAll: jest.fn(), update: jest.fn() },
  Cita: { create: jest.fn(), update: jest.fn() },
  Usuario: {},
  MotivoCancelacion: { findAll: jest.fn() },
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

const mockSocketEmitter = { emitNuevaSolicitud: jest.fn() };

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../../../sockets/services/socketEmitter.js', () => mockSocketEmitter);

const { ValidationError, NotFoundError, ForbiddenError } =
  await import('../../../utils/errors/AppError.js');

const {
  crearSolicitudInmediata,
  crearSolicitudProgramada,
  obtenerMisSolicitudes,
  obtenerSolicitudPorId,
  obtenerSolicitudesTecnico,
  obtenerMotivosCancelacion,
  cancelarSolicitud,
} = await import('../../../controllers/solicitudController.js');

// -----------------------------------------------------------------------

describe('solicitudController', () => {
  let req, res;

  const VALID_INMEDIATA = {
    id_subcategoria: 1,
    descripcion: 'Tubería rota en el baño, necesito reparación urgente por favor.',
    latitud: 3.4516,
    longitud: -76.532,
    prioridad: 'URGENTE',
  };

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // =====================================================================
  // crearSolicitudInmediata
  // =====================================================================
  describe('crearSolicitudInmediata', () => {
    const setupSuccessMocks = (tecnicosEncontrados = []) => {
      mockModels.Subcategoria.findByPk.mockResolvedValue({ id_subcategoria: 1 });
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.sequelize.query.mockResolvedValue(tecnicosEncontrados);
      mockModels.Solicitud.create.mockResolvedValue({
        id_solicitud: 15,
        tipo_servicio: 'INMEDIATO',
        id_estado: tecnicosEncontrados.length > 0 ? 2 : 1,
        prioridad: 'URGENTE',
        id_subcategoria: 1,
        fecha_solicitud: new Date(),
      });
    };

    it('debe crear solicitud inmediata con técnicos → 201', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA };
      const tecnicos = [{ id_tecnico: 1, prom_calificacion: 4.5, distancia_metros: 1500 }];
      setupSuccessMocks(tecnicos);

      await crearSolicitudInmediata(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.data.tecnicos_notificados).toBe(1);
      expect(mockModels.TecnicoSolicitudQueue.bulkCreate).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe incluir direccion_servicio en la respuesta', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA, direccion: '  Calle 5 #23-45, Cali  ' };
      setupSuccessMocks([]);

      await crearSolicitudInmediata(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.data.direccion_servicio).toBe('Calle 5 #23-45, Cali');
      expect(res.jsonData.data.fecha_programada).toBeNull();
    });

    it('debe crear solicitud sin técnicos disponibles → 201 PENDIENTE', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA };
      setupSuccessMocks([]);

      await crearSolicitudInmediata(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.data.tecnicos_notificados).toBe(0);
      expect(res.jsonData.data.id_estado).toBe(1);
    });

    it('debe retornar 400 si faltan campos requeridos', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { descripcion: 'Solo descripción sin demás campos' };

      await crearSolicitudInmediata(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con latitud fuera de rango', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA, latitud: 200 };

      await crearSolicitudInmediata(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con descripción muy corta', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA, descripcion: 'Corta' };

      await crearSolicitudInmediata(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con prioridad inválida', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA, prioridad: 'INVALIDA' };

      await crearSolicitudInmediata(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si subcategoría no existe', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA };
      mockModels.Subcategoria.findByPk.mockResolvedValue(null);

      await crearSolicitudInmediata(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si cliente no encontrado', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA };
      mockModels.Subcategoria.findByPk.mockResolvedValue({ id_subcategoria: 1 });
      mockModels.Cliente.findOne.mockResolvedValue(null);

      await crearSolicitudInmediata(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // crearSolicitudProgramada
  // =====================================================================
  describe('crearSolicitudProgramada', () => {
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    it('debe crear solicitud programada → 201', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA, fecha_programada: futureDate };
      mockModels.Subcategoria.findByPk.mockResolvedValue({ id_subcategoria: 1 });
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.sequelize.query.mockResolvedValue([]);
      mockModels.Solicitud.create.mockResolvedValue({
        id_solicitud: 17, tipo_servicio: 'PROGRAMADO', id_estado: 1,
        prioridad: 'URGENTE', id_subcategoria: 1, fecha_solicitud: new Date(),
      });
      mockModels.Cita.create.mockResolvedValue({
        id_cita: 9, fecha_cita: futureDate, id_estado: 1,
      });

      await crearSolicitudProgramada(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.data.tipo_servicio).toBe('PROGRAMADO');
      expect(res.jsonData.data.cita).toBeDefined();
    });

    it('debe crear solicitud programada con técnicos notificados → 201', async () => {
      req.usuario = { id_usuario: 5 };
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      req.body = { ...VALID_INMEDIATA, fecha_programada: futureDate };

      const tecnicos = [{ id_tecnico: 2, id_usuario: 8, prom_calificacion: 4.0, distancia_metros: 2000 }];
      mockModels.Subcategoria.findByPk.mockResolvedValue({ id_subcategoria: 1 });
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.sequelize.query.mockResolvedValue(tecnicos);
      mockModels.Solicitud.create.mockResolvedValue({
        id_solicitud: 18, tipo_servicio: 'PROGRAMADO', id_estado: 2,
        prioridad: 'URGENTE', id_subcategoria: 1, fecha_solicitud: new Date(), createdAt: new Date(),
      });
      mockModels.Cita.create.mockResolvedValue({ id_cita: 10, fecha_cita: futureDate, id_estado: 1 });
      mockModels.TecnicoSolicitudQueue.bulkCreate.mockResolvedValue([]);

      await crearSolicitudProgramada(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockModels.TecnicoSolicitudQueue.bulkCreate).toHaveBeenCalled();
      expect(mockSocketEmitter.emitNuevaSolicitud).toHaveBeenCalled();
    });

    it('debe retornar 400 si falta fecha_programada', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA }; // no fecha_programada

      await crearSolicitudProgramada(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si fecha_programada es menor a 24h', async () => {
      req.usuario = { id_usuario: 5 };
      const pastDate = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour
      req.body = { ...VALID_INMEDIATA, fecha_programada: pastDate };

      await crearSolicitudProgramada(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si fecha_programada no es parseable', async () => {
      req.usuario = { id_usuario: 5 };
      req.body = { ...VALID_INMEDIATA, fecha_programada: 'no-es-fecha' };

      await crearSolicitudProgramada(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors[0]).toContain('formato de fecha válido');
    });
  });

  // =====================================================================
  // obtenerMisSolicitudes
  // =====================================================================
  describe('obtenerMisSolicitudes', () => {
    it('debe retornar solicitudes paginadas → 200', async () => {
      req.usuario = { id_usuario: 5 };
      req.query = {};
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findAndCountAll.mockResolvedValue({ count: 2, rows: [] });

      await obtenerMisSolicitudes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.total).toBe(2);
    });

    it('debe retornar 400 con tipo_servicio inválido', async () => {
      req.usuario = { id_usuario: 5 };
      req.query = { tipo_servicio: 'INVALIDO' };

      await obtenerMisSolicitudes(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si cliente no encontrado', async () => {
      req.usuario = { id_usuario: 5 };
      req.query = {};
      mockModels.Cliente.findOne.mockResolvedValue(null);

      await obtenerMisSolicitudes(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // obtenerSolicitudPorId
  // =====================================================================
  describe('obtenerSolicitudPorId', () => {
    it('debe retornar solicitud como admin → 200', async () => {
      req.usuario = { id_usuario: 1, rol: 'ADMIN' };
      req.params = { id: '15' };
      const solicitudData = {
        id_solicitud: 15, id_cliente: 3, id_tecnico: null, tecnicos_notificados: [], citas: [],
      };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        ...solicitudData,
        toJSON: () => ({ ...solicitudData }),
      });

      await obtenerSolicitudPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar 400 con id inválido', async () => {
      req.usuario = { id_usuario: 1, rol: 'ADMIN' };
      req.params = { id: 'abc' };

      await obtenerSolicitudPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si no existe', async () => {
      req.usuario = { id_usuario: 1, rol: 'ADMIN' };
      req.params = { id: '999' };
      mockModels.Solicitud.findByPk.mockResolvedValue(null);

      await obtenerSolicitudPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si cliente no es propietario', async () => {
      req.usuario = { id_usuario: 5, rol: 'CLIENTE' };
      req.params = { id: '15' };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 99, id_tecnico: null, tecnicos_notificados: [],
      });
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 }); // different from 99

      await obtenerSolicitudPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar fecha_programada de la primera cita', async () => {
      req.usuario = { id_usuario: 1, rol: 'ADMIN' };
      req.params = { id: '15' };
      const fechaCita = '2026-04-01T10:00:00.000Z';
      const solicitudData = {
        id_solicitud: 15, id_cliente: 3, id_tecnico: null,
        tecnicos_notificados: [],
        citas: [{ id_cita: 9, fecha_cita: fechaCita, id_estado: 1 }],
      };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        ...solicitudData,
        toJSON: () => ({ ...solicitudData }),
      });

      await obtenerSolicitudPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.fecha_programada).toBe(fechaCita);
    });

    it('debe retornar solicitud como cliente propietario → 200', async () => {
      req.usuario = { id_usuario: 5, rol: 'CLIENTE' };
      req.params = { id: '15' };
      const solicitudData = {
        id_solicitud: 15, id_cliente: 3, id_tecnico: null,
        tecnicos_notificados: [], citas: [],
      };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        ...solicitudData,
        toJSON: () => ({ ...solicitudData }),
      });
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 }); // mismo id_cliente

      await obtenerSolicitudPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe permitir acceso a técnico asignado', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.params = { id: '15' };
      const solicitudData = {
        id_solicitud: 15, id_cliente: 3, id_tecnico: 5,
        tecnicos_notificados: [], citas: [],
      };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        ...solicitudData,
        toJSON: () => ({ ...solicitudData }),
      });
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });

      await obtenerSolicitudPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe permitir acceso a técnico en cola de notificados', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.params = { id: '15' };
      const solicitudData = {
        id_solicitud: 15, id_cliente: 3, id_tecnico: null,
        tecnicos_notificados: [{ id_tecnico: 5 }], citas: [],
      };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        ...solicitudData,
        toJSON: () => ({ ...solicitudData }),
      });
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });

      await obtenerSolicitudPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar 403 si técnico no tiene acceso', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.params = { id: '15' };
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 3, id_tecnico: 99,
        tecnicos_notificados: [{ id_tecnico: 88 }],
      });
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 }); // not 99 or 88

      await obtenerSolicitudPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });
  });

  // =====================================================================
  // obtenerSolicitudesTecnico
  // =====================================================================
  describe('obtenerSolicitudesTecnico', () => {
    it('debe retornar solicitudes pendientes → 200', async () => {
      req.usuario = { id_usuario: 10 };
      req.query = {};
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.TecnicoSolicitudQueue.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{
          id_cola: 1, priority_score: 80, estado_respuesta: 'NOTIFICADO',
          fecha_notificacion: new Date(), solicitud: {},
        }],
      });

      await obtenerSolicitudesTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.total).toBe(1);
    });

    it('debe retornar 404 si técnico no encontrado', async () => {
      req.usuario = { id_usuario: 10 };
      req.query = {};
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await obtenerSolicitudesTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // obtenerMotivosCancelacion
  // =====================================================================
  describe('obtenerMotivosCancelacion', () => {
    it('debe retornar motivos activos → 200', async () => {
      mockModels.MotivoCancelacion.findAll.mockResolvedValue([
        { id_motivo: 1, descripcion: 'Cliente no disponible', activo: true },
      ]);

      await obtenerMotivosCancelacion(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data).toHaveLength(1);
    });
  });

  // =====================================================================
  // cancelarSolicitud
  // =====================================================================
  describe('cancelarSolicitud', () => {
    it('debe cancelar solicitud exitosamente → 200', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '15' };
      req.body = { id_motivo_cancelacion: 1 };
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 3, id_estado: 2, id_tecnico: null,
        citas: [{ id_cita: 9, id_estado: 1 }],
        tecnicos_notificados: [{ id_cola: 1, estado_respuesta: 'NOTIFICADO' }],
        update: jest.fn(),
      });
      mockModels.TecnicoSolicitudQueue.update.mockResolvedValue([1]);

      await cancelarSolicitud(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.id_estado).toBe(7);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe retornar 400 con id inválido', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '0' };
      req.body = {};

      await cancelarSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si solicitud no existe', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '999' };
      req.body = {};
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue(null);

      await cancelarSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si solicitud no pertenece al cliente', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '15' };
      req.body = {};
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 99, id_estado: 2,
        citas: [], tecnicos_notificados: [],
      });

      await cancelarSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 400 si solicitud no es cancelable (EN_PROCESO)', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '15' };
      req.body = {};
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 3, id_estado: 5,
        citas: [], tecnicos_notificados: [],
      });

      await cancelarSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si solicitud ya está COMPLETADA', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '15' };
      req.body = {};
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 3, id_estado: 6,
        citas: [], tecnicos_notificados: [],
      });

      await cancelarSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors[0]).toContain('COMPLETADA');
    });

    it('debe retornar 400 si solicitud ya está CANCELADA', async () => {
      req.usuario = { id_usuario: 5 };
      req.params = { id: '15' };
      req.body = {};
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_cliente: 3, id_estado: 7,
        citas: [], tecnicos_notificados: [],
      });

      await cancelarSolicitud(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors[0]).toContain('CANCELADA');
    });
  });
});
