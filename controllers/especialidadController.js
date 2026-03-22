import {
    sequelize,
    Tecnico,
    Especialidad,
    Subcategoria,
    Categoria,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { obtenerTecnico } from '../utils/profileHelpers.js';

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
 *
 *       **Batch:** Se puede enviar `{ especialidades: [{id_subcategoria, experiencia?}, ...] }`
 *       para agregar múltiples especialidades en una sola petición.
 *
 *       **Legacy:** También acepta `{ id_subcategoria, experiencia }` para una sola.
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - especialidades
 *                 properties:
 *                   especialidades:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required:
 *                         - id_subcategoria
 *                       properties:
 *                         id_subcategoria:
 *                           type: integer
 *                           example: 1
 *                         experiencia:
 *                           type: string
 *                           example: "5 años de experiencia"
 *               - type: object
 *                 required:
 *                   - id_subcategoria
 *                 properties:
 *                   id_subcategoria:
 *                     type: integer
 *                     example: 1
 *                   experiencia:
 *                     type: string
 *                     example: "5 años de experiencia"
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
    const t = await sequelize.transaction();

    try {
        // ── Normalizar input: batch ó legacy single ──
        let items;
        if (Array.isArray(req.body.especialidades)) {
            items = req.body.especialidades;
        } else if (req.body.id_subcategoria) {
            items = [{ id_subcategoria: req.body.id_subcategoria, experiencia: req.body.experiencia }];
        } else {
            await t.rollback();
            throw new ValidationError('Debe enviar "especialidades" (array) o "id_subcategoria"');
        }

        if (items.length === 0) {
            await t.rollback();
            throw new ValidationError('El array especialidades no puede estar vacío');
        }

        // Validar estructura de cada item
        const errores = [];
        items.forEach((item, i) => {
            if (!item.id_subcategoria || !Number.isInteger(Number(item.id_subcategoria)) || Number(item.id_subcategoria) <= 0) {
                errores.push(`Elemento ${i}: id_subcategoria es requerido y debe ser un entero positivo`);
            }
        });
        if (errores.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', errores);
        }

        // Normalizar IDs
        const idsSubcategoria = items.map(item => Number(item.id_subcategoria));

        // Verificar duplicados en el array enviado
        const idsUnicos = [...new Set(idsSubcategoria)];
        if (idsUnicos.length !== idsSubcategoria.length) {
            await t.rollback();
            throw new ValidationError('El array contiene subcategorías duplicadas');
        }

        // Buscar el técnico autenticado
        const tecnico = await obtenerTecnico(req.usuario.id_usuario, t);

        // Verificar que todas las subcategorías existen y están activas
        const subcategoriasDB = await Subcategoria.findAll({
            where: { id_subcategoria: idsSubcategoria, activo: true },
            include: [{ model: Categoria, attributes: ['id_categoria', 'nombre'] }],
            transaction: t,
        });

        if (subcategoriasDB.length !== idsSubcategoria.length) {
            const idsEncontrados = new Set(subcategoriasDB.map(s => s.id_subcategoria));
            const noEncontradas = idsSubcategoria.filter(id => !idsEncontrados.has(id));
            await t.rollback();
            throw new NotFoundError(`Las siguientes subcategorías no existen o están inactivas: ${noEncontradas.join(', ')}`);
        }

        // Verificar que no estén ya registradas
        const existentes = await Especialidad.findAll({
            where: { id_tecnico: tecnico.id_tecnico, id_subcategoria: idsSubcategoria },
            transaction: t,
        });

        if (existentes.length > 0) {
            const idsExistentes = existentes.map(e => e.id_subcategoria);
            await t.rollback();
            throw new ConflictError(`Ya tienes registradas las siguientes especialidades: ${idsExistentes.join(', ')}`);
        }

        // Crear todas las especialidades en bulk
        const registros = items.map(item => ({
            id_tecnico: tecnico.id_tecnico,
            id_subcategoria: Number(item.id_subcategoria),
            experiencia: item.experiencia || null,
        }));

        const nuevas = await Especialidad.bulkCreate(registros, { transaction: t });

        await t.commit();

        // Mapear nombres para respuesta
        const subcatMap = Object.fromEntries(
            subcategoriasDB.map(s => [s.id_subcategoria, {
                nombre: s.nombre,
                categoria: s.Categoria?.nombre ?? null,
            }])
        );

        logger.info(`agregarEspecialidad: Técnico ${tecnico.id_tecnico} agregó ${nuevas.length} especialidad(es): ${idsSubcategoria.join(', ')}`);

        return res.status(201).json({
            success: true,
            message: `${nuevas.length} especialidad${nuevas.length > 1 ? 'es' : ''} agregada${nuevas.length > 1 ? 's' : ''} exitosamente`,
            data: nuevas.map(n => ({
                id_especialidad: n.id_especialidad,
                id_subcategoria: n.id_subcategoria,
                subcategoria: subcatMap[n.id_subcategoria]?.nombre ?? null,
                categoria: subcatMap[n.id_subcategoria]?.categoria ?? null,
                experiencia: n.experiencia,
            })),
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export const obtenerMisEspecialidades = async (req, res) => {
    try {
        // Buscar el tecnico autenticado
        const tecnico = await obtenerTecnico(req.usuario.id_usuario);

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
        const { id } = req.params;

        // Buscar el tecnico autenticado
        const tecnico = await obtenerTecnico(req.usuario.id_usuario);

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
