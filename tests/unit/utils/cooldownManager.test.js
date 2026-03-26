import { jest } from '@jest/globals';

import {
    setCooldown,
    hasCooldown,
    filtrarSinCooldown,
    clearAll,
    DURACION_COOLDOWN_MS,
} from '../../../utils/cooldownManager.js';

describe('cooldownManager', () => {
    afterEach(() => {
        clearAll();
        jest.restoreAllMocks();
    });

    describe('setCooldown / hasCooldown', () => {
        it('debe activar cooldown para un técnico', () => {
            setCooldown(1);
            expect(hasCooldown(1)).toBe(true);
        });

        it('debe retornar false si no tiene cooldown', () => {
            expect(hasCooldown(999)).toBe(false);
        });

        it('debe expirar después de la duración', () => {
            setCooldown(1, 100); // 100ms
            expect(hasCooldown(1)).toBe(true);

            // Simular paso del tiempo
            jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 150);
            expect(hasCooldown(1)).toBe(false);
        });

        it('debe permitir duración personalizada', () => {
            const ahora = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(ahora);

            setCooldown(2, 5000);
            expect(hasCooldown(2)).toBe(true);

            // 4s después — aún activo
            Date.now.mockReturnValue(ahora + 4000);
            expect(hasCooldown(2)).toBe(true);

            // 6s después — expirado
            Date.now.mockReturnValue(ahora + 6000);
            expect(hasCooldown(2)).toBe(false);
        });

        it('debe usar 90s como duración por defecto', () => {
            expect(DURACION_COOLDOWN_MS).toBe(90_000);
        });
    });

    describe('filtrarSinCooldown', () => {
        it('debe filtrar técnicos con cooldown activo', () => {
            setCooldown(1);
            setCooldown(3);

            const resultado = filtrarSinCooldown([1, 2, 3, 4]);
            expect(resultado).toEqual([2, 4]);
        });

        it('debe retornar todos si ninguno tiene cooldown', () => {
            const resultado = filtrarSinCooldown([1, 2, 3]);
            expect(resultado).toEqual([1, 2, 3]);
        });

        it('debe retornar vacío si todos tienen cooldown', () => {
            setCooldown(1);
            setCooldown(2);

            const resultado = filtrarSinCooldown([1, 2]);
            expect(resultado).toEqual([]);
        });
    });

    describe('clearAll', () => {
        it('debe limpiar todos los cooldowns', () => {
            setCooldown(1);
            setCooldown(2);
            setCooldown(3);

            clearAll();

            expect(hasCooldown(1)).toBe(false);
            expect(hasCooldown(2)).toBe(false);
            expect(hasCooldown(3)).toBe(false);
        });
    });
});
