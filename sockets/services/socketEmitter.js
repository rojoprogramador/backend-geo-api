/**
 * @fileoverview Singleton bridge entre controllers REST y Socket.IO.
 * Los controllers importan este módulo para emitir eventos en tiempo real
 * DESPUÉS de que las transacciones de BD hayan sido committed.
 *
 * Si io es null (tests, socket no inicializado), los emits son no-ops silenciosos.
 */

import logger from '../../utils/logger.js';
import { SERVER_EVENTS } from '../constants/events.js';
import { enviarPushNotificacion } from '../../services/pushService.js';

/** @type {import('socket.io').Server|null} */
let io = null;

/**
 * Establece la instancia de Socket.IO. Se llama una vez al iniciar el servidor.
 * @param {import('socket.io').Server} socketIOInstance
 */
export const setIO = (socketIOInstance) => {
    io = socketIOInstance;
};

/**
 * Retorna la instancia de Socket.IO.
 * @returns {import('socket.io').Server|null}
 */
export const getIO = () => {
    if (!io) {
        logger.warn('socketEmitter: getIO llamado antes de setIO');
    }
    return io;
};

// ─── Solicitudes ──────────────────────────────────────────

/**
 * Notifica a técnicos cercanos sobre una nueva solicitud.
 * @param {Object} params
 * @param {number} params.id_solicitud
 * @param {Object} params.solicitudData - Resumen para la notificación
 * @param {Array<{id_tecnico: number, id_usuario: number, distancia_metros: number, priority_score: number}>} params.tecnicos
 */
export const emitNuevaSolicitud = (params) => {
    if (!io) return;

    const { id_solicitud, solicitudData, tecnicos } = params;
    const nsp = io.of('/solicitudes');

    for (const tecnico of tecnicos) {
        nsp.to(`tecnico:${tecnico.id_tecnico}`).emit(
            SERVER_EVENTS.NUEVA_SOLICITUD,
            {
                ...solicitudData,
                distancia_metros: tecnico.distancia_metros,
                priority_score: tecnico.priority_score,
            }
        );
    }

    logger.info(
        `socketEmitter: emitNuevaSolicitud solicitud=${id_solicitud} -> ${tecnicos.length} técnicos`
    );

    // ── Push notifications (best-effort, fire-and-forget) ──
    Promise.allSettled(
        tecnicos.map(t => enviarPushNotificacion(t.id_usuario, {
            tipo: 'NUEVA_SOLICITUD',
            titulo: 'Nueva solicitud cercana',
            mensaje: `${solicitudData.subcategoria || 'Servicio'} — ${solicitudData.descripcion || ''}`.slice(0, 200),
            datos: { id_solicitud, distancia_metros: t.distancia_metros },
        }))
    ).catch(() => {});
};

/**
 * Notifica a todos en la room de una solicitud que fue cancelada.
 * @param {Object} params
 * @param {number} params.id_solicitud
 */
export const emitSolicitudCancelada = (params) => {
    if (!io) return;
    const { id_solicitud } = params;

    io.of('/solicitudes').to(`solicitud:${id_solicitud}`).emit(
        SERVER_EVENTS.SOLICITUD_CANCELADA,
        { id_solicitud }
    );

    logger.info(`socketEmitter: emitSolicitudCancelada solicitud=${id_solicitud}`);
};

// ─── Cotizaciones ─────────────────────────────────────────

/**
 * Notifica al cliente que recibió una nueva cotización.
 * @param {Object} params
 * @param {number} params.id_solicitud
 * @param {number} params.id_cliente_usuario - id_usuario del cliente
 * @param {Object} params.cotizacionData - Datos de la cotización
 */
export const emitNuevaCotizacion = (params) => {
    if (!io) return;
    const { id_solicitud, id_cliente_usuario, cotizacionData } = params;

    io.of('/cotizaciones').to(`user:${id_cliente_usuario}`).emit(
        SERVER_EVENTS.NUEVA_COTIZACION,
        cotizacionData
    );

    logger.info(
        `socketEmitter: emitNuevaCotizacion cotizacion=${cotizacionData.id_cotizacion} -> user:${id_cliente_usuario}`
    );

    // ── Push notification al cliente ──
    enviarPushNotificacion(id_cliente_usuario, {
        tipo: 'COTIZACION_RECIBIDA',
        titulo: 'Nueva cotización recibida',
        mensaje: `Cotización de $${cotizacionData.valor_cotizacion || 0}`,
        datos: { id_solicitud, id_cotizacion: cotizacionData.id_cotizacion },
    }).catch(() => {});
};

/**
 * Notifica al técnico ganador y a los perdedores sobre aceptación de cotización.
 * @param {Object} params
 * @param {number} params.id_solicitud
 * @param {number} params.id_tecnico_ganador_usuario - id_usuario del técnico ganador
 * @param {number[]} params.tecnicosRechazados - id_usuario de técnicos rechazados
 * @param {Object} params.cotizacionData - Datos de la cotización aceptada
 */
export const emitCotizacionAceptada = (params) => {
    if (!io) return;
    const { id_solicitud, id_tecnico_ganador_usuario, tecnicosRechazados, cotizacionData } = params;
    const nspCotizaciones = io.of('/cotizaciones');

    nspCotizaciones.to(`user:${id_tecnico_ganador_usuario}`).emit(
        SERVER_EVENTS.COTIZACION_ACEPTADA,
        cotizacionData
    );

    for (const idUsuarioTecnico of tecnicosRechazados) {
        nspCotizaciones.to(`user:${idUsuarioTecnico}`).emit(
            SERVER_EVENTS.COTIZACION_RECHAZADA,
            { id_solicitud, razon: 'OTRA_ACEPTADA' }
        );
    }

    io.of('/solicitudes').to(`solicitud:${id_solicitud}`).emit(
        SERVER_EVENTS.SOLICITUD_ASIGNADA,
        { id_solicitud }
    );

    logger.info(
        `socketEmitter: emitCotizacionAceptada solicitud=${id_solicitud} ganador=user:${id_tecnico_ganador_usuario}`
    );

    // ── Push notification al técnico ganador ──
    enviarPushNotificacion(id_tecnico_ganador_usuario, {
        tipo: 'COTIZACION_ACEPTADA',
        titulo: '¡Tu cotización fue aceptada!',
        mensaje: 'El cliente aceptó tu cotización. Prepárate para el servicio.',
        datos: { id_solicitud },
    }).catch(() => {});
};

/**
 * Notifica a un técnico que su cotización fue rechazada individualmente.
 * @param {Object} params
 * @param {number} params.id_solicitud
 * @param {number} params.id_cotizacion
 * @param {number} params.id_tecnico_usuario - id_usuario del técnico
 */
export const emitCotizacionRechazada = (params) => {
    if (!io) return;
    const { id_solicitud, id_cotizacion, id_tecnico_usuario } = params;

    io.of('/cotizaciones').to(`user:${id_tecnico_usuario}`).emit(
        SERVER_EVENTS.COTIZACION_RECHAZADA,
        { id_solicitud, id_cotizacion, razon: 'RECHAZADA_POR_CLIENTE' }
    );

    logger.info(
        `socketEmitter: emitCotizacionRechazada cotizacion=${id_cotizacion} -> user:${id_tecnico_usuario}`
    );
};

// ─── Servicios ────────────────────────────────────────────

/**
 * Notifica al cliente que el servicio ha iniciado.
 * @param {Object} params
 * @param {number} params.id_solicitud
 * @param {number} params.id_cliente_usuario
 * @param {Object} params.servicioData
 */
export const emitServicioIniciado = (params) => {
    if (!io) return;
    const { id_solicitud, id_cliente_usuario, servicioData } = params;

    io.of('/servicios').to(`user:${id_cliente_usuario}`).emit(
        SERVER_EVENTS.SERVICIO_INICIADO,
        servicioData
    );

    logger.info(
        `socketEmitter: emitServicioIniciado solicitud=${id_solicitud} -> user:${id_cliente_usuario}`
    );

    // ── Push notification al cliente ──
    enviarPushNotificacion(id_cliente_usuario, {
        tipo: 'SERVICIO_INICIADO',
        titulo: 'Servicio iniciado',
        mensaje: 'El técnico ha iniciado el servicio',
        datos: { id_solicitud, id_servicio: servicioData.id_servicio },
    }).catch(() => {});
};

/**
 * Notifica al cliente que el servicio ha finalizado.
 * @param {Object} params
 * @param {number} params.id_solicitud
 * @param {number} params.id_cliente_usuario
 * @param {Object} params.servicioData
 */
export const emitServicioFinalizado = (params) => {
    if (!io) return;
    const { id_solicitud, id_cliente_usuario, servicioData } = params;

    io.of('/servicios').to(`user:${id_cliente_usuario}`).emit(
        SERVER_EVENTS.SERVICIO_FINALIZADO,
        servicioData
    );

    logger.info(
        `socketEmitter: emitServicioFinalizado solicitud=${id_solicitud} -> user:${id_cliente_usuario}`
    );

    // ── Push notification al cliente ──
    enviarPushNotificacion(id_cliente_usuario, {
        tipo: 'SERVICIO_COMPLETADO',
        titulo: 'Servicio completado',
        mensaje: 'El servicio ha finalizado. Por favor califica al técnico.',
        datos: { id_solicitud, id_servicio: servicioData.id_servicio },
    }).catch(() => {});
};

// ─── Calificaciones ───────────────────────────────────────

/**
 * Notifica al técnico que recibió una calificación.
 * @param {Object} params
 * @param {number} params.id_tecnico_usuario
 * @param {Object} params.calificacionData
 */
export const emitCalificacionRecibida = (params) => {
    if (!io) return;
    const { id_tecnico_usuario, calificacionData } = params;

    io.of('/servicios').to(`user:${id_tecnico_usuario}`).emit(
        SERVER_EVENTS.CALIFICACION_RECIBIDA,
        calificacionData
    );

    logger.info(
        `socketEmitter: emitCalificacionRecibida -> user:${id_tecnico_usuario}`
    );

    // ── Push notification al técnico ──
    enviarPushNotificacion(id_tecnico_usuario, {
        tipo: 'CALIFICACION_RECIBIDA',
        titulo: 'Nueva calificación recibida',
        mensaje: `Recibiste una calificación de ${calificacionData.puntuacion || calificacionData.calificacion || ''} estrellas`,
        datos: calificacionData,
    }).catch(() => {});
};
