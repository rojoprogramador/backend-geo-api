import {
    Tecnico,
    Ciudad,
    CiudadTecnico,
    Pais,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/ciudades:
 *   post:
 *     summary: Agregar ciudad de operación al perfil del técnico
 *     description: |
 *       Permite al técnico agregar una ciudad donde puede prestar servicios,
 *       adicional a su ciudad base.
 *
 *       **Solo técnicos autenticados.**
 *
 *       **Validaciones:**
 *       - La ciudad debe existir y estar activa.
 *       - No se puede agregar una ciudad que ya esté registrada.
 *       - No se puede agregar la ciudad base (ya está implícita).
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
 *               - id_ciudad
 *             properties:
 *               id_ciudad:
 *                 type: integer
 *                 example: 3
 *                 description: ID de la ciudad donde puede operar
 *     responses:
 *       201:
 *         description: Ciudad de operación agregada exitosamente
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
 *                   example: "Ciudad de operación agregada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_ciudad_tecnico:
 *                       type: integer
 *                       example: 1
 *                     id_ciudad:
 *                       type: integer
 *                       example: 3
 *                     nombre_ciudad:
 *                       type: string
 *                       example: "Palmira"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Ya tienes esta ciudad registrada
 */
export const agregarCiudadOperacion = async (req, res) => {
    try {
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        const { id_ciudad } = req.body;

        if (!id_ciudad) {
            throw new ValidationError('El campo id_ciudad es requerido');
        }

        // Buscar el técnico autenticado
        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario }
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Verificar que la ciudad existe y está activa
        const ciudad = await Ciudad.findOne({
            where: { id_ciudad, activo: true }
        });

        if (!ciudad) {
            throw new NotFoundError('La ciudad no existe o está inactiva');
        }

        // Verificar que no sea la ciudad base del técnico
        if (tecnico.ciudad_base === Number(id_ciudad)) {
            throw new ConflictError('No es necesario agregar tu ciudad base, ya está incluida automáticamente');
        }

        // Verificar que no esté duplicada
        const existente = await CiudadTecnico.findOne({
            where: {
                id_tecnico: tecnico.id_tecnico,
                id_ciudad
            }
        });

        if (existente) {
            throw new ConflictError('Ya tienes esta ciudad registrada como zona de operación');
        }

        // Crear la relación
        const nuevaCiudad = await CiudadTecnico.create({
            id_tecnico: tecnico.id_tecnico,
            id_ciudad
        });

        logger.info(`agregarCiudadOperacion: Técnico ${tecnico.id_tecnico} agregó ciudad ${id_ciudad} (${ciudad.nombre_ciudad})`);

        return res.status(201).json({
            success: true,
            message: 'Ciudad de operación agregada exitosamente',
            data: {
                id_ciudad_tecnico: nuevaCiudad.id_ciudad_tecnico,
                id_ciudad: ciudad.id_ciudad,
                nombre_ciudad: ciudad.nombre_ciudad
            }
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/ciudades:
 *   get:
 *     summary: Listar ciudades de operación del técnico
 *     description: |
 *       Retorna la ciudad base y todas las ciudades adicionales donde el
 *       técnico puede prestar servicios.
 *
 *       **Solo técnicos autenticados.**
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ciudades de operación obtenidas exitosamente
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
 *                   example: "Ciudades de operación obtenidas exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ciudad_base:
 *                       type: object
 *                       properties:
 *                         id_ciudad:
 *                           type: integer
 *                           example: 1
 *                         nombre_ciudad:
 *                           type: string
 *                           example: "Cali"
 *                     ciudades_adicionales:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_ciudad_tecnico:
 *                             type: integer
 *                             example: 1
 *                           id_ciudad:
 *                             type: integer
 *                             example: 3
 *                           nombre_ciudad:
 *                             type: string
 *                             example: "Palmira"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const obtenerMisCiudades = async (req, res) => {
    try {
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario },
            include: [
                {
                    model: Ciudad,
                    attributes: ['id_ciudad', 'nombre_ciudad']
                }
            ]
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Obtener ciudades adicionales de operación
        const ciudadesAdicionales = await CiudadTecnico.findAll({
            where: { id_tecnico: tecnico.id_tecnico },
            include: [
                {
                    model: Ciudad,
                    attributes: ['id_ciudad', 'nombre_ciudad']
                }
            ],
            order: [['createdAt', 'ASC']]
        });

        return res.status(200).json({
            success: true,
            message: 'Ciudades de operación obtenidas exitosamente',
            data: {
                ciudad_base: tecnico.Ciudad
                    ? {
                          id_ciudad: tecnico.Ciudad.id_ciudad,
                          nombre_ciudad: tecnico.Ciudad.nombre_ciudad
                      }
                    : null,
                ciudades_adicionales: ciudadesAdicionales.map(ct => ({
                    id_ciudad_tecnico: ct.id_ciudad_tecnico,
                    id_ciudad: ct.Ciudad?.id_ciudad ?? null,
                    nombre_ciudad: ct.Ciudad?.nombre_ciudad ?? null
                }))
            }
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/ciudades/{id}:
 *   delete:
 *     summary: Eliminar ciudad de operación del perfil
 *     description: |
 *       Permite al técnico eliminar una ciudad adicional de sus zonas de operación.
 *
 *       **Solo técnicos autenticados.**
 *       **No se puede eliminar la ciudad base** (se debe cambiar desde actualizar perfil).
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del registro CiudadTecnico a eliminar (`id_ciudad_tecnico`)
 *     responses:
 *       200:
 *         description: Ciudad de operación eliminada exitosamente
 *       404:
 *         description: Ciudad de operación no encontrada
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const eliminarCiudadOperacion = async (req, res) => {
    try {
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        const { id } = req.params;

        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario }
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Buscar la ciudad de operación (validando ownership)
        const ciudadTecnico = await CiudadTecnico.findOne({
            where: {
                id_ciudad_tecnico: id,
                id_tecnico: tecnico.id_tecnico
            },
            include: [
                { model: Ciudad, attributes: ['nombre_ciudad'] }
            ]
        });

        if (!ciudadTecnico) {
            throw new NotFoundError('Ciudad de operación no encontrada o no te pertenece');
        }

        const nombreCiudad = ciudadTecnico.Ciudad?.nombre_ciudad ?? id;

        await ciudadTecnico.destroy();

        logger.info(`eliminarCiudadOperacion: Técnico ${tecnico.id_tecnico} eliminó ciudad ${nombreCiudad}`);

        return res.status(200).json({
            success: true,
            message: 'Ciudad de operación eliminada exitosamente'
        });

    } catch (error) {
        return handleError(res, error);
    }
};
