/**
 * @fileoverview Password Utilities
 * Funciones para hashing, comparación y validación de contraseñas.
 */

import bcrypt from 'bcrypt';
import { ValidationError } from './errors/AppError.js';

/**
 * Número de rondas para bcrypt (costo de procesamiento)
 * Valores más altos = más seguro pero más lento
 * Recomendado: 10-12
 */
const SALT_ROUNDS = 10;

/**
 * Hashea una contraseña usando bcrypt
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<string>} Hash de la contraseña
 * @throws {ValidationError} Si la contraseña está vacía
 */
export const hashPassword = async (password) => {
    if (!password || typeof password !== 'string') {
        throw new ValidationError('La contraseña es requerida');
    }

    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        return hash;
    } catch (error) {
        throw new Error('Error al hashear la contraseña: ' + error.message);
    }
};

/**
 * Compara una contraseña en texto plano con su hash
 * @param {string} password - Contraseña en texto plano
 * @param {string} hash - Hash almacenado en la base de datos
 * @returns {Promise<boolean>} true si coinciden, false si no
 * @throws {ValidationError} Si faltan parámetros
 */
export const comparePassword = async (password, hash) => {
    if (!password || !hash) {
        throw new ValidationError('Se requieren contraseña y hash para comparar');
    }

    try {
        const isMatch = await bcrypt.compare(password, hash);
        return isMatch;
    } catch (error) {
        throw new Error('Error al comparar contraseñas: ' + error.message);
    }
};

/**
 * Valida la fortaleza de una contraseña
 * Requisitos:
 * - Mínimo 8 caracteres
 * - Al menos una letra mayúscula
 * - Al menos una letra minúscula
 * - Al menos un número
 * - Al menos un carácter especial (!@#$%^&*)
 *
 * @param {string} password - Contraseña a validar
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export const validatePasswordStrength = (password) => {
    const errors = [];

    if (!password || typeof password !== 'string') {
        return {
            isValid: false,
            errors: ['La contraseña es requerida']
        };
    }

    // Validar longitud mínima
    if (password.length < 8) {
        errors.push('La contraseña debe tener al menos 8 caracteres');
    }

    // Validar letra mayúscula
    if (!/[A-Z]/.test(password)) {
        errors.push('La contraseña debe contener al menos una letra mayúscula');
    }

    // Validar letra minúscula
    if (!/[a-z]/.test(password)) {
        errors.push('La contraseña debe contener al menos una letra minúscula');
    }

    // Validar número
    if (!/\d/.test(password)) {
        errors.push('La contraseña debe contener al menos un número');
    }

    // Validar carácter especial
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('La contraseña debe contener al menos un carácter especial (!@#$%^&*)');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};
