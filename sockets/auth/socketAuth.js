/**
 * @fileoverview Middleware de autenticación JWT para Socket.IO.
 * Reutiliza verifyToken y extractTokenFromHeader de utils/jwtUtils.js.
 */

import { verifyToken, extractTokenFromHeader } from '../../utils/jwtUtils.js';
import { Cliente, Tecnico } from '../../models/index.js';
import logger from '../../utils/logger.js';

/**
 * Middleware de Socket.IO para autenticar conexiones via JWT.
 *
 * Extrae el token de:
 *   1. socket.handshake.auth.token  (recomendado — nativo Socket.IO)
 *   2. socket.handshake.headers.authorization (fallback — esquema Bearer)
 *
 * En éxito: popula socket.usuario con el payload JWT decodificado
 *           y socket.perfil con { id_cliente } o { id_tecnico }.
 * En fallo: llama next(error) rechazando la conexión.
 */
export const authenticateSocket = async (socket, next) => {
    try {
        const token =
            socket.handshake.auth?.token ||
            extractTokenFromHeader(socket.handshake.headers?.authorization);

        if (!token) {
            return next(new Error('No se proporcionó token de autenticación'));
        }

        const decoded = verifyToken(token);

        socket.usuario = decoded;

        if (decoded.rol === 'CLIENTE') {
            const cliente = await Cliente.findOne({
                where: { id_usuario: decoded.id_usuario },
                attributes: ['id_cliente'],
            });
            socket.perfil = cliente ? { id_cliente: cliente.id_cliente } : {};
        } else if (decoded.rol === 'TECNICO') {
            const tecnico = await Tecnico.findOne({
                where: { id_usuario: decoded.id_usuario },
                attributes: ['id_tecnico'],
            });
            socket.perfil = tecnico ? { id_tecnico: tecnico.id_tecnico } : {};
        } else {
            socket.perfil = {};
        }

        logger.info(
            `socketAuth: Autenticado id_usuario=${decoded.id_usuario} rol=${decoded.rol} socket=${socket.id}`
        );

        next();
    } catch (error) {
        logger.warn(`socketAuth: Autenticación fallida: ${error.message}`);
        next(new Error(error.message || 'Token inválido o expirado'));
    }
};
