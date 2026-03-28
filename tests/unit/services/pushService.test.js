import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Inline Mocks ---
const mockUsuario = { findByPk: jest.fn() };
const mockNotificacion = { create: jest.fn() };

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const mockSendPush = jest.fn();
const mockIsExpoPushToken = jest.fn();

jest.unstable_mockModule('../../../models/index.js', () => ({
    Usuario: mockUsuario,
    Notificacion: mockNotificacion,
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('expo-server-sdk', () => ({
    Expo: class MockExpo {
        sendPushNotificationsAsync = mockSendPush;
        static isExpoPushToken = mockIsExpoPushToken;
    },
}));

const { enviarPushNotificacion } = await import('../../../services/pushService.js');

// -----------------------------------------------------------------------

describe('services/pushService', () => {
    const baseParams = {
        tipo: 'NUEVA_SOLICITUD',
        titulo: 'Test',
        mensaje: 'Mensaje test',
        datos: { id_solicitud: 1 },
    };

    const mockNotif = {
        id_notificacion: 10,
        update: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockNotificacion.create.mockResolvedValue(mockNotif);
    });

    // ==============================================================
    // Usuario no encontrado
    // ==============================================================
    it('retorna null si el usuario no existe', async () => {
        mockUsuario.findByPk.mockResolvedValue(null);

        const result = await enviarPushNotificacion(999, baseParams);

        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('999'));
        expect(mockNotificacion.create).not.toHaveBeenCalled();
    });

    // ==============================================================
    // Usuario sin token — solo BD
    // ==============================================================
    it('crea notificación en BD pero no envía push si no hay token', async () => {
        mockUsuario.findByPk.mockResolvedValue({
            id_usuario: 1,
            expo_push_token: null,
        });
        mockIsExpoPushToken.mockReturnValue(false);

        const result = await enviarPushNotificacion(1, baseParams);

        expect(result).toBe(mockNotif);
        expect(mockNotificacion.create).toHaveBeenCalledWith(
            expect.objectContaining({
                id_usuario: 1,
                tipo: 'NUEVA_SOLICITUD',
                leida: false,
                push_enviado: false,
            })
        );
        expect(mockSendPush).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('sin token'));
    });

    // ==============================================================
    // Token inválido
    // ==============================================================
    it('crea notificación pero no envía push si token es inválido', async () => {
        mockUsuario.findByPk.mockResolvedValue({
            id_usuario: 1,
            expo_push_token: 'invalid-token',
        });
        mockIsExpoPushToken.mockReturnValue(false);

        const result = await enviarPushNotificacion(1, baseParams);

        expect(result).toBe(mockNotif);
        expect(mockSendPush).not.toHaveBeenCalled();
    });

    // ==============================================================
    // Envío exitoso
    // ==============================================================
    it('envía push y actualiza push_enviado=true si ticket OK', async () => {
        mockUsuario.findByPk.mockResolvedValue({
            id_usuario: 1,
            expo_push_token: 'ExponentPushToken[abc123]',
        });
        mockIsExpoPushToken.mockReturnValue(true);
        mockSendPush.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

        const result = await enviarPushNotificacion(1, baseParams);

        expect(result).toBe(mockNotif);
        expect(mockSendPush).toHaveBeenCalledWith([
            expect.objectContaining({
                to: 'ExponentPushToken[abc123]',
                title: 'Test',
                body: 'Mensaje test',
                priority: 'high',
            }),
        ]);
        expect(mockNotif.update).toHaveBeenCalledWith({ push_enviado: true });
    });

    // ==============================================================
    // Ticket con error
    // ==============================================================
    it('retorna notificación sin actualizar push_enviado si ticket es error', async () => {
        mockUsuario.findByPk.mockResolvedValue({
            id_usuario: 1,
            expo_push_token: 'ExponentPushToken[abc123]',
        });
        mockIsExpoPushToken.mockReturnValue(true);
        mockSendPush.mockResolvedValue([{
            status: 'error',
            message: 'DeviceNotRegistered',
        }]);

        const result = await enviarPushNotificacion(1, baseParams);

        expect(result).toBe(mockNotif);
        expect(mockNotif.update).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error push'));
    });

    // ==============================================================
    // datos = null (default)
    // ==============================================================
    it('maneja datos=null usando default', async () => {
        mockUsuario.findByPk.mockResolvedValue({
            id_usuario: 1,
            expo_push_token: 'ExponentPushToken[abc123]',
        });
        mockIsExpoPushToken.mockReturnValue(true);
        mockSendPush.mockResolvedValue([{ status: 'ok' }]);

        await enviarPushNotificacion(1, {
            tipo: 'SISTEMA',
            titulo: 'Aviso',
            mensaje: 'Info',
        });

        // datos defaults to null → data should be {}
        expect(mockSendPush).toHaveBeenCalledWith([
            expect.objectContaining({ data: {} }),
        ]);
        expect(mockNotificacion.create).toHaveBeenCalledWith(
            expect.objectContaining({ datos_adicionales: null })
        );
    });

    // ==============================================================
    // Excepción general → retorna null
    // ==============================================================
    it('retorna null y logea si ocurre una excepción inesperada', async () => {
        mockUsuario.findByPk.mockRejectedValue(new Error('DB connection lost'));

        const result = await enviarPushNotificacion(1, baseParams);

        expect(result).toBeNull();
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('DB connection lost')
        );
    });
});
