/**
 * @fileoverview Namespace /cotizaciones — notificaciones de cotizaciones en tiempo real.
 */

import { CLIENT_EVENTS, SERVER_EVENTS } from '../constants/events.js';
import logger from '../../utils/logger.js';

/**
 * Registra los handlers del namespace /cotizaciones.
 * @param {import('socket.io').Namespace} nsp
 */
export const registerCotizacionHandlers = (nsp) => {
    nsp.on('connection', (socket) => {
        const { id_usuario, rol } = socket.usuario;

        // Auto-join room personal
        socket.join(`user:${id_usuario}`);

        // Si es TECNICO, auto-join room de técnico
        if (rol === 'TECNICO' && socket.perfil?.id_tecnico) {
            socket.join(`tecnico:${socket.perfil.id_tecnico}`);
        }

        logger.info(
            `cotizacionNsp: Conectado user:${id_usuario} rol=${rol} socket=${socket.id}`
        );

        // Cliente se une a room de cotizaciones de una solicitud
        socket.on(CLIENT_EVENTS.JOIN_COTIZACIONES_ROOM, ({ id_solicitud }) => {
            if (!id_solicitud) {
                socket.emit(SERVER_EVENTS.ERROR, { message: 'id_solicitud requerido' });
                return;
            }
            socket.join(`cotizaciones:${id_solicitud}`);
            logger.debug(`cotizacionNsp: user:${id_usuario} joined cotizaciones:${id_solicitud}`);
        });

        socket.on('disconnect', () => {
            logger.info(`cotizacionNsp: Desconectado user:${id_usuario} socket=${socket.id}`);
        });
    });
};
