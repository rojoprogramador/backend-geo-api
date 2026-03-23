/**
 * @fileoverview Namespace /servicios — notificaciones de ciclo de vida del servicio.
 */

import { SERVER_EVENTS } from '../constants/events.js';
import logger from '../../utils/logger.js';

/**
 * Registra los handlers del namespace /servicios.
 * @param {import('socket.io').Namespace} nsp
 */
export const registerServicioHandlers = (nsp) => {
    nsp.on('connection', (socket) => {
        const { id_usuario, rol } = socket.usuario;

        // Auto-join room personal
        socket.join(`user:${id_usuario}`);

        // Si es TECNICO, auto-join room de técnico
        if (rol === 'TECNICO' && socket.perfil?.id_tecnico) {
            socket.join(`tecnico:${socket.perfil.id_tecnico}`);
        }

        logger.info(
            `servicioNsp: Conectado user:${id_usuario} rol=${rol} socket=${socket.id}`
        );

        socket.on('disconnect', () => {
            logger.info(`servicioNsp: Desconectado user:${id_usuario} socket=${socket.id}`);
        });
    });
};
