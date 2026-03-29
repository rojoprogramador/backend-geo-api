/**
 * @fileoverview Tests para socketEmitter — bridge controllers → Socket.IO.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger BEFORE import
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: mockLogger,
}));

// Mock pushService BEFORE import
const mockEnviarPush = jest.fn().mockResolvedValue(null);
jest.unstable_mockModule('../../../services/pushService.js', () => ({
    enviarPushNotificacion: mockEnviarPush,
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

/** Flush microtask queue so .then()/.catch() on push promises execute. */
const flushPromises = () => new Promise((r) => process.nextTick(r));

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
        jest.clearAllMocks();
        mockEnviarPush.mockResolvedValue(null);
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
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('getIO llamado antes de setIO')
            );
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

        it('envía push a cada técnico y logea delivery ENVIADO', async () => {
            const { io } = createMockIO();
            setIO(io);

            emitNuevaSolicitud({
                id_solicitud: 1,
                solicitudData: { id_solicitud: 1, subcategoria: 'Plomería', descripcion: 'fuga' },
                tecnicos: [
                    { id_tecnico: 10, id_usuario: 100, distancia_metros: 500, priority_score: 85 },
                ],
            });

            await flushPromises();

            expect(mockEnviarPush).toHaveBeenCalledWith(100, expect.objectContaining({
                tipo: 'NUEVA_SOLICITUD',
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH')
            );
        });

        it('logea delivery ERROR cuando push de técnico falla', async () => {
            const { io } = createMockIO();
            setIO(io);
            mockEnviarPush.mockRejectedValue(new Error('push_fail'));

            emitNuevaSolicitud({
                id_solicitud: 1,
                solicitudData: { id_solicitud: 1 },
                tecnicos: [
                    { id_tecnico: 10, id_usuario: 100, distancia_metros: 500, priority_score: 85 },
                ],
            });

            await flushPromises();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('resultado=ERROR')
            );
        });
    });

    describe('emitSolicitudCancelada', () => {
        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => emitSolicitudCancelada({ id_solicitud: 1 })).not.toThrow();
        });

        it('emite a room solicitud:{id} y logea delivery WS', () => {
            const { io, toFn, emitFn } = createMockIO();
            setIO(io);

            emitSolicitudCancelada({ id_solicitud: 42 });

            expect(io.of).toHaveBeenCalledWith('/solicitudes');
            expect(toFn).toHaveBeenCalledWith('solicitud:42');
            expect(emitFn).toHaveBeenCalledWith(
                'server:solicitud_cancelada',
                { id_solicitud: 42 }
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=WS')
            );
        });
    });

    describe('emitNuevaCotizacion', () => {
        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => emitNuevaCotizacion({
                id_solicitud: 1, id_cliente_usuario: 2, cotizacionData: {},
            })).not.toThrow();
        });

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

        it('envía push COTIZACION_RECIBIDA y logea ENVIADO', async () => {
            const { io } = createMockIO();
            setIO(io);

            emitNuevaCotizacion({
                id_solicitud: 1,
                id_cliente_usuario: 300,
                cotizacionData: { id_cotizacion: 5, valor_cotizacion: 100000 },
            });

            await flushPromises();

            expect(mockEnviarPush).toHaveBeenCalledWith(300, expect.objectContaining({
                tipo: 'COTIZACION_RECIBIDA',
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=COTIZACION_RECIBIDA resultado=ENVIADO')
            );
        });

        it('logea ERROR cuando push COTIZACION_RECIBIDA falla', async () => {
            const { io } = createMockIO();
            setIO(io);
            mockEnviarPush.mockRejectedValue(new Error('token_inválido'));

            emitNuevaCotizacion({
                id_solicitud: 1,
                id_cliente_usuario: 300,
                cotizacionData: { id_cotizacion: 5, valor_cotizacion: 100000 },
            });

            await flushPromises();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=COTIZACION_RECIBIDA resultado=ERROR')
            );
        });
    });

    describe('emitCotizacionAceptada', () => {
        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => emitCotizacionAceptada({
                id_solicitud: 1, id_tecnico_ganador_usuario: 2,
                tecnicosRechazados: [], cotizacionData: {},
            })).not.toThrow();
        });

        it('emite aceptada al ganador y rechazada a los perdedores', () => {
            const { io, toFn } = createMockIO();
            setIO(io);

            emitCotizacionAceptada({
                id_solicitud: 1,
                id_tecnico_ganador_usuario: 100,
                tecnicosRechazados: [200, 300],
                cotizacionData: { id_cotizacion: 5 },
            });

            expect(toFn).toHaveBeenCalledWith('user:100');  // ganador
            expect(toFn).toHaveBeenCalledWith('user:200');  // rechazado 1
            expect(toFn).toHaveBeenCalledWith('user:300');  // rechazado 2
            expect(toFn).toHaveBeenCalledWith('solicitud:1');
        });

        it('usa payloadUnificado cuando cotizacionData tiene .datos', async () => {
            const { io, emitFn } = createMockIO();
            setIO(io);

            const contratoUnificado = {
                tipo: 'COTIZACION_ACEPTADA',
                datos: { id_solicitud: 1, id_tecnico: 5, destino_logico: 'AGENDA' },
            };

            emitCotizacionAceptada({
                id_solicitud: 1,
                id_tecnico_ganador_usuario: 100,
                tecnicosRechazados: [],
                cotizacionData: contratoUnificado,
            });

            await flushPromises();

            expect(emitFn).toHaveBeenCalledWith('server:cotizacion_aceptada', contratoUnificado);
            expect(mockEnviarPush).toHaveBeenCalledWith(100, expect.objectContaining({
                tipo: 'COTIZACION_ACEPTADA',
                datos: contratoUnificado.datos,
            }));
        });

        it('envuelve cotizacionData legacy en payloadUnificado', () => {
            const { io, emitFn } = createMockIO();
            setIO(io);

            emitCotizacionAceptada({
                id_solicitud: 1,
                id_tecnico_ganador_usuario: 100,
                tecnicosRechazados: [],
                cotizacionData: { id_cotizacion: 5 },
            });

            expect(emitFn).toHaveBeenCalledWith('server:cotizacion_aceptada', {
                tipo: 'COTIZACION_ACEPTADA',
                datos: { id_solicitud: 1, id_cotizacion: 5 },
            });
        });

        it('envía push COTIZACION_ACEPTADA y logea ENVIADO', async () => {
            const { io } = createMockIO();
            setIO(io);

            emitCotizacionAceptada({
                id_solicitud: 1,
                id_tecnico_ganador_usuario: 100,
                tecnicosRechazados: [],
                cotizacionData: { id_cotizacion: 5 },
            });

            await flushPromises();

            expect(mockEnviarPush).toHaveBeenCalledWith(100, expect.objectContaining({
                tipo: 'COTIZACION_ACEPTADA',
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH')
            );
        });

        it('logea ERROR cuando push COTIZACION_ACEPTADA falla', async () => {
            const { io } = createMockIO();
            setIO(io);
            mockEnviarPush.mockRejectedValue(new Error('push_error'));

            emitCotizacionAceptada({
                id_solicitud: 1,
                id_tecnico_ganador_usuario: 100,
                tecnicosRechazados: [],
                cotizacionData: { id_cotizacion: 5 },
            });

            await flushPromises();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('resultado=ERROR')
            );
        });
    });

    describe('emitCotizacionRechazada', () => {
        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => emitCotizacionRechazada({
                id_solicitud: 1, id_cotizacion: 2, id_tecnico_usuario: 3,
            })).not.toThrow();
        });

        it('emite rechazo al técnico con logDelivery WS', () => {
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
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=WS evento=server:cotizacion_rechazada')
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

        it('envía push SERVICIO_INICIADO y logea ENVIADO', async () => {
            const { io } = createMockIO();
            setIO(io);

            emitServicioIniciado({
                id_solicitud: 42,
                id_cliente_usuario: 300,
                servicioData: { id_servicio: 1, id_tecnico: 10 },
            });

            await flushPromises();

            expect(mockEnviarPush).toHaveBeenCalledWith(300, expect.objectContaining({
                tipo: 'SERVICIO_INICIADO',
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=SERVICIO_INICIADO resultado=ENVIADO')
            );
        });

        it('logea ERROR cuando push SERVICIO_INICIADO falla', async () => {
            const { io } = createMockIO();
            setIO(io);
            mockEnviarPush.mockRejectedValue(new Error('servicio_push_fail'));

            emitServicioIniciado({
                id_solicitud: 42,
                id_cliente_usuario: 300,
                servicioData: { id_servicio: 1, id_tecnico: 10 },
            });

            await flushPromises();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=SERVICIO_INICIADO resultado=ERROR')
            );
        });
    });

    describe('emitServicioFinalizado', () => {
        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => emitServicioFinalizado({
                id_solicitud: 1, id_cliente_usuario: 2, servicioData: {},
            })).not.toThrow();
        });

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

        it('envía push SERVICIO_COMPLETADO y logea ENVIADO', async () => {
            const { io } = createMockIO();
            setIO(io);

            emitServicioFinalizado({
                id_solicitud: 42,
                id_cliente_usuario: 300,
                servicioData: { id_servicio: 1, id_tecnico: 10 },
            });

            await flushPromises();

            expect(mockEnviarPush).toHaveBeenCalledWith(300, expect.objectContaining({
                tipo: 'SERVICIO_COMPLETADO',
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=SERVICIO_COMPLETADO resultado=ENVIADO')
            );
        });

        it('logea ERROR cuando push SERVICIO_COMPLETADO falla', async () => {
            const { io } = createMockIO();
            setIO(io);
            mockEnviarPush.mockRejectedValue(new Error('completado_fail'));

            emitServicioFinalizado({
                id_solicitud: 42,
                id_cliente_usuario: 300,
                servicioData: { id_servicio: 1, id_tecnico: 10 },
            });

            await flushPromises();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=SERVICIO_COMPLETADO resultado=ERROR')
            );
        });
    });

    describe('emitCalificacionRecibida', () => {
        it('no-op cuando io es null', () => {
            setIO(null);
            expect(() => emitCalificacionRecibida({
                id_tecnico_usuario: 1, calificacionData: {},
            })).not.toThrow();
        });

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

        it('envía push CALIFICACION_RECIBIDA y logea ENVIADO', async () => {
            const { io } = createMockIO();
            setIO(io);

            emitCalificacionRecibida({
                id_tecnico_usuario: 100,
                calificacionData: { id_servicio: 1, puntuacion: 5 },
            });

            await flushPromises();

            expect(mockEnviarPush).toHaveBeenCalledWith(100, expect.objectContaining({
                tipo: 'CALIFICACION_RECIBIDA',
            }));
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=CALIFICACION_RECIBIDA resultado=ENVIADO')
            );
        });

        it('logea ERROR cuando push CALIFICACION_RECIBIDA falla', async () => {
            const { io } = createMockIO();
            setIO(io);
            mockEnviarPush.mockRejectedValue(new Error('calificacion_fail'));

            emitCalificacionRecibida({
                id_tecnico_usuario: 100,
                calificacionData: { id_servicio: 1, puntuacion: 5 },
            });

            await flushPromises();

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('canal=PUSH evento=CALIFICACION_RECIBIDA resultado=ERROR')
            );
        });
    });
});
