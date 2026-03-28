/**
 * @fileoverview Push Notification Service (Expo).
 * Envía push notifications via Expo Push API y crea registros en Notificacion.
 * Best-effort: errores de push no bloquean el flujo principal.
 */

import { Expo } from 'expo-server-sdk';
import { Usuario, Notificacion } from '../models/index.js';
import logger from '../utils/logger.js';

const expo = new Expo();

/**
 * Envía push notification a un usuario y crea registro en BD.
 * @param {number} idUsuario
 * @param {Object} params
 * @param {string} params.tipo - Tipo ENUM de Notificacion
 * @param {string} params.titulo
 * @param {string} params.mensaje
 * @param {Object} [params.datos] - datos_adicionales (JSON)
 * @returns {Promise<Object|null>} Notificación creada o null
 */
export const enviarPushNotificacion = async (idUsuario, { tipo, titulo, mensaje, datos = null }) => {
    try {
        const usuario = await Usuario.findByPk(idUsuario, {
            attributes: ['id_usuario', 'expo_push_token'],
        });

        if (!usuario) {
            logger.warn(`pushService: Usuario ${idUsuario} no encontrado`);
            return null;
        }

        // Crear registro en BD (siempre, incluso sin token)
        const notificacion = await Notificacion.create({
            id_usuario: idUsuario,
            tipo,
            titulo,
            mensaje,
            datos_adicionales: datos,
            leida: false,
            push_enviado: false,
            fecha_envio: new Date(),
        });

        const pushToken = usuario.expo_push_token;

        if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
            logger.info(
                `pushService: Usuario ${idUsuario} sin token válido — ` +
                `notificación ${notificacion.id_notificacion} solo en BD`
            );
            return notificacion;
        }

        // Enviar via Expo
        const [ticket] = await expo.sendPushNotificationsAsync([{
            to: pushToken,
            sound: 'default',
            title: titulo,
            body: mensaje,
            data: datos || {},
            priority: 'high',
            channelId: 'default',
        }]);

        if (ticket.status === 'error') {
            logger.error(
                `pushService: Error push usuario ${idUsuario}: ${ticket.message}`
            );
            return notificacion;
        }

        await notificacion.update({ push_enviado: true });

        logger.info(
            `pushService: Push enviado a usuario ${idUsuario} (notif ${notificacion.id_notificacion})`
        );

        return notificacion;
    } catch (error) {
        logger.error(`pushService: Error para usuario ${idUsuario}: ${error.message}`);
        return null;
    }
};
