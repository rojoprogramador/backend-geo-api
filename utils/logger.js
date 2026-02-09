/**
 * @fileoverview Winston Logger Configuration
 * Sistema de logging centralizado con niveles diferenciados para desarrollo y producción.
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

/**
 * Formato personalizado para logs
 */
const customFormat = printf(({ level, message, timestamp, stack }) => {
    if (stack) {
        // Para errores, incluir stack trace
        return `${timestamp} [${level}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level}]: ${message}`;
});

/**
 * Configuración de niveles de log
 * error: 0, warn: 1, info: 2, http: 3, debug: 4
 */
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

/**
 * Determina el nivel de log según el entorno
 */
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'info';
};

/**
 * Configuración de transports
 */
const transports = [
    // Consola - siempre activo
    new winston.transports.Console({
        format: combine(
            colorize({ all: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            errors({ stack: true }),
            customFormat
        ),
    }),

    // Archivo de errores - solo errores y warnings
    new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: combine(
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            errors({ stack: true }),
            customFormat
        ),
    }),

    // Archivo combinado - todos los logs
    new winston.transports.File({
        filename: 'logs/combined.log',
        format: combine(
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            errors({ stack: true }),
            customFormat
        ),
    }),
];

/**
 * Instancia del logger
 */
const logger = winston.createLogger({
    level: level(),
    levels,
    transports,
    // No salir en caso de error
    exitOnError: false,
});

/**
 * Stream para Morgan (logging de requests HTTP)
 */
logger.stream = {
    write: (message) => logger.http(message.trim()),
};

export default logger;
