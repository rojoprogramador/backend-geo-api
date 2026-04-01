import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
  Garantia: { findOne: jest.fn(), findAll: jest.fn() },
  Servicio: {},
  Cliente: {},
  Tecnico: {},
  Usuario: {},
  Subcategoria: {},
  EstadoSolicitud: {}
};

const mockHandleError = jest.fn((res, error) => {
  const sc = error.statusCode || 500;
  return res.status(sc).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
  });
});

const mockProfileHelpers = {
  obtenerCliente: jest.fn(),
  obtenerTecnico: jest.fn(),
};

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../../../utils/profileHelpers.js', () => mockProfileHelpers);

const { ValidationError, NotFoundError, ForbiddenError } = await import('../../../utils/errors/AppError.js');
const { 
    obtenerGarantiaPorServicio, 
    obtenerMisGarantiasCliente, 
    obtenerMisGarantiasTecnico 
} = await import('../../../controllers/garantiaController.js');

describe('garantiaController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
  });

  describe('obtenerGarantiaPorServicio', () => {
    it('debe retornar 400 si id_servicio no es válido', async () => {
      req.params = { id_servicio: 'abc' };

      await obtenerGarantiaPorServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('debe retornar 404 si la garantía no existe', async () => {
      req.params = { id_servicio: '10' };
      mockModels.Garantia.findOne.mockResolvedValue(null);

      await obtenerGarantiaPorServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(NotFoundError);
    });

    it('debe retornar 403 si el cliente no es el dueño', async () => {
      req.params = { id_servicio: '10' };
      req.usuario = { id_usuario: 5, rol: 'CLIENTE' };
      
      mockModels.Garantia.findOne.mockResolvedValue({
        id_garantia: 1,
        servicio: { id_cliente: 99 } // Dueño es 99
      });
      mockProfileHelpers.obtenerCliente.mockResolvedValue({ id_cliente: 3 });

      await obtenerGarantiaPorServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 403 si el técnico no es el asignado', async () => {
      req.params = { id_servicio: '10' };
      req.usuario = { id_usuario: 5, rol: 'TECNICO' };
      
      mockModels.Garantia.findOne.mockResolvedValue({
        id_garantia: 1,
        servicio: { id_tecnico: 99 } // Tecnico es 99
      });
      mockProfileHelpers.obtenerTecnico.mockResolvedValue({ id_tecnico: 3 });

      await obtenerGarantiaPorServicio(req, res);

      const err = mockHandleError.mock.calls[0][1];
      expect(err).toBeInstanceOf(ForbiddenError);
    });

    it('debe retornar 200 si es el cliente correcto', async () => {
      req.params = { id_servicio: '10' };
      req.usuario = { id_usuario: 5, rol: 'CLIENTE' };
      
      const mockGarantia = {
        id_garantia: 1,
        servicio: { id_cliente: 3 }
      };

      mockModels.Garantia.findOne.mockResolvedValue(mockGarantia);
      mockProfileHelpers.obtenerCliente.mockResolvedValue({ id_cliente: 3 });

      await obtenerGarantiaPorServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.data).toEqual(mockGarantia);
    });

    it('debe retornar 200 si es el rol ADMIN sin checkear pertenencia', async () => {
      req.params = { id_servicio: '10' };
      req.usuario = { id_usuario: 1, rol: 'ADMIN' };
      
      const mockGarantia = {
        id_garantia: 1,
        servicio: { id_cliente: 99 }
      };

      mockModels.Garantia.findOne.mockResolvedValue(mockGarantia);

      await obtenerGarantiaPorServicio(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
    });
  });

  describe('obtenerMisGarantiasCliente', () => {
    it('debe listar las garantías del cliente exitosamente', async () => {
      req.usuario = { id_usuario: 10 };
      mockProfileHelpers.obtenerCliente.mockResolvedValue({ id_cliente: 5 });
      
      const mockLista = [
        { id_garantia: 1 }, { id_garantia: 2 }
      ];
      mockModels.Garantia.findAll.mockResolvedValue(mockLista);

      await obtenerMisGarantiasCliente(req, res);

      expect(mockModels.Garantia.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
            include: expect.arrayContaining([
                expect.objectContaining({
                    where: { id_cliente: 5 }
                })
            ])
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.total).toBe(2);
    });
  });

  describe('obtenerMisGarantiasTecnico', () => {
    it('debe listar las garantías emitidas por el técnico exitosamente', async () => {
      req.usuario = { id_usuario: 20 };
      mockProfileHelpers.obtenerTecnico.mockResolvedValue({ id_tecnico: 8 });
      
      const mockLista = [
        { id_garantia: 3 }
      ];
      mockModels.Garantia.findAll.mockResolvedValue(mockLista);

      await obtenerMisGarantiasTecnico(req, res);

      expect(mockModels.Garantia.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
            include: expect.arrayContaining([
                expect.objectContaining({
                    where: { id_tecnico: 8 }
                })
            ])
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.total).toBe(1);
    });
  });
});
