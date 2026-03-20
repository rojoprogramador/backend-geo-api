// ---------------------------------------------------------------------------
// Helpers para obtener perfiles de Cliente/Técnico del usuario autenticado
// ---------------------------------------------------------------------------
import { Cliente, Tecnico } from '../models/index.js';
import { NotFoundError } from './errors/AppError.js';

/**
 * Busca el perfil de Cliente asociado a un id_usuario.
 * @param {number} id_usuario
 * @param {import('sequelize').Transaction|null} transaction
 * @returns {Promise<import('../models/Cliente.js').default>}
 * @throws {NotFoundError} si no existe el perfil
 */
export const obtenerCliente = async (id_usuario, transaction = null) => {
    const opts = { where: { id_usuario } };
    if (transaction) opts.transaction = transaction;

    const cliente = await Cliente.findOne(opts);
    if (!cliente) {
        throw new NotFoundError('No se encontró el perfil de cliente asociado a este usuario');
    }
    return cliente;
};

/**
 * Busca el perfil de Técnico asociado a un id_usuario.
 * @param {number} id_usuario
 * @param {import('sequelize').Transaction|null} transaction
 * @returns {Promise<import('../models/tecnico.js').default>}
 * @throws {NotFoundError} si no existe el perfil
 */
export const obtenerTecnico = async (id_usuario, transaction = null) => {
    const opts = { where: { id_usuario } };
    if (transaction) opts.transaction = transaction;

    const tecnico = await Tecnico.findOne(opts);
    if (!tecnico) {
        throw new NotFoundError('No se encontró el perfil de técnico asociado a este usuario');
    }
    return tecnico;
};
