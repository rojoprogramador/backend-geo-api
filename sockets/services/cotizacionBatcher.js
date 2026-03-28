/**
 * @fileoverview Lógica de batching de cotizaciones.
 * Espera 5 minutos O 5 cotizaciones (lo que ocurra primero) antes de
 * emitir server:cotizaciones_listas al cliente.
 *
 * NOTA: Las cotizaciones individuales se envían en tiempo real vía
 * emitNuevaCotizacion (cada una al llegar). Este batcher solo maneja
 * el evento de "ventana cerrada" para que el frontend muestre el CTA
 * de comparar cotizaciones.
 */

import logger from '../../utils/logger.js';
import { getIO } from './socketEmitter.js';
import { SERVER_EVENTS } from '../constants/events.js';
import { enviarPushNotificacion } from '../../services/pushService.js';

const BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
const MAX_COTIZACIONES = 5;

/** @type {Map<number, {timer: NodeJS.Timeout, count: number, id_cliente_usuario: number, closed: boolean}>} */
const activeBatches = new Map();

/**
 * Registra la llegada de una nueva cotización para batching.
 * Llamado desde cotizacionController.crearCotizacion DESPUÉS del commit.
 *
 * @param {number} id_solicitud
 * @param {number} id_cliente_usuario - id_usuario del cliente para targeting
 */
export const addCotizacion = (id_solicitud, id_cliente_usuario) => {
    let batch = activeBatches.get(id_solicitud);

    if (!batch) {
        batch = {
            count: 0,
            id_cliente_usuario,
            closed: false,
            timer: setTimeout(() => {
                closeBatch(id_solicitud, 'TIMEOUT');
            }, BATCH_TIMEOUT_MS),
        };
        activeBatches.set(id_solicitud, batch);

        logger.info(
            `cotizacionBatcher: Batch iniciado para solicitud=${id_solicitud}, timeout=5min`
        );
    }

    if (batch.closed) return;

    batch.count += 1;

    logger.info(
        `cotizacionBatcher: solicitud=${id_solicitud} cotización ${batch.count}/${MAX_COTIZACIONES}`
    );

    if (batch.count >= MAX_COTIZACIONES) {
        closeBatch(id_solicitud, 'MAX_COTIZACIONES');
    }
};

/**
 * Cierra el batch y notifica al cliente.
 * @param {number} id_solicitud
 * @param {'TIMEOUT'|'MAX_COTIZACIONES'} razon
 */
const closeBatch = (id_solicitud, razon) => {
    const batch = activeBatches.get(id_solicitud);
    if (!batch || batch.closed) return;

    batch.closed = true;
    clearTimeout(batch.timer);

    const io = getIO();
    if (io) {
        io.of('/cotizaciones')
            .to(`user:${batch.id_cliente_usuario}`)
            .emit(SERVER_EVENTS.COTIZACIONES_LISTAS, {
                id_solicitud,
                razon,
                total_cotizaciones: batch.count,
                mensaje: `Ya tienes ${batch.count} cotización(es) disponibles para comparar.`,
            });
    }

    logger.info(
        `cotizacionBatcher: Batch cerrado solicitud=${id_solicitud} razon=${razon} total=${batch.count}`
    );

    // ── Push notification al cliente (best-effort) ──
    enviarPushNotificacion(batch.id_cliente_usuario, {
        tipo: 'COTIZACIONES_LISTAS',
        titulo: 'Cotizaciones disponibles',
        mensaje: `Ya tienes ${batch.count} cotización(es) disponibles para comparar.`,
        datos: { id_solicitud, total_cotizaciones: batch.count },
    }).catch(() => {});

    setTimeout(() => activeBatches.delete(id_solicitud), 10000);
};

/**
 * Cancela un batch activo (cuando la solicitud se cancela o se acepta una cotización).
 * @param {number} id_solicitud
 */
export const cancelBatch = (id_solicitud) => {
    const batch = activeBatches.get(id_solicitud);
    if (batch) {
        clearTimeout(batch.timer);
        activeBatches.delete(id_solicitud);
        logger.info(`cotizacionBatcher: Batch cancelado para solicitud=${id_solicitud}`);
    }
};

/**
 * Limpia todos los batches activos (útil para tests).
 */
export const clearAllBatches = () => {
    for (const [, batch] of activeBatches) {
        clearTimeout(batch.timer);
    }
    activeBatches.clear();
};

/**
 * Retorna info del batch activo para una solicitud (útil para tests).
 * @param {number} id_solicitud
 * @returns {{count: number, closed: boolean}|undefined}
 */
export const getBatchInfo = (id_solicitud) => {
    const batch = activeBatches.get(id_solicitud);
    if (!batch) return undefined;
    return { count: batch.count, closed: batch.closed };
};
