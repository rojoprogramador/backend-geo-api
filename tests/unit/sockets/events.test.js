/**
 * @fileoverview Tests para constantes de eventos WebSocket.
 * Verifica prefijos, unicidad y completitud de CLIENT_EVENTS y SERVER_EVENTS.
 */

import { describe, it, expect } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../../../sockets/constants/events.js';

describe('sockets/constants/events', () => {
    describe('CLIENT_EVENTS', () => {
        it('todas las constantes tienen prefijo "client:"', () => {
            for (const [key, value] of Object.entries(CLIENT_EVENTS)) {
                expect(value).toMatch(/^client:/);
            }
        });

        it('no tiene valores duplicados', () => {
            const values = Object.values(CLIENT_EVENTS);
            const unique = new Set(values);
            expect(unique.size).toBe(values.length);
        });

        it('contiene los eventos esperados', () => {
            expect(CLIENT_EVENTS).toHaveProperty('JOIN_SOLICITUD_ROOM');
            expect(CLIENT_EVENTS).toHaveProperty('LEAVE_SOLICITUD_ROOM');
            expect(CLIENT_EVENTS).toHaveProperty('JOIN_COTIZACIONES_ROOM');
            expect(CLIENT_EVENTS).toHaveProperty('TECNICO_SEND_LOCATION');
            expect(CLIENT_EVENTS).toHaveProperty('JOIN_TRACKING_ROOM');
            expect(CLIENT_EVENTS).toHaveProperty('LEAVE_TRACKING_ROOM');
        });
    });

    describe('SERVER_EVENTS', () => {
        it('todas las constantes tienen prefijo "server:"', () => {
            for (const [key, value] of Object.entries(SERVER_EVENTS)) {
                expect(value).toMatch(/^server:/);
            }
        });

        it('no tiene valores duplicados', () => {
            const values = Object.values(SERVER_EVENTS);
            const unique = new Set(values);
            expect(unique.size).toBe(values.length);
        });

        it('contiene eventos de solicitudes', () => {
            expect(SERVER_EVENTS).toHaveProperty('NUEVA_SOLICITUD');
            expect(SERVER_EVENTS).toHaveProperty('SOLICITUD_CANCELADA');
            expect(SERVER_EVENTS).toHaveProperty('SOLICITUD_ASIGNADA');
        });

        it('contiene eventos de cotizaciones', () => {
            expect(SERVER_EVENTS).toHaveProperty('NUEVA_COTIZACION');
            expect(SERVER_EVENTS).toHaveProperty('COTIZACIONES_LISTAS');
            expect(SERVER_EVENTS).toHaveProperty('COTIZACION_ACEPTADA');
            expect(SERVER_EVENTS).toHaveProperty('COTIZACION_RECHAZADA');
        });

        it('contiene eventos de servicios', () => {
            expect(SERVER_EVENTS).toHaveProperty('SERVICIO_INICIADO');
            expect(SERVER_EVENTS).toHaveProperty('SERVICIO_FINALIZADO');
            expect(SERVER_EVENTS).toHaveProperty('CALIFICACION_RECIBIDA');
        });

        it('contiene eventos de tracking', () => {
            expect(SERVER_EVENTS).toHaveProperty('TECNICO_UBICACION');
            expect(SERVER_EVENTS).toHaveProperty('TECNICO_EN_CAMINO');
            expect(SERVER_EVENTS).toHaveProperty('TECNICO_CERCA');
            expect(SERVER_EVENTS).toHaveProperty('TECNICO_LLEGO');
        });

        it('contiene eventos globales', () => {
            expect(SERVER_EVENTS).toHaveProperty('TECNICO_ONLINE');
            expect(SERVER_EVENTS).toHaveProperty('TECNICO_OFFLINE');
            expect(SERVER_EVENTS).toHaveProperty('ERROR');
        });
    });

    describe('sin colisión entre CLIENT y SERVER', () => {
        it('no hay nombres de evento compartidos entre CLIENT_EVENTS y SERVER_EVENTS', () => {
            const clientValues = new Set(Object.values(CLIENT_EVENTS));
            const serverValues = Object.values(SERVER_EVENTS);

            for (const value of serverValues) {
                expect(clientValues.has(value)).toBe(false);
            }
        });
    });
});
