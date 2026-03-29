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
 * Trazabilidad uniforme de entregas por canal/evento.
 * @param {Object} params
 * @param {'WS'|'PUSH'} params.canal
 * @param {string} params.evento
 * @param {'ENVIADO'|'ERROR'} params.resultado
 * @param {number|null} [params.id_solicitud]
 * @param {number|null} [params.id_tecnico]
 * @param {number|null} [params.id_usuario]
 * @param {string} [params.detalle]
 */
const logDelivery = ({
    canal,
    evento,
    resultado,
    id_solicitud = null,
    id_tecnico = null,
    id_usuario = null,
    detalle = '',
}) => {
    const suffix = detalle ? ` detalle=${detalle}` : '';
    logger.info(
        `delivery canal=${canal} evento=${evento} resultado=${resultado} ` +
        `id_solicitud=${id_solicitud ?? 'null'} id_tecnico=${id_tecnico ?? 'null'} ` +
        `id_usuario=${id_usuario ?? 'null'}${suffix}`
    );
};

/**
 * Envía push notification con trazabilidad automática (best-effort, fire-and-forget).
 * @param {number} idUsuario
 * @param {Object} pushPayload - { tipo, titulo, mensaje, datos }
 * @param {Object} logCtx     - { evento, id_solicitud, id_tecnico, id_usuario }
 */
const pushConLog = (idUsuario, pushPayload, logCtx) => {
    enviarPushNotificacion(idUsuario, pushPayload)
        .then(() => {
            logDelivery({ canal: 'PUSH', resultado: 'ENVIADO', ...logCtx });
        })
        .catch((error) => {
            logDelivery({
                canal: 'PUSH',
                resultado: 'ERROR',
                ...logCtx,
                detalle: error?.message || 'error_desconocido',
            });
        });
};

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

        logDelivery({
            canal: 'WS',
            evento: SERVER_EVENTS.NUEVA_SOLICITUD,
            resultado: 'ENVIADO',
            id_solicitud,
            id_tecnico: tecnico.id_tecnico,
            id_usuario: tecnico.id_usuario,
            detalle: `room=tecnico:${tecnico.id_tecnico}`,
        });
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
    )
        .then((results) => {
            results.forEach((result, idx) => {
                const t = tecnicos[idx];
                if (result.status === 'fulfilled') {
                    logDelivery({
                        canal: 'PUSH',
                        evento: 'NUEVA_SOLICITUD',
                        resultado: 'ENVIADO',
                        id_solicitud,
                        id_tecnico: t.id_tecnico,
                        id_usuario: t.id_usuario,
                    });
                    return;
                }
                logDelivery({
                    canal: 'PUSH',
                    evento: 'NUEVA_SOLICITUD',
                    resultado: 'ERROR',
                    id_solicitud,
                    id_tecnico: t.id_tecnico,
                    id_usuario: t.id_usuario,
                    detalle: result.reason?.message || 'error_desconocido',
                });
            });
        })
        .catch((error) => {
            logDelivery({
                canal: 'PUSH',
                evento: 'NUEVA_SOLICITUD',
                resultado: 'ERROR',
                id_solicitud,
                detalle: error?.message || 'error_desconocido',
            });
        });
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

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.SOLICITUD_CANCELADA,
        resultado: 'ENVIADO',
        id_solicitud,
        detalle: `room=solicitud:${id_solicitud}`,
    });

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

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.NUEVA_COTIZACION,
        resultado: 'ENVIADO',
        id_solicitud,
        id_tecnico: cotizacionData?.id_tecnico ?? null,
        id_usuario: id_cliente_usuario,
        detalle: `room=user:${id_cliente_usuario}`,
    });

    logger.info(
        `socketEmitter: emitNuevaCotizacion cotizacion=${cotizacionData.id_cotizacion} -> user:${id_cliente_usuario}`
    );

    // ── Push notification al cliente ──
    pushConLog(id_cliente_usuario, {
        tipo: 'COTIZACION_RECIBIDA',
        titulo: 'Nueva cotización recibida',
        mensaje: `Cotización de $${cotizacionData.valor_cotizacion || 0}`,
        datos: { id_solicitud, id_cotizacion: cotizacionData.id_cotizacion },
    }, {
        evento: 'COTIZACION_RECIBIDA',
        id_solicitud,
        id_tecnico: cotizacionData?.id_tecnico ?? null,
        id_usuario: id_cliente_usuario,
    });
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
    const payloadUnificado = cotizacionData?.datos
        ? cotizacionData
        : {
            tipo: 'COTIZACION_ACEPTADA',
            datos: {
                id_solicitud,
                ...cotizacionData,
            },
        };

    nspCotizaciones.to(`user:${id_tecnico_ganador_usuario}`).emit(
        SERVER_EVENTS.COTIZACION_ACEPTADA,
        payloadUnificado
    );

    logger.info(
        `delivery canal=WS evento=${SERVER_EVENTS.COTIZACION_ACEPTADA} resultado=ENVIADO ` +
        `id_solicitud=${id_solicitud} id_tecnico=${payloadUnificado?.datos?.id_tecnico ?? 'null'}`
    );

    for (const idUsuarioTecnico of tecnicosRechazados) {
        nspCotizaciones.to(`user:${idUsuarioTecnico}`).emit(
            SERVER_EVENTS.COTIZACION_RECHAZADA,
            { id_solicitud, razon: 'OTRA_ACEPTADA' }
        );

        logDelivery({
            canal: 'WS',
            evento: SERVER_EVENTS.COTIZACION_RECHAZADA,
            resultado: 'ENVIADO',
            id_solicitud,
            id_tecnico: null,
            id_usuario: idUsuarioTecnico,
            detalle: `room=user:${idUsuarioTecnico}`,
        });
    }

    io.of('/solicitudes').to(`solicitud:${id_solicitud}`).emit(
        SERVER_EVENTS.SOLICITUD_ASIGNADA,
        { id_solicitud }
    );

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.SOLICITUD_ASIGNADA,
        resultado: 'ENVIADO',
        id_solicitud,
        id_tecnico: payloadUnificado?.datos?.id_tecnico ?? null,
        detalle: `room=solicitud:${id_solicitud}`,
    });

    logger.info(
        `socketEmitter: emitCotizacionAceptada solicitud=${id_solicitud} ganador=user:${id_tecnico_ganador_usuario}`
    );

    // ── Push notification al técnico ganador ──
    pushConLog(id_tecnico_ganador_usuario, {
        tipo: 'COTIZACION_ACEPTADA',
        titulo: '¡Tu cotización fue aceptada!',
        mensaje: 'El cliente aceptó tu cotización. Prepárate para el servicio.',
        datos: payloadUnificado.datos,
    }, {
        evento: 'COTIZACION_ACEPTADA',
        id_solicitud,
        id_tecnico: payloadUnificado?.datos?.id_tecnico ?? null,
        id_usuario: id_tecnico_ganador_usuario,
    });
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

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.COTIZACION_RECHAZADA,
        resultado: 'ENVIADO',
        id_solicitud,
        id_usuario: id_tecnico_usuario,
        detalle: `room=user:${id_tecnico_usuario}`,
    });

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

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.SERVICIO_INICIADO,
        resultado: 'ENVIADO',
        id_solicitud,
        id_tecnico: servicioData?.id_tecnico ?? null,
        id_usuario: id_cliente_usuario,
        detalle: `room=user:${id_cliente_usuario}`,
    });

    logger.info(
        `socketEmitter: emitServicioIniciado solicitud=${id_solicitud} -> user:${id_cliente_usuario}`
    );

    // ── Push notification al cliente ──
    pushConLog(id_cliente_usuario, {
        tipo: 'SERVICIO_INICIADO',
        titulo: 'Servicio iniciado',
        mensaje: 'El técnico ha iniciado el servicio',
        datos: { id_solicitud, id_servicio: servicioData.id_servicio },
    }, {
        evento: 'SERVICIO_INICIADO',
        id_solicitud,
        id_tecnico: servicioData?.id_tecnico ?? null,
        id_usuario: id_cliente_usuario,
    });
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

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.SERVICIO_FINALIZADO,
        resultado: 'ENVIADO',
        id_solicitud,
        id_tecnico: servicioData?.id_tecnico ?? null,
        id_usuario: id_cliente_usuario,
        detalle: `room=user:${id_cliente_usuario}`,
    });

    logger.info(
        `socketEmitter: emitServicioFinalizado solicitud=${id_solicitud} -> user:${id_cliente_usuario}`
    );

    // ── Push notification al cliente ──
    pushConLog(id_cliente_usuario, {
        tipo: 'SERVICIO_COMPLETADO',
        titulo: 'Servicio completado',
        mensaje: 'El servicio ha finalizado. Por favor califica al técnico.',
        datos: { id_solicitud, id_servicio: servicioData.id_servicio },
    }, {
        evento: 'SERVICIO_COMPLETADO',
        id_solicitud,
        id_tecnico: servicioData?.id_tecnico ?? null,
        id_usuario: id_cliente_usuario,
    });
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

    logDelivery({
        canal: 'WS',
        evento: SERVER_EVENTS.CALIFICACION_RECIBIDA,
        resultado: 'ENVIADO',
        id_solicitud: calificacionData?.id_solicitud ?? null,
        id_tecnico: calificacionData?.id_tecnico ?? null,
        id_usuario: id_tecnico_usuario,
        detalle: `room=user:${id_tecnico_usuario}`,
    });

    logger.info(
        `socketEmitter: emitCalificacionRecibida -> user:${id_tecnico_usuario}`
    );

    // ── Push notification al técnico ──
    pushConLog(id_tecnico_usuario, {
        tipo: 'CALIFICACION_RECIBIDA',
        titulo: 'Nueva calificación recibida',
        mensaje: `Recibiste una calificación de ${calificacionData.puntuacion || calificacionData.calificacion || ''} estrellas`,
        datos: calificacionData,
    }, {
        evento: 'CALIFICACION_RECIBIDA',
        id_solicitud: calificacionData?.id_solicitud ?? null,
        id_tecnico: calificacionData?.id_tecnico ?? null,
        id_usuario: id_tecnico_usuario,
    });
};
