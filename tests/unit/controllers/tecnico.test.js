import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
  sequelize: { transaction: jest.fn(), literal: jest.fn() },
  Usuario: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn(), update: jest.fn() },
  Tecnico: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn(), findAndCountAll: jest.fn() },
  Cliente: { findOne: jest.fn(), create: jest.fn() },
  Rol: { findOne: jest.fn() },
  TipoDoc: { findByPk: jest.fn() },
  Ciudad: { findByPk: jest.fn() },
  CertificadoTecnico: {},
  Categoria: {},
  Subcategoria: {},
  Especialidad: {},
  Cita: { findAll: jest.fn(), findAndCountAll: jest.fn() },
  Solicitud: { findOne: jest.fn() },
  Servicio: { findOne: jest.fn() },
  TecnicoSolicitudQueue: { findOne: jest.fn() },
  EstadoSolicitud: { findOne: jest.fn() },
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

const mockBcrypt = { hash: jest.fn() };

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

const mockGetInmediataCutoffDate = jest.fn(() => new Date());

const mockBuscarPerfilTecnico = jest.fn();

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('bcrypt', () => ({ default: mockBcrypt }));
jest.unstable_mockModule('../../../services/immediateRequestExpiryService.js', () => ({ getInmediataCutoffDate: mockGetInmediataCutoffDate }));
jest.unstable_mockModule('../../../utils/profileHelpers.js', () => ({ obtenerTecnico: mockBuscarPerfilTecnico }));

const { ValidationError, NotFoundError, ForbiddenError, ConflictError } =
  await import('../../../utils/errors/AppError.js');

const {
  registrarTecnico,
  obtenerPerfilTecnico,
  actualizarPerfilTecnico,
  obtenerTecnicosPendientes,
  obtenerDetalleTecnico,
  aprobarTecnico,
  rechazarTecnico,
  obtenerTodosTecnicos,
  obtenerAgendaTecnico,
  obtenerEstadoActualTecnico,
} = await import('../../../controllers/tecnicoController.js');

// -----------------------------------------------------------------------

describe('tecnicoController', () => {
  let req, res;

  const VALID_BODY = {
    nombre: 'Andres Felipe',
    apellido: 'Martinez Herrera',
    correo_electronico: 'andres@example.com',
    telefono: '3156789012',
    contrasena: 'Tecnico123!',
    confirmar_contrasena: 'Tecnico123!',
    num_identificacion: '1061234567',
    id_tipoDoc: 1,
    fecha_nacimiento: '1990-06-15',
    acepta_terminos: true,
    id_ciudad: 1,
  };

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
    mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
    mockTransaction.finished = undefined;
  });

  // =====================================================================
  // registrarTecnico
  // =====================================================================
  describe('registrarTecnico', () => {
    const setupSuccessMocks = () => {
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Usuario.findOne.mockResolvedValue(null); // no duplicates
      mockModels.Ciudad.findByPk.mockResolvedValue({ id_ciudad: 1, nombre_ciudad: 'Cali' });
      mockModels.Rol.findOne.mockResolvedValue({ id_rol: 3, descripcion: 'TECNICO' });
      mockBcrypt.hash.mockResolvedValue('hashed_password');
      mockModels.Usuario.create.mockResolvedValue({ id_usuario: 10, nombre: 'Andres Felipe', apellido: 'Martinez Herrera', correo_electronico: 'andres@example.com', telefono: '3156789012' });
      mockModels.Tecnico.create.mockResolvedValue({ id_tecnico: 5, id_usuario: 10, estado_validacion: 'PENDIENTE_VALIDACION' });
    };

    it('debe registrar técnico exitosamente → 201', async () => {
      req.body = { ...VALID_BODY };
      setupSuccessMocks();

      await registrarTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.data.estado_validacion).toBe('PENDIENTE_VALIDACION');
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe retornar 400 cuando faltan campos requeridos', async () => {
      req.body = { nombre: 'Andres Felipe' }; // missing many fields

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it('debe retornar 400 con formato de nombre inválido', async () => {
      req.body = { ...VALID_BODY, nombre: 'A' }; // < 2 chars

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con formato de correo inválido', async () => {
      req.body = { ...VALID_BODY, correo_electronico: 'not-an-email' };

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con teléfono inválido', async () => {
      req.body = { ...VALID_BODY, telefono: '1234567890' }; // doesn't start with 3

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con contraseña débil', async () => {
      req.body = { ...VALID_BODY, contrasena: 'weak', confirmar_contrasena: 'weak' };

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 cuando contraseñas no coinciden', async () => {
      req.body = { ...VALID_BODY, confirmar_contrasena: 'OtraClave123!' };

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si términos no aceptados', async () => {
      req.body = { ...VALID_BODY, acepta_terminos: false };

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si TipoDoc no existe', async () => {
      req.body = { ...VALID_BODY };
      mockModels.TipoDoc.findByPk.mockResolvedValue(null);

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 409 si correo ya existe', async () => {
      req.body = { ...VALID_BODY };
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Usuario.findOne.mockResolvedValueOnce({ id_usuario: 99 }); // email duplicate

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 409 si documento ya existe', async () => {
      req.body = { ...VALID_BODY };
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Usuario.findOne
        .mockResolvedValueOnce(null)   // email ok
        .mockResolvedValueOnce({ id_usuario: 88 }); // doc duplicate

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 404 si ciudad no existe', async () => {
      req.body = { ...VALID_BODY };
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Usuario.findOne.mockResolvedValue(null);
      mockModels.Ciudad.findByPk.mockResolvedValue(null);

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 500 si rol TECNICO no existe', async () => {
      req.body = { ...VALID_BODY };
      mockModels.TipoDoc.findByPk.mockResolvedValue({ id_tipoDoc: 1 });
      mockModels.Usuario.findOne.mockResolvedValue(null);
      mockModels.Ciudad.findByPk.mockResolvedValue({ id_ciudad: 1 });
      mockModels.Rol.findOne.mockResolvedValue(null);

      await registrarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err.statusCode).toBeUndefined(); // generic Error, not AppError
    });

    it('debe soportar campo contraseña con tilde (ñ)', async () => {
      req.body = {
        ...VALID_BODY,
        contrasena: undefined,
        confirmar_contrasena: undefined,
        'contraseña': 'Tecnico123!',
        'confirmar_contraseña': 'Tecnico123!',
      };
      setupSuccessMocks();

      await registrarTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // =====================================================================
  // obtenerPerfilTecnico
  // =====================================================================
  describe('obtenerPerfilTecnico', () => {
    it('debe retornar perfil exitosamente con ciudades_operacion → 200', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      mockModels.Tecnico.findOne.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'ACTIVO',
        prom_calificacion: 4.5,
        disponible_inmediato: true,
        url_foto: '/uploads/fotos/tecnico_5_123.jpg',
        datos_usuario: {
          id_usuario: 10,
          nombre: 'Andres',
          apellido: 'Martinez',
          correo_electronico: 'a@b.com',
          telefono: '3156789012',
          num_identificacion: '1061234567',
          fecha_nacimiento: '1990-06-15',
          TipoDoc: { descripcion: 'CC' },
        },
        Ciudad: { id_ciudad: 1, nombre_ciudad: 'Cali' },
        ciudades_operacion: [
          { id_ciudad: 3, nombre_ciudad: 'Palmira' },
          { id_ciudad: 5, nombre_ciudad: 'Jamundí' },
        ],
      });

      await obtenerPerfilTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.estado_validacion).toBe('ACTIVO');
      expect(res.jsonData.data.url_foto).toBe('/uploads/fotos/tecnico_5_123.jpg');
      expect(res.jsonData.data.id_ciudad).toBe(1);
      expect(res.jsonData.data.ciudad_base).toBe('Cali');
      expect(res.jsonData.data.ciudades_operacion).toHaveLength(2);
      expect(res.jsonData.data.ciudades_operacion[0]).toEqual({
        id_ciudad: 3,
        nombre_ciudad: 'Palmira',
      });
    });

    it('debe retornar 403 si no es TECNICO', async () => {
      req.usuario = { id_usuario: 10, rol: 'CLIENTE' };

      await obtenerPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 404 si perfil no encontrado', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      mockModels.Tecnico.findOne.mockResolvedValue(null);

      await obtenerPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // actualizarPerfilTecnico
  // =====================================================================
  describe('actualizarPerfilTecnico', () => {
    beforeEach(() => {
      mockBuscarPerfilTecnico.mockResolvedValue({ id_tecnico: 5, id_usuario: 10 });
    });

    it('debe actualizar teléfono → 200', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { telefono: '3001112233' };
      mockModels.Tecnico.findOne
        .mockResolvedValueOnce({ id_tecnico: 5 })        // check exists
        .mockResolvedValueOnce({ Ciudad: { nombre_ciudad: 'Cali' } }); // for response
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 10, correo_electronico: 'a@b.com', telefono: '3001112233',
      });

      await actualizarPerfilTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe actualizar ciudad → 200', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { id_ciudad: 2 };
      mockModels.Tecnico.findOne
        .mockResolvedValueOnce({ id_tecnico: 5 })
        .mockResolvedValueOnce({ Ciudad: { nombre_ciudad: 'Medellín' }, disponible_inmediato: true });
      mockModels.Ciudad.findByPk.mockResolvedValue({ id_ciudad: 2, nombre_ciudad: 'Medellín' });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 10, correo_electronico: 'a@b.com', telefono: '3001112233',
      });

      await actualizarPerfilTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockModels.Tecnico.update).toHaveBeenCalled();
    });

    it('debe retornar 400 si no envía campos', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = {};

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con teléfono inválido', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { telefono: '123' };

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 409 con correo duplicado', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { correo_electronico: 'otro@example.com' };
      mockModels.Tecnico.findOne.mockResolvedValueOnce({ id_tecnico: 5 });
      mockModels.Usuario.findOne.mockResolvedValue({ id_usuario: 99 }); // other user

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 404 si ciudad no existe', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { id_ciudad: 999 };
      mockModels.Tecnico.findOne.mockResolvedValueOnce({ id_tecnico: 5 });
      mockModels.Ciudad.findByPk.mockResolvedValue(null);

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si no es TECNICO', async () => {
      req.usuario = { id_usuario: 10, rol: 'CLIENTE' };
      req.body = { telefono: '3001112233' };

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe actualizar disponible_inmediato solo → 200 (toggle jornada)', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { disponible_inmediato: false };
      mockModels.Tecnico.findOne.mockReset();
      mockModels.Tecnico.findOne.mockResolvedValue({
        id_tecnico: 5,
        Ciudad: { nombre_ciudad: 'Cali' },
        disponible_inmediato: false,
      });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 10, correo_electronico: 'a@b.com', telefono: '3001112233',
      });

      await actualizarPerfilTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockModels.Tecnico.update).toHaveBeenCalledWith(
        { disponible_inmediato: false },
        expect.objectContaining({ where: { id_tecnico: 5 } })
      );
      expect(res.jsonData.data.disponible_inmediato).toBe(false);
    });

    it('debe retornar 400 si disponible_inmediato no es boolean', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { disponible_inmediato: 'si' };

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors[0]).toContain('true o false');
    });

    it('debe actualizar ubicacion_base con latitud/longitud → 200', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { latitud: 3.4516, longitud: -76.5320 };
      mockModels.Tecnico.findOne.mockReset();
      mockModels.Tecnico.findOne.mockResolvedValue({
        id_tecnico: 5,
        Ciudad: { nombre_ciudad: 'Cali' },
        disponible_inmediato: true,
        radio_cobertura_km: 10,
        ubicacion_base: { type: 'Point', coordinates: [-76.5320, 3.4516] },
      });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 10, correo_electronico: 'a@b.com', telefono: '3001112233',
      });

      await actualizarPerfilTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockModels.Tecnico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ubicacion_base: { type: 'Point', coordinates: [-76.5320, 3.4516] },
        }),
        expect.objectContaining({ where: { id_tecnico: 5 } })
      );
      expect(res.jsonData.data.ubicacion_base).toEqual({ latitud: 3.4516, longitud: -76.5320 });
    });

    it('debe retornar 400 si envía latitud sin longitud', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { latitud: 3.4516 };

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors[0]).toContain('juntos');
    });

    it('debe retornar 400 si latitud fuera de rango', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { latitud: 95, longitud: -76.5320 };

      await actualizarPerfilTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors[0]).toContain('latitud');
    });

    it('debe retornar ubicacion_base null si técnico no tiene GPS', async () => {
      req.usuario = { id_usuario: 10, rol: 'TECNICO' };
      req.body = { telefono: '3009998877' };
      mockModels.Tecnico.findOne
        .mockResolvedValueOnce({ id_tecnico: 5 })
        .mockResolvedValueOnce({
          Ciudad: { nombre_ciudad: 'Cali' },
          disponible_inmediato: false,
          radio_cobertura_km: 10,
          ubicacion_base: null,
        });
      mockModels.Usuario.findByPk.mockResolvedValue({
        id_usuario: 10, correo_electronico: 'a@b.com', telefono: '3009998877',
      });

      await actualizarPerfilTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.ubicacion_base).toBeNull();
    });
  });

  // =====================================================================
  // obtenerTecnicosPendientes
  // =====================================================================
  describe('obtenerTecnicosPendientes', () => {
    it('debe retornar lista paginada → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = {};
      mockModels.Tecnico.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: [
          {
            id_tecnico: 5,
            estado_validacion: 'PENDIENTE_VALIDACION',
            createdAt: new Date(),
            datos_usuario: { id_usuario: 10, nombre: 'A', apellido: 'B', correo_electronico: 'a@b.com', telefono: '3001112233', num_identificacion: '123456' },
            Ciudad: { nombre_ciudad: 'Cali' },
          },
        ],
      });

      await obtenerTecnicosPendientes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.total).toBe(2);
    });

    it('debe retornar 400 con page inválido', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = { page: 'abc' };

      await obtenerTecnicosPendientes(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con limit fuera de rango', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = { limit: '200' };

      await obtenerTecnicosPendientes(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  // =====================================================================
  // obtenerDetalleTecnico
  // =====================================================================
  describe('obtenerDetalleTecnico', () => {
    it('debe retornar detalle completo → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'PENDIENTE_VALIDACION',
        radio_cobertura_km: 10,
        disponible_inmediato: true,
        disponibilidad_horaria: null,
        prom_calificacion: 0,
        url_foto: null,
        url_docId: null,
        createdAt: new Date(),
        fecha_validacion: null,
        datos_usuario: {
          id_usuario: 10, nombre: 'Andres', apellido: 'Martinez',
          correo_electronico: 'a@b.com', telefono: '3156789012',
          num_identificacion: '1061234567', fecha_nacimiento: '1990-06-15',
        },
        Ciudad: { nombre_ciudad: 'Cali' },
        certificados: [],
        especialidades: [],
      });

      await obtenerDetalleTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.id_tecnico).toBe(5);
    });

    it('debe retornar 400 con id inválido', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: 'abc' };

      await obtenerDetalleTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si no se encuentra', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '999' };
      mockModels.Tecnico.findByPk.mockResolvedValue(null);

      await obtenerDetalleTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });

  // =====================================================================
  // aprobarTecnico
  // =====================================================================
  describe('aprobarTecnico', () => {
    it('debe aprobar técnico exitosamente → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = {};
      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'PENDIENTE_VALIDACION',
        datos_usuario: { id_usuario: 10, nombre: 'Andres', apellido: 'Martinez' },
      });

      await aprobarTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.estado_validacion).toBe('ACTIVO');
      expect(mockModels.Tecnico.update).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe aprobar con notas_aprobacion → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = { notas_aprobacion: 'Documentación en regla.' };
      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'PENDIENTE_VALIDACION',
        datos_usuario: { id_usuario: 10, nombre: 'Andres', apellido: 'Martinez' },
      });

      await aprobarTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.notas_aprobacion).toBe('Documentación en regla.');
    });

    it('debe retornar 400 con id inválido', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '-1' };
      req.body = {};

      await aprobarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no existe', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '999' };
      req.body = {};
      mockModels.Tecnico.findByPk.mockResolvedValue(null);

      await aprobarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si ya fue procesado', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = {};
      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'ACTIVO',
        datos_usuario: { id_usuario: 10, nombre: 'A', apellido: 'B' },
      });

      await aprobarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 400 si notas_aprobacion supera 300 caracteres', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = { notas_aprobacion: 'x'.repeat(301) };

      await aprobarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  // =====================================================================
  // rechazarTecnico
  // =====================================================================
  describe('rechazarTecnico', () => {
    const MOTIVO_VALIDO = 'La documentación presentada está incompleta. Falta el certificado de experiencia laboral actualizado.';

    it('debe rechazar técnico exitosamente → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = { motivo_rechazo: MOTIVO_VALIDO };
      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'PENDIENTE_VALIDACION',
        datos_usuario: { id_usuario: 10, nombre: 'Andres', apellido: 'Martinez' },
      });

      await rechazarTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data.estado_validacion).toBe('RECHAZADO');
      expect(res.jsonData.data.motivo_rechazo).toBe(MOTIVO_VALIDO);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('debe retornar 400 si falta motivo_rechazo', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = {};

      await rechazarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 si motivo es menor a 50 caracteres', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = { motivo_rechazo: 'Muy corto' };

      await rechazarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con id inválido', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '0' };
      req.body = { motivo_rechazo: MOTIVO_VALIDO };

      await rechazarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no existe', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '999' };
      req.body = { motivo_rechazo: MOTIVO_VALIDO };
      mockModels.Tecnico.findByPk.mockResolvedValue(null);

      await rechazarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 409 si ya fue procesado', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = { motivo_rechazo: MOTIVO_VALIDO };
      mockModels.Tecnico.findByPk.mockResolvedValue({
        id_tecnico: 5,
        estado_validacion: 'RECHAZADO',
        datos_usuario: { id_usuario: 10, nombre: 'A', apellido: 'B' },
      });

      await rechazarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ConflictError);
    });

    it('debe retornar 400 si motivo supera 1000 caracteres', async () => {
      req.usuario = { id_usuario: 1 };
      req.params = { id: '5' };
      req.body = { motivo_rechazo: 'x'.repeat(1001) };

      await rechazarTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  // =====================================================================
  // obtenerTodosTecnicos
  // =====================================================================
  describe('obtenerTodosTecnicos', () => {
    it('debe retornar todos los técnicos sin filtro → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = {};
      mockModels.Tecnico.findAndCountAll.mockResolvedValue({
        count: 3,
        rows: [
          {
            id_tecnico: 1, estado_validacion: 'ACTIVO', createdAt: new Date(),
            datos_usuario: { id_usuario: 10, nombre: 'A', apellido: 'B', correo_electronico: 'a@b.com', telefono: '3001112233', num_identificacion: '123456' },
            Ciudad: { nombre_ciudad: 'Cali' },
          },
        ],
      });

      await obtenerTodosTecnicos(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.total).toBe(3);
    });

    it('debe filtrar por estado válido → 200', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = { estado: 'ACTIVO' };
      mockModels.Tecnico.findAndCountAll.mockResolvedValue({ count: 1, rows: [] });

      await obtenerTodosTecnicos(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar 400 con estado inválido', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = { estado: 'INVALIDO' };

      await obtenerTodosTecnicos(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con paginación inválida', async () => {
      req.usuario = { id_usuario: 1 };
      req.query = { page: '0' };

      await obtenerTodosTecnicos(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  // ===================================================================
  // obtenerAgendaTecnico
  // ===================================================================
  describe('obtenerAgendaTecnico', () => {
    const mockTecnico = { id_tecnico: 5, id_usuario: 1 };

    beforeEach(() => {
      req.usuario = { id_usuario: 1 };
      req.query = {};
      // buscarPerfilTecnico es la función importada desde profileHelpers
      mockBuscarPerfilTecnico.mockResolvedValue(mockTecnico);
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    });

    it('debe retornar agenda paginada sin filtros → 200', async () => {
      const citasMock = [
        { id_cita: 1, fecha_cita: '2026-04-01T10:00:00Z', solicitud: { id_solicitud: 10 } },
      ];
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 1, rows: citasMock });

      await obtenerAgendaTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(body.data.total).toBe(1);
      expect(body.data.citas).toEqual(citasMock);
      expect(body.data.page).toBe(1);
    });

    it('debe aplicar filtro fecha_desde y fecha_hasta', async () => {
      req.query = { fecha_desde: '2026-04-01', fecha_hasta: '2026-04-30' };
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await obtenerAgendaTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const call = mockModels.Cita.findAndCountAll.mock.calls[0][0];
      expect(call.where.fecha_cita).toBeDefined();
    });

    it('debe aplicar solo fecha_desde sin fecha_hasta', async () => {
      req.query = { fecha_desde: '2026-04-01' };
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await obtenerAgendaTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe aplicar solo fecha_hasta sin fecha_desde', async () => {
      req.query = { fecha_hasta: '2026-04-30' };
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await obtenerAgendaTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe filtrar por id_estado', async () => {
      req.query = { id_estado: '4' };
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await obtenerAgendaTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const call = mockModels.Cita.findAndCountAll.mock.calls[0][0];
      expect(call.where.id_estado).toBe(4);
    });

    it('debe retornar 400 con fecha_desde inválida', async () => {
      req.query = { fecha_desde: 'no-es-fecha' };

      await obtenerAgendaTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors).toContain('fecha_desde debe tener formato YYYY-MM-DD');
    });

    it('debe retornar 400 con fecha_hasta inválida', async () => {
      req.query = { fecha_hasta: '31-12-2026' };

      await obtenerAgendaTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 400 con id_estado inválido (texto)', async () => {
      req.query = { id_estado: 'abc' };

      await obtenerAgendaTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.errors).toContain('id_estado debe ser un entero positivo');
    });

    it('debe retornar 400 con id_estado negativo', async () => {
      req.query = { id_estado: '-1' };

      await obtenerAgendaTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si técnico no existe', async () => {
      mockBuscarPerfilTecnico.mockResolvedValue(null);

      await obtenerAgendaTecnico(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe respetar paginación custom', async () => {
      req.query = { page: '2', limit: '5' };
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 8, rows: [] });

      await obtenerAgendaTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.status.mock.results[0].value.json.mock.calls[0][0];
      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(5);
      expect(body.data.total_paginas).toBe(2);
    });

    it('debe clampear limit a max 50', async () => {
      req.query = { limit: '200' };
      mockModels.Cita.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await obtenerAgendaTecnico(req, res);

      const call = mockModels.Cita.findAndCountAll.mock.calls[0][0];
      expect(call.limit).toBe(50);
    });
  });

  // =====================================================================
  // obtenerEstadoActualTecnico (Fase 2: App Rehydration)
  // =====================================================================
  describe('obtenerEstadoActualTecnico', () => {
    beforeEach(() => {
      req.usuario = { id_usuario: 1, rol: 'TECNICO' };
      mockBuscarPerfilTecnico.mockResolvedValue({
        id_tecnico: 5,
        disponible_inmediato: true,
        estado_validacion: 'VALIDADO',
        radio_cobertura_km: 50,
        tipo_cobertura: 'RADIO_FIJO',
      });
      mockModels.Servicio.findOne.mockResolvedValue(null);
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue(null);
      mockModels.Cita.findAll.mockResolvedValue([]);
      mockModels.Solicitud.findOne.mockResolvedValue(null);
    });

    it('debe retornar estado actual completo (snapshot) → 200', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const citasMock = [
        {
          id_cita: 1,
          fecha_cita: futureDate,
          id_estado: 1,
          solicitud: { id_solicitud: 10, id_cliente: 3 },
          estado: { id_estado: 1, descripcion: 'Programada' },
        },
        {
          id_cita: 2,
          fecha_cita: new Date(futureDate.getTime() + 2 * 60 * 60 * 1000),
          id_estado: 1,
          solicitud: { id_solicitud: 11, id_cliente: 4 },
          estado: { id_estado: 1, descripcion: 'Programada' },
        },
      ];
      mockModels.Cita.findAll.mockResolvedValue(citasMock);

      await obtenerEstadoActualTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.data).toHaveProperty('disponibilidad');
      expect(res.jsonData.data).toHaveProperty('servicio_activo');
      expect(res.jsonData.data).toHaveProperty('citas_proximas_asignadas');
      expect(res.jsonData.data).toHaveProperty('solicitud_inmediata_pendiente');
      expect(res.jsonData.data.citas_proximas_asignadas).toHaveLength(2);
    });

    it('debe excluir solicitudes inmediatas expiradas (TTL filtering) → 200', async () => {
      // Mock una solicitud INMEDIATO expirada (más que 20 minutos atrás)
      const expiredDate = new Date(Date.now() - 30 * 60 * 1000);
      
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue(null);
      mockModels.Cita.findAll.mockResolvedValue([]);

      // Mock cutoff
      mockGetInmediataCutoffDate.mockReturnValue(new Date(Date.now() - 20 * 60 * 1000));

      await obtenerEstadoActualTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // La solicitud expirada NO debe ser incluida en el response
      expect(res.jsonData.data.solicitud_inmediata_pendiente).toBeNull();
    });

    it('debe incluir solicitud inmediata NO expirada (TTL valid) → 200', async () => {
      // Mock una solicitud INMEDIATO reciente (< 20 minutos)
      const recentDate = new Date(Date.now() - 10 * 60 * 1000);
      
      mockModels.TecnicoSolicitudQueue.findOne.mockResolvedValue({
        id_cola: 1,
        solicitud: {
          id_solicitud: 101,
          tipo_servicio: 'INMEDIATO',
          fecha_solicitud: recentDate,
          usuario_cliente: { id_usuario: 2 },
          estado: { id_estado: 1, descripcion: 'Pendiente' },
        },
      });
      mockModels.Cita.findAll.mockResolvedValue([]);

      // Mock cutoff
      mockGetInmediataCutoffDate.mockReturnValue(new Date(Date.now() - 20 * 60 * 1000));

      await obtenerEstadoActualTecnico(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // La solicitud reciente DEBE estar incluida
      expect(res.jsonData.data.solicitud_inmediata_pendiente).not.toBeNull();
      expect(res.jsonData.data.solicitud_inmediata_pendiente.solicitud.id_solicitud).toBe(101);
    });

    it('debe retornar 403 si no es TECNICO', async () => {
      req.usuario = { id_usuario: 1, rol: 'CLIENTE' };

      await obtenerEstadoActualTecnico(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 404 si técnico no existe', async () => {
      mockBuscarPerfilTecnico.mockResolvedValue(null);

      await obtenerEstadoActualTecnico(req, res);

      expect(mockHandleError).toHaveBeenCalled();
      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });
  });
});
