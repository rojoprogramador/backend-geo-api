import {
    sequelize,
    Tecnico,
    Especialidad,
    Subcategoria,
    Categoria,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/especialidades:
 *   post:
 *     summary: Agregar especialidad al perfil del técnico
 *     description: |
 *       Permite al técnico agregar una nueva especialidad (servicio que domina).
 *
 *       **Campos:**
 *       - `id_subcategoria`: ID del servicio que domina (obligatorio)
 *       - `experiencia`: Descripción de su experiencia (opcional, ej: "5 años")
 *       - `precio_estimado`: Precio promedio que cobra (opcional)
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_subcategoria
 *             properties:
 *               id_subcategoria:
 *                 type: integer
 *                 example: 1
 *               experiencia:
 *                 type: string
 *                 example: "5 años de experiencia"
 *               precio_estimado:
 *                 type: number
 *                 format: decimal
 *                 example: 50000
 *     responses:
 *       201:
 *         description: Especialidad agregada exitosamente
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Ya tienes esta especialidad registrada
 */
export const agregarEspecialidad = async (req, res) => {
    try {
        // Verificar que el usuario autenticado tiene rol Tecnico
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        const { id_subcategoria, experiencia, precio_estimado } = req.body;

        // Validar que id_subcategoria sea requerido
        if (!id_subcategoria) {
            throw new ValidationError('El campo id_subcategoria es requerido');
        }

        // Buscar el tecnico autenticado
        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario }
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Verificar que la subcategoria existe y está activa
        const subcategoria = await Subcategoria.findOne({
            where: { id_subcategoria, activo: true },
            include: [{ model: Categoria, attributes: ['nombre'] }]
        });

        if (!subcategoria) {
            throw new NotFoundError('La subcategoría no existe o está inactiva');
        }

        // Verificar que el técnico no tenga ya esta especialidad
        const especialidadExistente = await Especialidad.findOne({
            where: {
                id_tecnico: tecnico.id_tecnico,
                id_subcategoria
            }
        });

        if (especialidadExistente) {
            throw new ConflictError('Ya tienes esta especialidad registrada');
        }

        // Crear la especialidad
        const nuevaEspecialidad = await Especialidad.create({
            id_tecnico: tecnico.id_tecnico,
            id_subcategoria,
            experiencia: experiencia || null,
            precio_estimado: precio_estimado || null
        });

        logger.info(`agregarEspecialidad: Técnico ${tecnico.id_tecnico} agregó especialidad ${id_subcategoria}`);

        return res.status(201).json({
            success: true,
            message: 'Especialidad agregada exitosamente',
            data: {
                id_especialidad: nuevaEspecialidad.id_especialidad,
                subcategoria: subcategoria.nombre,
                categoria: subcategoria.Categoria?.nombre,
                experiencia: nuevaEspecialidad.experiencia,
                precio_estimado: nuevaEspecialidad.precio_estimado
            }
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/especialidades:
 *   get:
 *     summary: Listar especialidades del técnico autenticado
 *     description: Retorna todas las especialidades (servicios) que el técnico tiene configuradas
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de especialidades obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Especialidades obtenidas exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_especialidad:
 *                         type: integer
 *                       id_subcategoria:
 *                         type: integer
 *                       subcategoria:
 *                         type: string
 *                       categoria:
 *                         type: string
 *                       experiencia:
 *                         type: string
 *                       precio_estimado:
 *                         type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const obtenerMisEspecialidades = async (req, res) => {
    try {
        // Verificar que el usuario autenticado tiene rol Tecnico
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        // Buscar el tecnico autenticado
        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario }
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Obtener todas las especialidades del técnico
        const especialidades = await Especialidad.findAll({
            where: { id_tecnico: tecnico.id_tecnico },
            include: [
                {
                    model: Subcategoria,
                    as: 'Subcategoria',
                    attributes: ['id_subcategoria', 'nombre'],
                    include: [
                        {
                            model: Categoria,
                            attributes: ['nombre']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'ASC']]
        });

        return res.status(200).json({
            success: true,
            message: 'Especialidades obtenidas exitosamente',
            data: especialidades.map(esp => ({
                id_especialidad: esp.id_especialidad,
                id_subcategoria: esp.id_subcategoria,
                subcategoria: esp.Subcategoria?.nombre ?? null,
                categoria: esp.Subcategoria?.Categoria?.nombre ?? null,
                experiencia: esp.experiencia,
                precio_estimado: esp.precio_estimado,
                fecha_agregada: esp.createdAt
            }))
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/especialidades/{id}:
 *   delete:
 *     summary: Eliminar especialidad del perfil
 *     description: Permite al técnico eliminar una especialidad que ya no quiere ofrecer
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la especialidad a eliminar
 *     responses:
 *       200:
 *         description: Especialidad eliminada exitosamente
 *       404:
 *         description: Especialidad no encontrada
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const eliminarEspecialidad = async (req, res) => {
    try {
        // Verificar que el usuario autenticado tiene rol Tecnico
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        const { id } = req.params;

        // Buscar el tecnico autenticado
        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario }
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Buscar la especialidad
        const especialidad = await Especialidad.findOne({
            where: {
                id_especialidad: id,
                id_tecnico: tecnico.id_tecnico
            }
        });

        if (!especialidad) {
            throw new NotFoundError('Especialidad no encontrada o no te pertenece');
        }

        // Eliminar la especialidad
        await especialidad.destroy();

        logger.info(`eliminarEspecialidad: Técnico ${tecnico.id_tecnico} eliminó especialidad ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Especialidad eliminada exitosamente'
        });

    } catch (error) {
        return handleError(res, error);
    }
};
