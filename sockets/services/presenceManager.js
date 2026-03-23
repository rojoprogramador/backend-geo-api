/**
 * @fileoverview Gestión de presencia online/offline de técnicos.
 * Almacenamiento in-memory (Map). Soporta múltiples sockets por técnico.
 */

import logger from '../../utils/logger.js';

/** @type {Map<number, Set<string>>} id_tecnico → Set<socketId> */
const onlineTechnicians = new Map();

/**
 * Marca un técnico como online al conectar un socket.
 * @param {number} id_tecnico
 * @param {string} socketId
 * @returns {boolean} true si es la primera conexión (transición offline → online)
 */
export const markOnline = (id_tecnico, socketId) => {
    let sockets = onlineTechnicians.get(id_tecnico);
    const wasOffline = !sockets || sockets.size === 0;

    if (!sockets) {
        sockets = new Set();
        onlineTechnicians.set(id_tecnico, sockets);
    }
    sockets.add(socketId);

    if (wasOffline) {
        logger.info(`presence: Técnico ${id_tecnico} ONLINE (socket=${socketId})`);
    }
    return wasOffline;
};

/**
 * Marca un socket de técnico como desconectado.
 * @param {number} id_tecnico
 * @param {string} socketId
 * @returns {boolean} true si era el último socket (transición online → offline)
 */
export const markOffline = (id_tecnico, socketId) => {
    const sockets = onlineTechnicians.get(id_tecnico);
    if (!sockets) return false;

    sockets.delete(socketId);

    if (sockets.size === 0) {
        onlineTechnicians.delete(id_tecnico);
        logger.info(`presence: Técnico ${id_tecnico} OFFLINE (último socket=${socketId})`);
        return true;
    }
    return false;
};

/**
 * Verifica si un técnico está conectado.
 * @param {number} id_tecnico
 * @returns {boolean}
 */
export const isOnline = (id_tecnico) => {
    const sockets = onlineTechnicians.get(id_tecnico);
    return !!(sockets && sockets.size > 0);
};

/**
 * Retorna los IDs de todos los técnicos conectados.
 * @returns {number[]}
 */
export const getOnlineTechnicianIds = () => {
    return Array.from(onlineTechnicians.keys());
};

/**
 * Retorna la cantidad de técnicos conectados.
 * @returns {number}
 */
export const getOnlineCount = () => {
    return onlineTechnicians.size;
};

/**
 * Limpia toda la presencia (útil para tests).
 */
export const clearAll = () => {
    onlineTechnicians.clear();
};
