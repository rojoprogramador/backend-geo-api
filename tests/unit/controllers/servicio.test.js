import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
  sequelize: { transaction: jest.fn() },
  Servicio: { findOne: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn() },
  Solicitud: { findByPk: jest.fn(), update: jest.fn() },
  Cotizacion: {},
  Cliente: { findOne: jest.fn() },
  Tecnico: { findOne: jest.fn() },
  Subcategoria: {},
  EstadoSolicitud: {},
  MedioPago: { findByPk: jest.fn() },
  Transaccion: { create: jest.fn() },
  CuentaTecnico: { findOrCreate: jest.fn(), findOne: jest.fn() },
  Usuario: {},
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

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('sequelize', () => ({ Op: mockOp }));

const { ValidationError, NotFoundError, ForbiddenError, ConflictError } =
  await import('../../../utils/errors/AppError.js');

const {
  iniciarServicio,
  finalizarServicio,
  obtenerServiciosPorTecnico,
  obtenerServiciosPorCliente,
  obtenerServicioPorId,
} = await import('../../../controllers/servicioController.js');

// -----------------------------------------------------------------------

describe('servicioController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // =====================================================================
  // iniciarServicio
  // =====================================================================
  describe('iniciarServicio', () => {
    it('debe iniciar servicio exitosamente → 201', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_tecnico: 5, id_cliente: 3, id_subcategoria: 2,
        id_estado: 4, ubicacion_solicitud: 'POINT(-76.5 3.4)',
        estado: { descripcion: 'ASIGNADA' },
      });
      mockModels.Servicio.findOne.mockResolvedValue(null);
      mockModels.Servicio.create.mockResolvedValue({
        id_servicio: 8, id_solicitud: 15, id_cliente: 3, id_tecnico: 5,
        id_subcategoria: 2, id_estado: 5, valor_total: 0,
        fecha_servicio: new Date(), createdAt: new Date(),
      });
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.CuentaTecnico.findOrCreate.mockResolvedValue([{ id_cuenta: 1 }, false]);

      await iniciarServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe crear CuentaTecnico si no existe', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_tecnico: 5, id_cliente: 3, id_subcategoria: 2,
        id_estado: 4, estado: { descripcion: 'ASIGNADA' },
      });
      mockModels.Servicio.findOne.mockResolvedValue(null);
      mockModels.Servicio.create.mockResolvedValue({
        id_servicio: 9, id_solicitud: 15, id_cliente: 3, id_tecnico: 5,
        id_subcategoria: 2, id_estado: 5, valor_total: 0,
      });
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.CuentaTecnico.findOrCreate.mockResolvedValue([{ id_cuenta: 2 }, true]); // created

      await iniciarServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockModels.CuentaTecnico.findOrCreate).toHaveBeenCalled();
    });

    it('debe retornar 400 con id_solicitud inválido', async () => {
      req.params = { id_solicitud: 'abc' };

      await iniciarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no encontrado', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 999 };
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await iniciarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 404 si solicitud no encontrada', async () => {
      req.params = { id_solicitud: '999' };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue(null);

      await iniciarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si técnico no es el asignado', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_tecnico: 99, id_estado: 4,
        estado: { descripcion: 'ASIGNADA' },
      });

      await iniciarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 409 si solicitud no está ASIGNADA', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_tecnico: 5, id_estado: 6,
        estado: { descripcion: 'COMPLETADA' },
      });

      await iniciarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 409 si ya existe servicio para la solicitud', async () => {
      req.params = { id_solicitud: '15' };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Solicitud.findByPk.mockResolvedValue({
        id_solicitud: 15, id_tecnico: 5, id_estado: 4,
        estado: { descripcion: 'ASIGNADA' },
      });
      mockModels.Servicio.findOne.mockResolvedValue({ id_servicio: 8 }); // already exists

      await iniciarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });
  });

  // =====================================================================
  // finalizarServicio
  // =====================================================================
  describe('finalizarServicio', () => {
    const mockCuenta = {
      increment: jest.fn(),
    };

    it('debe finalizar servicio con valor_total del body → 200', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1, valor_total: 180000, imagenes: 'foto1.jpg' };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_solicitud: 15, id_tecnico: 5, id_estado: 5,
        estado: { descripcion: 'EN_PROCESO' },
        solicitud_origen: { id_solicitud: 15, id_estado: 5, cotizaciones: [] },
      });
      mockModels.MedioPago.findByPk.mockResolvedValue({ id_medioPago: 1, descripcion: 'EFECTIVO' });
      mockModels.Servicio.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.Transaccion.create.mockResolvedValue({
        id_transaccion: 5, monto_total: 180000,
        comision_plataforma: 27000, monto_tecnico: 153000,
        metodo_cobro: 'PLATAFORMA', estado_pago: 'PENDIENTE',
      });
      mockModels.CuentaTecnico.findOne.mockResolvedValue(mockCuenta);

      await finalizarServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockCuenta.increment).toHaveBeenCalled();
      // Verify 15% commission: 180000 * 0.15 = 27000
      expect(res.jsonData.data.transaccion.comision_plataforma).toBe(27000);
      expect(res.jsonData.data.transaccion.monto_tecnico).toBe(153000);
    });

    it('debe usar valor de cotización ACEPTADA si no se envía valor_total', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 2 };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_solicitud: 15, id_tecnico: 5, id_estado: 5,
        estado: { descripcion: 'EN_PROCESO' },
        solicitud_origen: {
          id_solicitud: 15, id_estado: 5,
          cotizaciones: [{ id_cotizacion: 7, valor_cotizacion: 95000 }],
        },
      });
      mockModels.MedioPago.findByPk.mockResolvedValue({ id_medioPago: 2 });
      mockModels.Servicio.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.Transaccion.create.mockResolvedValue({
        id_transaccion: 6, monto_total: 95000,
        comision_plataforma: 14250, monto_tecnico: 80750,
        metodo_cobro: 'PLATAFORMA', estado_pago: 'PENDIENTE',
      });
      mockModels.CuentaTecnico.findOne.mockResolvedValue(mockCuenta);

      await finalizarServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.valor_total).toBe(95000);
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: '-1' };
      req.body = { id_medioPago: 1 };

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si falta id_medioPago', async () => {
      req.params = { id: '8' };
      req.body = {};

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si valor_total <= 0', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1, valor_total: -100 };

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no encontrado', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1 };
      req.usuario = { id_usuario: 999 };
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 404 si servicio no encontrado', async () => {
      req.params = { id: '999' };
      req.body = { id_medioPago: 1 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue(null);

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si técnico no es el asignado', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_tecnico: 99, id_estado: 5,
        estado: { descripcion: 'EN_PROCESO' },
      });

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 409 si servicio no está EN_PROCESO', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_tecnico: 5, id_estado: 6,
        estado: { descripcion: 'COMPLETADA' },
      });

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 404 si medio de pago no existe', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 99 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_tecnico: 5, id_estado: 5,
        estado: { descripcion: 'EN_PROCESO' },
        solicitud_origen: { id_solicitud: 15, cotizaciones: [] },
      });
      mockModels.MedioPago.findByPk.mockResolvedValue(null);

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 400 si no hay cotización aceptada ni valor_total', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_solicitud: 15, id_tecnico: 5, id_estado: 5,
        estado: { descripcion: 'EN_PROCESO' },
        solicitud_origen: { id_solicitud: 15, id_estado: 5, cotizaciones: [] },
      });
      mockModels.MedioPago.findByPk.mockResolvedValue({ id_medioPago: 1 });

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si CuentaTecnico no encontrada', async () => {
      req.params = { id: '8' };
      req.body = { id_medioPago: 1, valor_total: 100000 };
      req.usuario = { id_usuario: 10 };
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findByPk.mockResolvedValue({
        id_servicio: 8, id_solicitud: 15, id_tecnico: 5, id_estado: 5,
        estado: { descripcion: 'EN_PROCESO' },
        solicitud_origen: { id_solicitud: 15, id_estado: 5, cotizaciones: [] },
      });
      mockModels.MedioPago.findByPk.mockResolvedValue({ id_medioPago: 1 });
      mockModels.Servicio.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);
      mockModels.Transaccion.create.mockResolvedValue({
        id_transaccion: 7, metodo_cobro: 'PLATAFORMA', estado_pago: 'PENDIENTE',
      });
      mockModels.CuentaTecnico.findOne.mockResolvedValue(null);

      await finalizarServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // obtenerServiciosPorTecnico
  // =====================================================================
  describe('obtenerServiciosPorTecnico', () => {
    it('debe retornar servicios del técnico → 200', async () => {
      req.query = { page: '1', limit: '10' };
      req.usuario = { id_usuario: 10 };

      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });
      mockModels.Servicio.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: [
          {
            id_servicio: 8, id_solicitud: 15, valor_total: 180000,
            fecha_servicio: new Date(), imagenes: null, createdAt: new Date(),
            solicitud_origen: { id_solicitud: 15, descripcion: 'Reparación', prioridad: 'MEDIA', tipo_servicio: 'INMEDIATO', fecha_solicitud: new Date() },
            subcategoria: { id_subcategoria: 2, nombre: 'Plomería' },
            estado: { id_estado: 6, descripcion: 'COMPLETADA' },
            cliente: { id_cliente: 3, datos_usuario: { id_usuario: 1, nombre: 'Juan', apellido: 'López', telefono: '3001234567' } },
            transaccion: { id_transaccion: 5, monto_total: 180000, monto_tecnico: 153000, comision_plataforma: 27000, estado_pago: 'PENDIENTE' },
          },
        ],
      });

      await obtenerServiciosPorTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.total).toBe(2);
    });

    it('debe retornar 400 con page inválido', async () => {
      req.query = { page: '0' };

      await obtenerServiciosPorTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con limit > 100', async () => {
      req.query = { limit: '200' };

      await obtenerServiciosPorTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no encontrado', async () => {
      req.query = {};
      req.usuario = { id_usuario: 999 };
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await obtenerServiciosPorTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // obtenerServiciosPorCliente
  // =====================================================================
  describe('obtenerServiciosPorCliente', () => {
    it('debe retornar servicios del cliente → 200', async () => {
      req.query = { page: '1', limit: '10' };
      req.usuario = { id_usuario: 1 };

      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });
      mockModels.Servicio.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            id_servicio: 8, id_solicitud: 15, valor_total: 180000,
            fecha_servicio: new Date(), imagenes: null, createdAt: new Date(),
            solicitud_origen: { id_solicitud: 15, descripcion: 'Reparación', prioridad: 'MEDIA', tipo_servicio: 'INMEDIATO', fecha_solicitud: new Date() },
            subcategoria: { id_subcategoria: 2, nombre: 'Plomería' },
            estado: { id_estado: 6, descripcion: 'COMPLETADA' },
            tecnico: { id_tecnico: 5, prom_calificacion: 4.5, datos_usuario: { id_usuario: 10, nombre: 'Andrés', apellido: 'Martínez', telefono: '3109876543' } },
            transaccion: { id_transaccion: 5, monto_total: 180000, estado_pago: 'PENDIENTE' },
          },
        ],
      });

      await obtenerServiciosPorCliente(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.total).toBe(1);
    });

    it('debe retornar 400 con page inválido', async () => {
      req.query = { page: '-1' };

      await obtenerServiciosPorCliente(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si cliente no encontrado', async () => {
      req.query = {};
      req.usuario = { id_usuario: 999 };
      mockModels.Cliente.findOne.mockResolvedValue(null);

      await obtenerServiciosPorCliente(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // obtenerServicioPorId
  // =====================================================================
  describe('obtenerServicioPorId', () => {
    const mockServicioCompleto = {
      id_servicio: 8, id_solicitud: 15, id_cliente: 3, id_tecnico: 5,
      valor_total: 180000, fecha_servicio: new Date(), imagenes: null,
      createdAt: new Date(), updatedAt: new Date(),
      solicitud_origen: {
        id_solicitud: 15, descripcion: 'Reparación', prioridad: 'MEDIA',
        tipo_servicio: 'INMEDIATO', fecha_solicitud: new Date(),
        cotizaciones: [{ id_cotizacion: 7, valor_cotizacion: 180000, estado: 'ACEPTADA', tiempo_estimado: '2h', incluye_materiales: true }],
      },
      subcategoria: { id_subcategoria: 2, nombre: 'Plomería' },
      estado: { id_estado: 6, descripcion: 'COMPLETADA' },
      medio_pago: { id_medioPago: 1, descripcion: 'EFECTIVO' },
      cliente: { id_cliente: 3, datos_usuario: { id_usuario: 1, nombre: 'Juan', apellido: 'López', telefono: '3001234567', correo_electronico: 'juan@test.com' } },
      tecnico: { id_tecnico: 5, prom_calificacion: 4.5, datos_usuario: { id_usuario: 10, nombre: 'Andrés', apellido: 'Martínez', telefono: '3109876543' } },
      transaccion: {
        id_transaccion: 5, monto_total: 180000, monto_tecnico: 153000, comision_plataforma: 27000,
        metodo_cobro: 'PLATAFORMA', estado_pago: 'PENDIENTE', fecha_pago: null, comprobante_url: null,
        medio_pago: { id_medioPago: 1, descripcion: 'EFECTIVO' },
      },
    };

    it('debe retornar servicio como admin → 200', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 100, rol: 'ADMIN' };

      mockModels.Servicio.findByPk.mockResolvedValue(mockServicioCompleto);

      await obtenerServicioPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.id_servicio).toBe(8);
    });

    it('debe retornar servicio como cliente propietario → 200', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 1, rol: 'CLIENTE' };

      mockModels.Servicio.findByPk.mockResolvedValue(mockServicioCompleto);
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 3 });

      await obtenerServicioPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar servicio como técnico asignado → 200', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };

      mockModels.Servicio.findByPk.mockResolvedValue(mockServicioCompleto);
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 5 });

      await obtenerServicioPorId(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar 400 con id inválido', async () => {
      req.params = { id: 'abc' };

      await obtenerServicioPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si servicio no encontrado', async () => {
      req.params = { id: '999' };
      req.usuario = { id_usuario: 100, rol: 'ADMIN' };
      mockModels.Servicio.findByPk.mockResolvedValue(null);

      await obtenerServicioPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si cliente no es propietario', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 50, rol: 'CLIENTE' };

      mockModels.Servicio.findByPk.mockResolvedValue(mockServicioCompleto);
      mockModels.Cliente.findOne.mockResolvedValue({ id_cliente: 99 }); // different client

      await obtenerServicioPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 403 si técnico no es el asignado', async () => {
      req.params = { id: '8' };
      req.usuario = { id_usuario: 50, rol: 'TECNICO' };

      mockModels.Servicio.findByPk.mockResolvedValue(mockServicioCompleto);
      mockModels.Tecnico.findOne.mockResolvedValue({ id_tecnico: 99 }); // different tech

      await obtenerServicioPorId(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });
  });
});
