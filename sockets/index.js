/**
 * @fileoverview Inicialización de Socket.IO y registro de namespaces.
 */

import { Server } from 'socket.io';
import { authenticateSocket } from './auth/socketAuth.js';
import { registerSolicitudHandlers } from './namespaces/solicitudNamespace.js';
import { registerCotizacionHandlers } from './namespaces/cotizacionNamespace.js';
import { registerServicioHandlers } from './namespaces/servicioNamespace.js';
import { registerTrackingHandlers } from './namespaces/trackingNamespace.js';
import { setIO } from './services/socketEmitter.js';
import logger from '../utils/logger.js';

/**
 * Inicializa Socket.IO sobre el servidor HTTP.
 * @param {import('http').Server} httpServer
 * @param {Object} corsOptions - Opciones CORS (reutilizadas de Express)
 * @returns {import('socket.io').Server}
 */
export const initializeSocket = (httpServer, corsOptions) => {
    const io = new Server(httpServer, {
        cors: {
            origin: corsOptions.origin,
            credentials: corsOptions.credentials ?? true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Registrar singleton para que controllers puedan emitir eventos
    setIO(io);

    // ─── Namespaces ───────────────────────────────────────

    // /solicitudes
    const solicitudesNsp = io.of('/solicitudes');
    solicitudesNsp.use(authenticateSocket);
    registerSolicitudHandlers(solicitudesNsp);

    // /cotizaciones
    const cotizacionesNsp = io.of('/cotizaciones');
    cotizacionesNsp.use(authenticateSocket);
    registerCotizacionHandlers(cotizacionesNsp);

    // /servicios
    const serviciosNsp = io.of('/servicios');
    serviciosNsp.use(authenticateSocket);
    registerServicioHandlers(serviciosNsp);

    // /tracking
    const trackingNsp = io.of('/tracking');
    trackingNsp.use(authenticateSocket);
    registerTrackingHandlers(trackingNsp);

    logger.info('Socket.IO inicializado con namespaces: /solicitudes, /cotizaciones, /servicios, /tracking');

    return io;
};
