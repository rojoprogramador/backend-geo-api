import {
    sequelize,
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
 *     summary: Agregar ciudades de operación al perfil del técnico
 *     description: |
 *       Permite al técnico agregar una o varias ciudades donde puede prestar
 *       servicios, adicional a su ciudad base.
 *
 *       **Solo técnicos autenticados.**
 *
 *       Se puede enviar un array `ciudades` con múltiples IDs para registrarlas
 *       en una sola petición. La operación es atómica: si alguna falla, ninguna
 *       se registra.
 *
 *       **Validaciones por cada ciudad:**
 *       - Debe existir y estar activa.
 *       - No puede ser la ciudad base (ya está implícita).
 *       - No puede estar ya registrada como ciudad de operación.
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
 *               - ciudades
 *             properties:
 *               ciudades:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [3, 5, 7]
 *                 description: Array de IDs de ciudades donde puede operar
 *           examples:
 *             multiples:
 *               summary: Agregar varias ciudades
 *               value:
 *                 ciudades: [3, 5, 7]
 *             una_sola:
 *               summary: Agregar una sola ciudad
 *               value:
 *                 ciudades: [3]
 *     responses:
 *       201:
 *         description: Ciudades de operación agregadas exitosamente
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
 *                   example: "3 ciudades de operación agregadas exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_ciudad_tecnico:
 *                         type: integer
 *                         example: 1
 *                       id_ciudad:
 *                         type: integer
 *                         example: 3
 *                       nombre_ciudad:
 *                         type: string
 *                         example: "Palmira"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Una o más ciudades ya están registradas o son la ciudad base
 */
export const agregarCiudadOperacion = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        if (req.usuario.rol !== 'TECNICO') {
            await t.rollback();
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        const { ciudades } = req.body;

        // Validar que se envíe un array no vacío
        if (!ciudades || !Array.isArray(ciudades) || ciudades.length === 0) {
            await t.rollback();
            throw new ValidationError('Debe enviar un array "ciudades" con al menos un id_ciudad');
        }

        // Validar que todos los elementos sean enteros positivos
        const idsInvalidos = ciudades.filter(id => !Number.isInteger(id) || id <= 0);
        if (idsInvalidos.length > 0) {
            await t.rollback();
            throw new ValidationError('Todos los IDs en el array ciudades deben ser enteros positivos');
        }

        // Validar que no haya duplicados en el array enviado
        const idsUnicos = [...new Set(ciudades)];
        if (idsUnicos.length !== ciudades.length) {
            await t.rollback();
            throw new ValidationError('El array ciudades contiene IDs duplicados');
        }

        // Buscar el técnico autenticado
        const tecnico = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario },
            transaction: t,
        });

        if (!tecnico) {
            await t.rollback();
            throw new NotFoundError('No se encontró el perfil de técnico');
        }

        // Verificar que ninguna sea la ciudad base
        const esCiudadBase = ciudades.filter(id => tecnico.ciudad_base === id);
        if (esCiudadBase.length > 0) {
            await t.rollback();
            throw new ConflictError('No es necesario agregar tu ciudad base, ya está incluida automáticamente');
        }

        // Verificar que todas las ciudades existan y estén activas
        const ciudadesDB = await Ciudad.findAll({
            where: { id_ciudad: ciudades, activo: true },
            transaction: t,
        });

        if (ciudadesDB.length !== ciudades.length) {
            const idsEncontrados = new Set(ciudadesDB.map(c => c.id_ciudad));
            const noEncontradas = ciudades.filter(id => !idsEncontrados.has(id));
            await t.rollback();
            throw new NotFoundError(`Las siguientes ciudades no existen o están inactivas: ${noEncontradas.join(', ')}`);
        }

        // Verificar que no estén ya registradas
        const existentes = await CiudadTecnico.findAll({
            where: {
                id_tecnico: tecnico.id_tecnico,
                id_ciudad: ciudades,
            },
            transaction: t,
        });

        if (existentes.length > 0) {
            const idsExistentes = existentes.map(e => e.id_ciudad);
            await t.rollback();
            throw new ConflictError(`Las siguientes ciudades ya están registradas: ${idsExistentes.join(', ')}`);
        }

        // Crear todas las relaciones en bulk
        const registros = ciudades.map(id_ciudad => ({
            id_tecnico: tecnico.id_tecnico,
            id_ciudad,
        }));

        const nuevasCiudades = await CiudadTecnico.bulkCreate(registros, { transaction: t });

        await t.commit();

        // Mapear nombres para la respuesta
        const ciudadMap = Object.fromEntries(ciudadesDB.map(c => [c.id_ciudad, c.nombre_ciudad]));

        logger.info(`agregarCiudadOperacion: Técnico ${tecnico.id_tecnico} agregó ${ciudades.length} ciudades: ${ciudades.map(id => ciudadMap[id]).join(', ')}`);

        return res.status(201).json({
            success: true,
            message: `${ciudades.length} ciudad${ciudades.length > 1 ? 'es' : ''} de operación agregada${ciudades.length > 1 ? 's' : ''} exitosamente`,
            data: nuevasCiudades.map(nc => ({
                id_ciudad_tecnico: nc.id_ciudad_tecnico,
                id_ciudad: nc.id_ciudad,
                nombre_ciudad: ciudadMap[nc.id_ciudad] ?? null,
            }))
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
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
