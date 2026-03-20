/**
 * @fileoverview Custom Error Classes Hierarchy
 * Centraliza todos los tipos de errores de la aplicación con códigos HTTP apropiados.
 */

/**
 * Clase base para errores de aplicación
 * @extends Error
 */
class AppError extends Error {
    /**
     * @param {string} message - Mensaje de error
     * @param {number} statusCode - Código HTTP
     * @param {boolean} isOperational - Si es un error operacional (esperado) o de programación
     */
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error 400 - Validación de entrada fallida
 */
class ValidationError extends AppError {
    constructor(message = 'Error de validación', errors = []) {
        super(message, 400);
        this.errors = errors; // Array de errores específicos de validación
    }
}

/**
 * Error 401 - No autenticado
 */
class UnauthorizedError extends AppError {
    constructor(message = 'No autorizado. Token inválido o expirado') {
        super(message, 401);
    }
}

/**
 * Error 403 - Autenticado pero sin permisos
 */
class ForbiddenError extends AppError {
    constructor(message = 'Acceso denegado. No tienes permisos suficientes') {
        super(message, 403);
    }
}

/**
 * Error 404 - Recurso no encontrado
 */
class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado') {
        super(message, 404);
    }
}

/**
 * Error 409 - Conflicto (ej. duplicado, estado inválido)
 */
class ConflictError extends AppError {
    constructor(message = 'Conflicto con el estado actual del recurso') {
        super(message, 409);
    }
}

/**
 * Error 500 - Error interno del servidor
 */
class InternalServerError extends AppError {
    constructor(message = 'Error interno del servidor', isOperational = false) {
        super(message, 500, isOperational);
    }
}

export {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    InternalServerError
};
