import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockModels = {
    Usuario: { findByPk: jest.fn(), update: jest.fn() },
    Notificacion: {
        findAndCountAll: jest.fn(),
        findByPk: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
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

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));

const { ValidationError, NotFoundError, ForbiddenError } =
    await import('../../../utils/errors/AppError.js');

const {
    registrarPushToken,
    obtenerMisNotificaciones,
    marcarComoLeida,
    marcarTodasLeidas,
} = await import('../../../controllers/notificacionController.js');

// -----------------------------------------------------------------------

describe('notificacionController', () => {
    let req, res;

    beforeEach(() => {
        req = createReqMock();
        res = createResMock();
        jest.clearAllMocks();
        req.usuario = { id_usuario: 1, rol: 'CLIENTE' };
    });

    // ===================================================================
    // registrarPushToken
    // ===================================================================
    describe('registrarPushToken', () => {
        it('debe registrar token exitosamente → 200', async () => {
            req.body = { expo_push_token: 'ExponentPushToken[abc123]' };
            mockModels.Usuario.update.mockResolvedValue([1]);

            await registrarPushToken(req, res);

            expect(mockModels.Usuario.update).toHaveBeenCalledWith(
                { expo_push_token: 'ExponentPushToken[abc123]' },
                { where: { id_usuario: 1 } }
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('debe retornar 400 si falta expo_push_token', async () => {
            req.body = {};

            await registrarPushToken(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('debe retornar 400 si token es string vacío', async () => {
            req.body = { expo_push_token: '   ' };

            await registrarPushToken(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('debe retornar 400 si token no es string', async () => {
            req.body = { expo_push_token: 12345 };

            await registrarPushToken(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    // ===================================================================
    // obtenerMisNotificaciones
    // ===================================================================
    describe('obtenerMisNotificaciones', () => {
        it('debe retornar notificaciones paginadas → 200', async () => {
            req.query = { page: '1', limit: '10' };
            const mockNotifs = [
                { id_notificacion: 1, tipo: 'NUEVA_SOLICITUD', titulo: 'Test', leida: false },
            ];
            mockModels.Notificacion.findAndCountAll.mockResolvedValue({
                count: 1,
                rows: mockNotifs,
            });
            mockModels.Notificacion.count.mockResolvedValue(1);

            await obtenerMisNotificaciones(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            const body = res.status.mock.results[0].value.json.mock.calls[0][0];
            expect(body.data.total).toBe(1);
            expect(body.data.no_leidas).toBe(1);
            expect(body.data.notificaciones).toEqual(mockNotifs);
        });

        it('debe filtrar por leida=false', async () => {
            req.query = { leida: 'false' };
            mockModels.Notificacion.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockModels.Notificacion.count.mockResolvedValue(0);

            await obtenerMisNotificaciones(req, res);

            const call = mockModels.Notificacion.findAndCountAll.mock.calls[0][0];
            expect(call.where.leida).toBe(false);
        });

        it('debe filtrar por leida=true', async () => {
            req.query = { leida: 'true' };
            mockModels.Notificacion.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockModels.Notificacion.count.mockResolvedValue(0);

            await obtenerMisNotificaciones(req, res);

            const call = mockModels.Notificacion.findAndCountAll.mock.calls[0][0];
            expect(call.where.leida).toBe(true);
        });

        it('debe ignorar leida con valor inválido (no true/false)', async () => {
            req.query = { leida: 'maybe' };
            mockModels.Notificacion.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockModels.Notificacion.count.mockResolvedValue(0);

            await obtenerMisNotificaciones(req, res);

            const call = mockModels.Notificacion.findAndCountAll.mock.calls[0][0];
            expect(call.where.leida).toBeUndefined();
        });
    });

    // ===================================================================
    // marcarComoLeida
    // ===================================================================
    describe('marcarComoLeida', () => {
        it('debe marcar notificación como leída → 200', async () => {
            req.params = { id: '5' };
            const mockNotif = {
                id_notificacion: 5,
                id_usuario: 1,
                leida: false,
                update: jest.fn(),
            };
            mockModels.Notificacion.findByPk.mockResolvedValue(mockNotif);

            await marcarComoLeida(req, res);

            expect(mockNotif.update).toHaveBeenCalledWith({ leida: true });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('debe retornar 404 si no existe', async () => {
            req.params = { id: '999' };
            mockModels.Notificacion.findByPk.mockResolvedValue(null);

            await marcarComoLeida(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('debe retornar 403 si no pertenece al usuario', async () => {
            req.params = { id: '5' };
            mockModels.Notificacion.findByPk.mockResolvedValue({
                id_notificacion: 5,
                id_usuario: 999, // otro usuario
                leida: false,
            });

            await marcarComoLeida(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('debe retornar 400 con id inválido', async () => {
            req.params = { id: 'abc' };

            await marcarComoLeida(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('debe retornar 400 con id=0', async () => {
            req.params = { id: '0' };

            await marcarComoLeida(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('no debe llamar update si ya está leída', async () => {
            req.params = { id: '5' };
            const mockNotif = {
                id_notificacion: 5,
                id_usuario: 1,
                leida: true,
                update: jest.fn(),
            };
            mockModels.Notificacion.findByPk.mockResolvedValue(mockNotif);

            await marcarComoLeida(req, res);

            expect(mockNotif.update).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    // ===================================================================
    // marcarTodasLeidas
    // ===================================================================
    describe('marcarTodasLeidas', () => {
        it('debe marcar todas como leídas → 200', async () => {
            mockModels.Notificacion.update.mockResolvedValue([3]);

            await marcarTodasLeidas(req, res);

            expect(mockModels.Notificacion.update).toHaveBeenCalledWith(
                { leida: true },
                { where: { id_usuario: 1, leida: false } }
            );
            expect(res.status).toHaveBeenCalledWith(200);
            const body = res.status.mock.results[0].value.json.mock.calls[0][0];
            expect(body.message).toContain('3');
        });
    });
});
