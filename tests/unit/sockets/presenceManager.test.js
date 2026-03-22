/**
 * @fileoverview Tests para presenceManager — gestión de presencia de técnicos.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    markOnline,
    markOffline,
    isOnline,
    getOnlineTechnicianIds,
    getOnlineCount,
    clearAll,
} from '../../../sockets/services/presenceManager.js';

describe('sockets/services/presenceManager', () => {
    beforeEach(() => {
        clearAll();
    });

    describe('markOnline', () => {
        it('retorna true en la primera conexión (transición offline → online)', () => {
            const result = markOnline(10, 'socket-abc');
            expect(result).toBe(true);
        });

        it('retorna false en la segunda conexión del mismo técnico', () => {
            markOnline(10, 'socket-abc');
            const result = markOnline(10, 'socket-def');
            expect(result).toBe(false);
        });

        it('retorna true para un técnico diferente', () => {
            markOnline(10, 'socket-abc');
            const result = markOnline(20, 'socket-xyz');
            expect(result).toBe(true);
        });
    });

    describe('markOffline', () => {
        it('retorna true cuando se desconecta el último socket (transición online → offline)', () => {
            markOnline(10, 'socket-abc');
            const result = markOffline(10, 'socket-abc');
            expect(result).toBe(true);
        });

        it('retorna false cuando aún tiene otros sockets conectados', () => {
            markOnline(10, 'socket-abc');
            markOnline(10, 'socket-def');
            const result = markOffline(10, 'socket-abc');
            expect(result).toBe(false);
        });

        it('retorna false para un técnico que no está en el mapa', () => {
            const result = markOffline(999, 'socket-ghost');
            expect(result).toBe(false);
        });
    });

    describe('isOnline', () => {
        it('retorna true para un técnico conectado', () => {
            markOnline(10, 'socket-abc');
            expect(isOnline(10)).toBe(true);
        });

        it('retorna false para un técnico desconectado', () => {
            expect(isOnline(10)).toBe(false);
        });

        it('retorna false después de desconectar todos los sockets', () => {
            markOnline(10, 'socket-abc');
            markOffline(10, 'socket-abc');
            expect(isOnline(10)).toBe(false);
        });
    });

    describe('getOnlineTechnicianIds', () => {
        it('retorna array vacío sin técnicos conectados', () => {
            expect(getOnlineTechnicianIds()).toEqual([]);
        });

        it('retorna IDs de todos los técnicos conectados', () => {
            markOnline(10, 'socket-a');
            markOnline(20, 'socket-b');
            markOnline(30, 'socket-c');

            const ids = getOnlineTechnicianIds();
            expect(ids).toHaveLength(3);
            expect(ids).toContain(10);
            expect(ids).toContain(20);
            expect(ids).toContain(30);
        });

        it('no incluye técnicos que ya se desconectaron', () => {
            markOnline(10, 'socket-a');
            markOnline(20, 'socket-b');
            markOffline(10, 'socket-a');

            const ids = getOnlineTechnicianIds();
            expect(ids).toHaveLength(1);
            expect(ids).toContain(20);
        });
    });

    describe('getOnlineCount', () => {
        it('retorna 0 sin técnicos conectados', () => {
            expect(getOnlineCount()).toBe(0);
        });

        it('retorna el conteo correcto', () => {
            markOnline(10, 'socket-a');
            markOnline(20, 'socket-b');
            expect(getOnlineCount()).toBe(2);
        });

        it('un técnico con múltiples sockets cuenta como 1', () => {
            markOnline(10, 'socket-a');
            markOnline(10, 'socket-b');
            expect(getOnlineCount()).toBe(1);
        });
    });

    describe('clearAll', () => {
        it('limpia todos los técnicos del mapa', () => {
            markOnline(10, 'socket-a');
            markOnline(20, 'socket-b');
            clearAll();
            expect(getOnlineCount()).toBe(0);
            expect(isOnline(10)).toBe(false);
        });
    });
});
