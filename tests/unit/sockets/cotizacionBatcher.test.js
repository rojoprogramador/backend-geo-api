/**
 * @fileoverview Tests para cotizacionBatcher — ventana de 5 min / 5 cotizaciones.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock socketEmitter (getIO)
const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockOf = jest.fn().mockReturnValue({ to: mockTo });
const mockGetIO = jest.fn();

jest.unstable_mockModule('../../../sockets/services/socketEmitter.js', () => ({
    getIO: mockGetIO,
    setIO: jest.fn(),
}));

// Mock pushService
const mockEnviarPush = jest.fn().mockResolvedValue(null);
jest.unstable_mockModule('../../../services/pushService.js', () => ({
    enviarPushNotificacion: mockEnviarPush,
}));

// Mock events
jest.unstable_mockModule('../../../sockets/constants/events.js', () => ({
    SERVER_EVENTS: {
        COTIZACIONES_LISTAS: 'server:cotizaciones_listas',
    },
    CLIENT_EVENTS: {},
}));

const {
    addCotizacion,
    cancelBatch,
    clearAllBatches,
    getBatchInfo,
} = await import('../../../sockets/services/cotizacionBatcher.js');

describe('sockets/services/cotizacionBatcher', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        clearAllBatches();
        mockGetIO.mockReturnValue({ of: mockOf });
    });

    afterEach(() => {
        clearAllBatches();
        jest.useRealTimers();
    });

    describe('addCotizacion', () => {
        it('primera cotización inicia un batch con count=1', () => {
            addCotizacion(100, 500);

            const info = getBatchInfo(100);
            expect(info).toBeDefined();
            expect(info.count).toBe(1);
            expect(info.closed).toBe(false);
        });

        it('incrementa count con cada cotización', () => {
            addCotizacion(100, 500);
            addCotizacion(100, 500);
            addCotizacion(100, 500);

            expect(getBatchInfo(100).count).toBe(3);
        });

        it('alcanzar 5 cotizaciones cierra el batch con razón MAX_COTIZACIONES', () => {
            for (let i = 0; i < 5; i++) {
                addCotizacion(100, 500);
            }

            const info = getBatchInfo(100);
            expect(info.closed).toBe(true);
            expect(info.count).toBe(5);

            expect(mockOf).toHaveBeenCalledWith('/cotizaciones');
            expect(mockTo).toHaveBeenCalledWith('user:500');
            expect(mockEmit).toHaveBeenCalledWith(
                'server:cotizaciones_listas',
                expect.objectContaining({
                    id_solicitud: 100,
                    razon: 'MAX_COTIZACIONES',
                    total_cotizaciones: 5,
                })
            );
        });

        it('no incrementa después de que el batch se cierra', () => {
            for (let i = 0; i < 5; i++) {
                addCotizacion(100, 500);
            }

            // Intentar agregar una 6ta
            addCotizacion(100, 500);

            expect(getBatchInfo(100).count).toBe(5);
        });
    });

    describe('timeout de 5 minutos', () => {
        it('cierra el batch con razón TIMEOUT al expirar', () => {
            addCotizacion(200, 600);
            addCotizacion(200, 600);

            // Avanzar 5 minutos
            jest.advanceTimersByTime(5 * 60 * 1000);

            const info = getBatchInfo(200);
            expect(info.closed).toBe(true);
            expect(info.count).toBe(2);

            expect(mockEmit).toHaveBeenCalledWith(
                'server:cotizaciones_listas',
                expect.objectContaining({
                    id_solicitud: 200,
                    razon: 'TIMEOUT',
                    total_cotizaciones: 2,
                })
            );
        });

        it('no emite si io es null', () => {
            mockGetIO.mockReturnValue(null);

            addCotizacion(300, 700);
            jest.advanceTimersByTime(5 * 60 * 1000);

            expect(mockOf).not.toHaveBeenCalled();
        });
    });

    describe('cancelBatch', () => {
        it('elimina el batch del mapa', () => {
            addCotizacion(100, 500);
            expect(getBatchInfo(100)).toBeDefined();

            cancelBatch(100);
            expect(getBatchInfo(100)).toBeUndefined();
        });

        it('no lanza error si el batch no existe', () => {
            expect(() => cancelBatch(999)).not.toThrow();
        });

        it('previene que el timeout se ejecute después de cancelar', () => {
            addCotizacion(100, 500);
            cancelBatch(100);

            jest.advanceTimersByTime(5 * 60 * 1000);

            // No debe haber emitido cotizaciones_listas
            expect(mockEmit).not.toHaveBeenCalled();
        });
    });

    describe('clearAllBatches', () => {
        it('limpia todos los batches activos', () => {
            addCotizacion(100, 500);
            addCotizacion(200, 600);

            clearAllBatches();

            expect(getBatchInfo(100)).toBeUndefined();
            expect(getBatchInfo(200)).toBeUndefined();
        });
    });

    describe('push notification on closeBatch', () => {
        it('envía push COTIZACIONES_LISTAS al cerrar por MAX', () => {
            for (let i = 0; i < 5; i++) {
                addCotizacion(100, 500);
            }

            expect(mockEnviarPush).toHaveBeenCalledWith(500, expect.objectContaining({
                tipo: 'COTIZACIONES_LISTAS',
                titulo: 'Cotizaciones disponibles',
                datos: { id_solicitud: 100, total_cotizaciones: 5 },
            }));
        });

        it('envía push COTIZACIONES_LISTAS al cerrar por TIMEOUT', () => {
            addCotizacion(200, 600);
            addCotizacion(200, 600);

            jest.advanceTimersByTime(5 * 60 * 1000);

            expect(mockEnviarPush).toHaveBeenCalledWith(600, expect.objectContaining({
                tipo: 'COTIZACIONES_LISTAS',
                datos: { id_solicitud: 200, total_cotizaciones: 2 },
            }));
        });

        it('envía push incluso si io es null (WS no-op, push sí)', () => {
            mockGetIO.mockReturnValue(null);

            addCotizacion(300, 700);
            jest.advanceTimersByTime(5 * 60 * 1000);

            // WS no se emitió
            expect(mockOf).not.toHaveBeenCalled();
            // Push sí se envió
            expect(mockEnviarPush).toHaveBeenCalledWith(700, expect.objectContaining({
                tipo: 'COTIZACIONES_LISTAS',
                datos: { id_solicitud: 300, total_cotizaciones: 1 },
            }));
        });
    });

    describe('batches independientes por solicitud', () => {
        it('cada solicitud tiene su propio batch', () => {
            addCotizacion(100, 500);
            addCotizacion(100, 500);
            addCotizacion(200, 600);

            expect(getBatchInfo(100).count).toBe(2);
            expect(getBatchInfo(200).count).toBe(1);
        });
    });
});
