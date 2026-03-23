/**
 * @fileoverview Namespace /tracking — GPS en vivo del técnico al cliente.
 *
 * El técnico envía su ubicación periódicamente (client:tecnico_ubicacion).
 * El servidor:
 *   1. Throttle (max 1 update / 3s por técnico)
 *   2. Guarda en TrackingUbicacion (fire-and-forget)
 *   3. Calcula distancia restante via PostGIS
 *   4. Relay al cliente en la room tracking:{id_solicitud}
 *   5. Emite alertas de proximidad (tecnico_cerca, tecnico_llego)
 */

import { QueryTypes } from 'sequelize';
import { sequelize, TrackingUbicacion, Cita } from '../../models/index.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../constants/events.js';
import logger from '../../utils/logger.js';

const THROTTLE_MS = 3000;

/** @type {Map<number, number>} id_tecnico → timestamp del último update */
const lastUpdateTimestamp = new Map();

/**
 * Registra los handlers del namespace /tracking.
 * @param {import('socket.io').Namespace} nsp
 */
export const registerTrackingHandlers = (nsp) => {
    nsp.on('connection', (socket) => {
        const { id_usuario, rol } = socket.usuario;

        socket.join(`user:${id_usuario}`);

        // Unirse a room de tracking
        socket.on(CLIENT_EVENTS.JOIN_TRACKING_ROOM, ({ id_solicitud }) => {
            if (!id_solicitud) {
                socket.emit(SERVER_EVENTS.ERROR, { message: 'id_solicitud requerido' });
                return;
            }
            socket.join(`tracking:${id_solicitud}`);
            logger.debug(`trackingNsp: user:${id_usuario} joined tracking:${id_solicitud}`);
        });

        socket.on(CLIENT_EVENTS.LEAVE_TRACKING_ROOM, ({ id_solicitud }) => {
            if (!id_solicitud) return;
            socket.leave(`tracking:${id_solicitud}`);
        });

        // TECNICO envía su ubicación GPS
        socket.on(CLIENT_EVENTS.TECNICO_SEND_LOCATION, async (data) => {
            if (rol !== 'TECNICO') {
                socket.emit(SERVER_EVENTS.ERROR, { message: 'Solo técnicos pueden enviar ubicación' });
                return;
            }

            const id_tecnico = socket.perfil?.id_tecnico;
            if (!id_tecnico) return;

            // Throttle
            const now = Date.now();
            const lastUpdate = lastUpdateTimestamp.get(id_tecnico) || 0;
            if (now - lastUpdate < THROTTLE_MS) return;
            lastUpdateTimestamp.set(id_tecnico, now);

            try {
                const { id_solicitud, latitud, longitud, velocidad_kmh, en_movimiento } = data;

                // Validar coordenadas
                const lat = parseFloat(latitud);
                const lng = parseFloat(longitud);
                if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    socket.emit(SERVER_EVENTS.ERROR, { message: 'Coordenadas inválidas' });
                    return;
                }

                // Guardar en BD (fire-and-forget)
                const cita = await Cita.findOne({
                    where: { id_solicitud: Number(id_solicitud) },
                    attributes: ['id_cita'],
                    order: [['createdAt', 'DESC']],
                });

                TrackingUbicacion.create({
                    id_cita: cita?.id_cita || null,
                    id_solicitud: Number(id_solicitud),
                    id_tecnico,
                    ubicacion_actual: {
                        type: 'Point',
                        coordinates: [lng, lat],
                    },
                    velocidad_kmh: velocidad_kmh || null,
                    en_movimiento: en_movimiento !== false,
                }).catch(err => logger.error('trackingNsp: Error guardando ubicación en BD', err));

                // Calcular distancia restante via PostGIS
                let distancia_restante_metros = null;
                try {
                    const [result] = await sequelize.query(
                        `SELECT ST_Distance(
                            ST_SetSRID(ST_MakePoint(:lng_tecnico, :lat_tecnico), 4326)::geography,
                            s.ubicacion_solicitud::geography
                        ) AS distancia
                        FROM "Solicitud" s
                        WHERE s.id_solicitud = :id_solicitud`,
                        {
                            replacements: {
                                lng_tecnico: lng,
                                lat_tecnico: lat,
                                id_solicitud: Number(id_solicitud),
                            },
                            type: QueryTypes.SELECT,
                        }
                    );
                    distancia_restante_metros = result
                        ? Math.round(parseFloat(result.distancia))
                        : null;
                } catch (err) {
                    logger.error('trackingNsp: Error calculando distancia', err);
                }

                // Relay al cliente
                const payload = {
                    id_solicitud: Number(id_solicitud),
                    id_tecnico,
                    latitud: lat,
                    longitud: lng,
                    velocidad_kmh: velocidad_kmh || 0,
                    en_movimiento: en_movimiento !== false,
                    timestamp: new Date().toISOString(),
                    distancia_restante_metros,
                };

                socket.to(`tracking:${id_solicitud}`).emit(
                    SERVER_EVENTS.TECNICO_UBICACION,
                    payload
                );

                // Alertas de proximidad
                if (distancia_restante_metros !== null) {
                    if (distancia_restante_metros <= 500 && distancia_restante_metros > 50) {
                        socket.to(`tracking:${id_solicitud}`).emit(
                            SERVER_EVENTS.TECNICO_CERCA,
                            { id_solicitud: Number(id_solicitud), distancia_metros: distancia_restante_metros }
                        );
                    } else if (distancia_restante_metros <= 50 && (velocidad_kmh || 0) < 5) {
                        socket.to(`tracking:${id_solicitud}`).emit(
                            SERVER_EVENTS.TECNICO_LLEGO,
                            { id_solicitud: Number(id_solicitud) }
                        );
                    }
                }

            } catch (error) {
                logger.error(`trackingNsp: Error procesando ubicación técnico ${id_tecnico}`, error);
                socket.emit(SERVER_EVENTS.ERROR, { message: 'Error procesando ubicación' });
            }
        });

        socket.on('disconnect', () => {
            const id_tecnico = socket.perfil?.id_tecnico;
            if (id_tecnico) {
                lastUpdateTimestamp.delete(id_tecnico);
            }
            logger.info(`trackingNsp: Desconectado user:${id_usuario} socket=${socket.id}`);
        });
    });
};
