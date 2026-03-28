/**
 * @fileoverview Tests para socketEmitter — bridge controllers → Socket.IO.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger BEFORE import
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock pushService BEFORE import
jest.unstable_mockModule('../../../services/pushService.js', () => ({
    enviarPushNotificacion: jest.fn().mockResolvedValue(null),
}));

// Mock events (real values)
jest.unstable_mockModule('../../../sockets/constants/events.js', () => ({
    SERVER_EVENTS: {
        NUEVA_SOLICITUD:     'server:nueva_solicitud',
        SOLICITUD_CANCELADA: 'server:solicitud_cancelada',
        SOLICITUD_ASIGNADA:  'server:solicitud_asignada',
        NUEVA_COTIZACION:    'server:nueva_cotizacion',
        COTIZACION_ACEPTADA: 'server:cotizacion_aceptada',
        COTIZACION_RECHAZADA:'server:cotizacion_rechazada',
        SERVICIO_INICIADO:   'server:servicio_iniciado',
        SERVICIO_FINALIZADO: 'server:servicio_finalizado',
        CALIFICACION_RECIBIDA:'server:calificacion_recibida',
    },
    CLIENT_EVENTS: {},
}));

const {
    setIO,
    getIO,
    emitNuevaSolicitud,
    emitSolicitudCancelada,
    emitNuevaCotizacion,
    emitCotizacionAceptada,
    emitCotizacionRechazada,
    emitServicioIniciado,
    emitServicioFinalizado,
    emitCalificacionRecibida,
} = await import('../../../sockets/services/socketEmitter.js');

/**
 * Helper: crea un mock de io con namespaces encadenables.
 */
function createMockIO() {
    const emitFn = jest.fn();
    const toFn = jest.fn().mockReturnValue({ emit: emitFn });
    const nsp = { to: toFn, emit: emitFn };
    const io = {
        of: jest.fn().mockReturnValue(nsp),
    };
    return { io, nsp, toFn, emitFn };
}

describe('sockets/services/socketEmitter', () => {
    beforeEach(() => {
        setIO(null);
    });

    describe('setIO / getIO', () => {
        it('almacena y retorna la instancia de io', () => {
            const fakeIO = { of: jest.fn() };
            setIO(fakeIO);
            expect(getIO()).toBe(fakeIO);
        });

        it('getIO con io=null emite warning', () => {
            setIO(null);
            const result = getIO();
            expect(result).toBeNull();
        });
    });

    describe('emitNuevaSolicitud', () => {
        it('no lanza error cuando io es null (no-op)', () => {
            expect(() => {
                emitNuevaSolicitud({
                    id_solicitud: 1,
                    solicitudData: { id_solicitud: 1 },
                    tecnicos: [{ id_tecnico: 10, id_usuario: 100, distancia_metros: 500, priority_score: 85 }],
                });
            }).not.toThrow();
        });

        it('emite a room tecnico:{id} de cada técnico', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            emitNuevaSolicitud({
                id_solicitud: 1,
                solicitudData: { id_solicitud: 1, descripcion: 'reparar' },
                tecnicos: [
                    { id_tecnico: 10, id_usuario: 100, distancia_metros: 500, priority_score: 85 },
                    { id_tecnico: 20, id_usuario: 200, distancia_metros: 800, priority_score: 72 },
                ],
            });

            expect(io.of).toHaveBeenCalledWith('/solicitudes');
            expect(toFn).toHaveBeenCalledWith('tecnico:10');
            expect(toFn).toHaveBeenCalledWith('tecnico:20');
            expect(emitFn).toHaveBeenCalledTimes(2);
            expect(emitFn).toHaveBeenCalledWith(
                'server:nueva_solicitud',
                expect.objectContaining({
                    id_solicitud: 1,
                    distancia_metros: 500,
                    priority_score: 85,
                })
            );
        });
    });

    describe('emitSolicitudCancelada', () => {
        it('emite a room solicitud:{id}', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            emitSolicitudCancelada({ id_solicitud: 42 });

            expect(io.of).toHaveBeenCalledWith('/solicitudes');
            expect(toFn).toHaveBeenCalledWith('solicitud:42');
            expect(emitFn).toHaveBeenCalledWith(
                'server:solicitud_cancelada',
                { id_solicitud: 42 }
            );
        });
    });

    describe('emitNuevaCotizacion', () => {
        it('emite a room user:{id_usuario_cliente}', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            const cotizacionData = { id_cotizacion: 5, valor_cotizacion: 100000 };
            emitNuevaCotizacion({
                id_solicitud: 1,
                id_cliente_usuario: 300,
                cotizacionData,
            });

            expect(io.of).toHaveBeenCalledWith('/cotizaciones');
            expect(toFn).toHaveBeenCalledWith('user:300');
            expect(emitFn).toHaveBeenCalledWith(
                'server:nueva_cotizacion',
                cotizacionData
            );
        });
    });

    describe('emitCotizacionAceptada', () => {
        it('emite aceptada al ganador y rechazada a los perdedores', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            emitCotizacionAceptada({
                id_solicitud: 1,
                id_tecnico_ganador_usuario: 100,
                tecnicosRechazados: [200, 300],
                cotizacionData: { id_cotizacion: 5 },
            });

            // cotizaciones namespace
            expect(toFn).toHaveBeenCalledWith('user:100');  // ganador
            expect(toFn).toHaveBeenCalledWith('user:200');  // rechazado 1
            expect(toFn).toHaveBeenCalledWith('user:300');  // rechazado 2

            // solicitudes namespace: solicitud asignada
            expect(toFn).toHaveBeenCalledWith('solicitud:1');
        });
    });

    describe('emitCotizacionRechazada', () => {
        it('emite rechazo al técnico', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            emitCotizacionRechazada({
                id_solicitud: 1,
                id_cotizacion: 5,
                id_tecnico_usuario: 200,
            });

            expect(io.of).toHaveBeenCalledWith('/cotizaciones');
            expect(toFn).toHaveBeenCalledWith('user:200');
            expect(emitFn).toHaveBeenCalledWith(
                'server:cotizacion_rechazada',
                { id_solicitud: 1, id_cotizacion: 5, razon: 'RECHAZADA_POR_CLIENTE' }
            );
        });
    });

    describe('emitServicioIniciado', () => {
        it('emite a room user:{id_usuario_cliente}', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            const servicioData = { id_servicio: 1, id_solicitud: 42, id_tecnico: 10, id_estado: 5 };
            emitServicioIniciado({
                id_solicitud: 42,
                id_cliente_usuario: 300,
                servicioData,
            });

            expect(io.of).toHaveBeenCalledWith('/servicios');
            expect(toFn).toHaveBeenCalledWith('user:300');
            expect(emitFn).toHaveBeenCalledWith('server:servicio_iniciado', servicioData);
        });

        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => {
                emitServicioIniciado({ id_solicitud: 1, id_cliente_usuario: 2, servicioData: {} });
            }).not.toThrow();
        });
    });

    describe('emitServicioFinalizado', () => {
        it('emite a room user:{id_usuario_cliente}', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            const servicioData = { id_servicio: 1, id_estado: 6, valor_total: 150000 };
            emitServicioFinalizado({
                id_solicitud: 42,
                id_cliente_usuario: 300,
                servicioData,
            });

            expect(io.of).toHaveBeenCalledWith('/servicios');
            expect(toFn).toHaveBeenCalledWith('user:300');
            expect(emitFn).toHaveBeenCalledWith('server:servicio_finalizado', servicioData);
        });
    });

    describe('emitCalificacionRecibida', () => {
        it('emite a room user:{id_usuario_tecnico}', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            const calificacionData = { id_servicio: 1, puntuacion: 5, nuevo_promedio: 4.5 };
            emitCalificacionRecibida({
                id_tecnico_usuario: 100,
                calificacionData,
            });

            expect(io.of).toHaveBeenCalledWith('/servicios');
            expect(toFn).toHaveBeenCalledWith('user:100');
            expect(emitFn).toHaveBeenCalledWith('server:calificacion_recibida', calificacionData);
        });
    });
});
