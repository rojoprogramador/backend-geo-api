import { 
    Garantia, 
    Servicio, 
    Cliente, 
    Tecnico, 
    Usuario, 
    Subcategoria,
    EstadoSolicitud
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors/AppError.js';
import { obtenerCliente, obtenerTecnico } from '../utils/profileHelpers.js';
import logger from '../utils/logger.js';

/**
 * Obtener detalle de garantía por ID de servicio
 */
export const obtenerGarantiaPorServicio = async (req, res) => {
    try {
        const idServicio = parseInt(req.params.id_servicio, 10);
        if (!idServicio || idServicio < 1) {
            throw new ValidationError('ID de servicio inválido');
        }

        const garantia = await Garantia.findOne({
            where: { id_servicio: idServicio },
            include: [
                {
                    model: Servicio,
                    as: 'servicio',
                    attributes: ['id_servicio', 'id_cliente', 'id_tecnico', 'id_estado', 'fecha_servicio'],
                    include: [
                        {
                            model: Subcategoria,
                            as: 'subcategoria',
                            attributes: ['nombre']
                        },
                        {
                            model: Tecnico,
                            as: 'tecnico',
                            attributes: ['id_tecnico'],
                            include: [{ model: Usuario, as: 'datos_usuario', attributes: ['nombre', 'apellido'] }]
                        }
                    ]
                }
            ]
        });

        if (!garantia) {
            throw new NotFoundError('Este servicio no cuenta con una garantía registrada.');
        }

        // Control de acceso
        const { rol, id_usuario } = req.usuario;
        if (rol !== 'ADMIN') {
            if (rol === 'CLIENTE') {
                const cliente = await obtenerCliente(id_usuario);
                if (garantia.servicio.id_cliente !== cliente.id_cliente) {
                    throw new ForbiddenError('No tienes permiso para ver esta garantía.');
                }
            } else if (rol === 'TECNICO') {
                const tecnico = await obtenerTecnico(id_usuario);
                if (garantia.servicio.id_tecnico !== tecnico.id_tecnico) {
                    throw new ForbiddenError('No tienes permiso para ver esta garantía.');
                }
            }
        }

        return res.status(200).json({
            success: true,
            data: garantia
        });
    } catch (error) {
        return handleError(res, error);
    }
};

/**
 * Listar garantías del cliente autenticado
 */
export const obtenerMisGarantiasCliente = async (req, res) => {
    try {
        const cliente = await obtenerCliente(req.usuario.id_usuario);
        
        const garantias = await Garantia.findAll({
            include: [
                {
                    model: Servicio,
                    as: 'servicio',
                    where: { id_cliente: cliente.id_cliente },
                    attributes: ['id_servicio', 'fecha_servicio'],
                    include: [
                        { model: Subcategoria, as: 'subcategoria', attributes: ['nombre'] },
                        {
                            model: Tecnico,
                            as: 'tecnico',
                            attributes: ['id_tecnico'],
                            include: [{ model: Usuario, as: 'datos_usuario', attributes: ['nombre', 'apellido'] }]
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            total: garantias.length,
            data: garantias
        });
    } catch (error) {
        return handleError(res, error);
    }
};

/**
 * Listar garantías emitidas por el técnico autenticado
 */
export const obtenerMisGarantiasTecnico = async (req, res) => {
    try {
        const tecnico = await obtenerTecnico(req.usuario.id_usuario);

        const garantias = await Garantia.findAll({
            include: [
                {
                    model: Servicio,
                    as: 'servicio',
                    where: { id_tecnico: tecnico.id_tecnico },
                    attributes: ['id_servicio', 'fecha_servicio'],
                    include: [
                        { model: Subcategoria, as: 'subcategoria', attributes: ['nombre'] },
                        {
                            model: Cliente,
                            as: 'cliente',
                            attributes: ['id_cliente'],
                            include: [{ model: Usuario, as: 'datos_usuario', attributes: ['nombre', 'apellido'] }]
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            total: garantias.length,
            data: garantias
        });
    } catch (error) {
        return handleError(res, error);
    }
};
