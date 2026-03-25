// ---------------------------------------------------------------------------
// Expresiones regulares y funciones de validación compartidas
// ---------------------------------------------------------------------------

export const REGEX_NOMBRE    = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]{2,100}$/;
export const REGEX_DOCUMENTO = /^\d{6,12}$/;
export const REGEX_CORREO    = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const REGEX_TELEFONO  = /^3\d{9}$/;          // 10 dígitos que empiezan con 3
export const REGEX_FECHA     = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida la fortaleza de la contraseña:
 * mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial.
 * @param {string} password
 * @returns {boolean}
 */
export const esContrasenaFuerte = (password) => {
    if (!password || password.length < 8) return false;
    const tieneUpper  = /[A-Z]/.test(password);
    const tieneLower  = /[a-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    const tieneEsp    = /[^A-Za-z0-9]/.test(password);
    return tieneUpper && tieneLower && tieneNumero && tieneEsp;
};

/**
 * Valida el nombre de una categoría/subcategoría: letras, números, tildes, ñ,
 * espacios y guiones. Entre 3 y 50 caracteres.
 * @param {string} nombre
 * @returns {boolean}
 */
export const esNombreValido = (nombre) =>
    typeof nombre === 'string' && /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s\-0-9]{3,50}$/.test(nombre.trim());
