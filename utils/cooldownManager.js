/**
 * Cooldown in-memory para técnicos post-cotización (solicitudes inmediatas).
 * Evita que un técnico reciba nuevas solicitudes durante DURACION_COOLDOWN_MS
 * después de enviar una cotización.
 *
 * Single-server. Migrar a Redis si se escala horizontalmente.
 */

const DURACION_COOLDOWN_MS = 90_000; // 90 segundos
const INTERVALO_LIMPIEZA_MS = 60_000; // 60 segundos

/** @type {Map<number, number>} id_tecnico → timestamp de expiración */
const cooldowns = new Map();

let limpiezaTimer = null;

function iniciarLimpieza() {
    if (limpiezaTimer) return;
    limpiezaTimer = setInterval(() => {
        const ahora = Date.now();
        for (const [id, expiry] of cooldowns) {
            if (expiry <= ahora) cooldowns.delete(id);
        }
    }, INTERVALO_LIMPIEZA_MS);
    limpiezaTimer.unref(); // no bloquear process.exit
}

/**
 * Activa cooldown para un técnico.
 * @param {number} idTecnico
 * @param {number} [duracionMs=90000]
 */
export function setCooldown(idTecnico, duracionMs = DURACION_COOLDOWN_MS) {
    cooldowns.set(idTecnico, Date.now() + duracionMs);
    iniciarLimpieza();
}

/**
 * Verifica si un técnico tiene cooldown activo.
 * @param {number} idTecnico
 * @returns {boolean}
 */
export function hasCooldown(idTecnico) {
    const expiry = cooldowns.get(idTecnico);
    if (!expiry) return false;
    if (expiry <= Date.now()) {
        cooldowns.delete(idTecnico);
        return false;
    }
    return true;
}

/**
 * Filtra técnicos que NO tienen cooldown activo.
 * @param {number[]} idsTecnicos
 * @returns {number[]}
 */
export function filtrarSinCooldown(idsTecnicos) {
    return idsTecnicos.filter(id => !hasCooldown(id));
}

/** Limpia todos los cooldowns (para tests). */
export function clearAll() {
    cooldowns.clear();
    if (limpiezaTimer) {
        clearInterval(limpiezaTimer);
        limpiezaTimer = null;
    }
}

export { DURACION_COOLDOWN_MS };
