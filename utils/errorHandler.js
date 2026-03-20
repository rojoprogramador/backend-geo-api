/**
 * @fileoverview Centralized Error Handler
 * Maneja todos los errores de la aplicación de forma consistente.
 */

import logger from './logger.js';
import { AppError } from './errors/AppError.js';

/**
 * Maneja errores de Sequelize
 * @param {Error} error - Error de Sequelize
 * @returns {Object} Objeto con statusCode y mensaje apropiado
 */
const handleSequelizeError = (error) => {
    // Unique constraint violation
    if (error.name === 'SequelizeUniqueConstraintError') {
        const field = error.errors[0]?.path || 'campo';
        return {
            statusCode: 409,
            message: `El ${field} ya está registrado en el sistema`
        };
    }

    // Validation error
    if (error.name === 'SequelizeValidationError') {
        const messages = error.errors.map(err => err.message);
        return {
            statusCode: 400,
            message: 'Error de validación',
            errors: messages
        };
    }

    // Foreign key constraint
    if (error.name === 'SequelizeForeignKeyConstraintError') {
        return {
            statusCode: 409,
            message: 'No se puede completar la operación debido a restricciones de integridad referencial'
        };
    }

    // Database connection error
    if (error.name === 'SequelizeConnectionError') {
        return {
            statusCode: 503,
            message: 'Error de conexión con la base de datos'
        };
    }

    return null;
};

/**
 * Maneja errores de JSON Web Token
 * @param {Error} error - Error de JWT
 * @returns {Object|null} Objeto con statusCode y mensaje apropiado
 */
const handleJWTError = (error) => {
    if (error.name === 'JsonWebTokenError') {
        return {
            statusCode: 401,
            message: 'Token inválido'
        };
    }

    if (error.name === 'TokenExpiredError') {
        return {
            statusCode: 401,
            message: 'El token ha expirado'
        };
    }

    return null;
};

/**
 * Envía respuesta de error en desarrollo (incluye stack trace)
 * @param {Error} err - Error
 * @param {Object} res - Response object de Express
 */
const sendErrorDev = (err, res) => {
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        error: err,
        stack: err.stack,
        ...(err.errors && { errors: err.errors })
    });
};

/**
 * Envía respuesta de error en producción (oculta detalles internos)
 * @param {Error} err - Error
 * @param {Object} res - Response object de Express
 */
const sendErrorProd = (err, res) => {
    const statusCode = err.statusCode || 500;

    // Error operacional: enviar mensaje al cliente
    if (err.isOperational) {
        res.status(statusCode).json({
            success: false,
            message: err.message,
            ...(err.errors && { errors: err.errors })
        });
    } else {
        // Error de programación: no filtrar detalles al cliente
        logger.error('ERROR NO OPERACIONAL:', err);

        res.status(500).json({
            success: false,
            message: 'Ha ocurrido un error interno del servidor'
        });
    }
};

/**
 * Middleware de manejo de errores global
 * Debe ser el ÚLTIMO middleware en index.js
 *
 * @param {Error} err - Error capturado
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware (no usado pero requerido por Express)
 */
export const globalErrorHandler = (err, req, res, next) => {
    // Log del error
    logger.error({
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    // Copiar error para no mutar el original
    let error = { ...err };
    error.message = err.message;
    error.statusCode = err.statusCode;
    error.isOperational = err.isOperational;

    // Manejar errores específicos de Sequelize
    const sequelizeError = handleSequelizeError(err);
    if (sequelizeError) {
        error.statusCode = sequelizeError.statusCode;
        error.message = sequelizeError.message;
        error.isOperational = true;
        if (sequelizeError.errors) {
            error.errors = sequelizeError.errors;
        }
    }

    // Manejar errores de JWT
    const jwtError = handleJWTError(err);
    if (jwtError) {
        error.statusCode = jwtError.statusCode;
        error.message = jwtError.message;
        error.isOperational = true;
    }

    // Enviar respuesta según el entorno
    const env = process.env.NODE_ENV || 'development';
    if (env === 'development') {
        sendErrorDev(error, res);
    } else {
        sendErrorProd(error, res);
    }
};

/**
 * Función helper para usar en bloques try-catch de controllers
 * Simplifica el manejo de errores en controllers
 *
 * @param {Object} res - Response object de Express
 * @param {Error} error - Error capturado
 */
export const handleError = (res, error) => {
    // Si es un AppError, usar su statusCode
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message,
            ...(error.errors && { errors: error.errors })
        });
    }

    // Si no es un AppError, logear y devolver 500
    logger.error('Error no controlado:', error);

    return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
    });
};
