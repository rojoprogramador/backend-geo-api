/**
 * @fileoverview Namespace /solicitudes — alertas de nuevas solicitudes y cambios de estado.
 */

import { CLIENT_EVENTS, SERVER_EVENTS } from '../constants/events.js';
import { markOnline, markOffline } from '../services/presenceManager.js';
import logger from '../../utils/logger.js';

/**
 * Registra los handlers del namespace /solicitudes.
 * @param {import('socket.io').Namespace} nsp
 */
export const registerSolicitudHandlers = (nsp) => {
    nsp.on('connection', (socket) => {
        const { id_usuario, rol } = socket.usuario;

        // Auto-join room personal
        socket.join(`user:${id_usuario}`);

        // Si es TECNICO, auto-join room de técnico + marcar online
        if (rol === 'TECNICO' && socket.perfil?.id_tecnico) {
            socket.join(`tecnico:${socket.perfil.id_tecnico}`);
            const wentOnline = markOnline(socket.perfil.id_tecnico, socket.id);
            if (wentOnline) {
                nsp.emit(SERVER_EVENTS.TECNICO_ONLINE, {
                    id_tecnico: socket.perfil.id_tecnico,
                });
            }
        }

        logger.info(
            `solicitudNsp: Conectado user:${id_usuario} rol=${rol} socket=${socket.id}`
        );

        // Unirse a room de solicitud específica
        socket.on(CLIENT_EVENTS.JOIN_SOLICITUD_ROOM, ({ id_solicitud }) => {
            if (!id_solicitud) {
                socket.emit(SERVER_EVENTS.ERROR, { message: 'id_solicitud requerido' });
                return;
            }
            socket.join(`solicitud:${id_solicitud}`);
            logger.debug(`solicitudNsp: user:${id_usuario} joined solicitud:${id_solicitud}`);
        });

        // Salir de room de solicitud
        socket.on(CLIENT_EVENTS.LEAVE_SOLICITUD_ROOM, ({ id_solicitud }) => {
            if (!id_solicitud) return;
            socket.leave(`solicitud:${id_solicitud}`);
            logger.debug(`solicitudNsp: user:${id_usuario} left solicitud:${id_solicitud}`);
        });

        socket.on('disconnect', () => {
            if (rol === 'TECNICO' && socket.perfil?.id_tecnico) {
                const wentOffline = markOffline(socket.perfil.id_tecnico, socket.id);
                if (wentOffline) {
                    nsp.emit(SERVER_EVENTS.TECNICO_OFFLINE, {
                        id_tecnico: socket.perfil.id_tecnico,
                    });
                }
            }
            logger.info(`solicitudNsp: Desconectado user:${id_usuario} socket=${socket.id}`);
        });
    });
};
