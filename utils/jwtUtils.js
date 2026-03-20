/**
 * @fileoverview JWT Utilities
 * Funciones para generación, verificación y extracción de tokens JWT.
 */

import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errors/AppError.js';

/**
 * Genera un token JWT
 * @param {Object} payload - Datos a incluir en el token (id_usuario, rol, etc.)
 * @param {string} expiresIn - Tiempo de expiración (ej. '24h', '7d', '30m')
 * @returns {string} Token JWT firmado
 * @throws {Error} Si falta JWT_SECRET en variables de entorno
 */
export const generateToken = (payload, expiresIn = null) => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error('JWT_SECRET no está configurado en las variables de entorno');
    }

    if (!payload || typeof payload !== 'object') {
        throw new Error('El payload del token debe ser un objeto');
    }

    const options = {
        expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '24h'
    };

    try {
        const token = jwt.sign(payload, secret, options);
        return token;
    } catch (error) {
        throw new Error('Error al generar token: ' + error.message);
    }
};

/**
 * Verifica y decodifica un token JWT
 * @param {string} token - Token JWT a verificar
 * @returns {Object} Payload decodificado del token
 * @throws {UnauthorizedError} Si el token es inválido o expiró
 */
export const verifyToken = (token) => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error('JWT_SECRET no está configurado en las variables de entorno');
    }

    if (!token || typeof token !== 'string') {
        throw new UnauthorizedError('Token no proporcionado');
    }

    try {
        const decoded = jwt.verify(token, secret);
        return decoded;
    } catch (error) {
        // Distinguir entre token expirado y token inválido
        if (error.name === 'TokenExpiredError') {
            throw new UnauthorizedError('El token ha expirado');
        } else if (error.name === 'JsonWebTokenError') {
            throw new UnauthorizedError('Token inválido');
        } else {
            throw new UnauthorizedError('Error al verificar el token');
        }
    }
};

/**
 * Extrae el token del header Authorization
 * @param {string} authHeader - Header 'Authorization' de la request
 * @returns {string|null} Token extraído o null si no existe
 * @example
 * // Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * extractTokenFromHeader(req.headers.authorization); // "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */
export const extractTokenFromHeader = (authHeader) => {
    if (!authHeader || typeof authHeader !== 'string') {
        return null;
    }

    // Formato esperado: "Bearer <token>"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }

    return parts[1];
};

/**
 * Decodifica un token SIN verificar su firma (útil para debugging)
 * ⚠️ NO usar para autenticación, solo para inspección
 * @param {string} token - Token JWT
 * @returns {Object|null} Payload decodificado o null si el token es inválido
 */
export const decodeTokenUnsafe = (token) => {
    try {
        return jwt.decode(token);
    } catch (error) {
        return null;
    }
};
