import { sequelize, Categoria, Subcategoria } from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Helpers de validación locales
// ---------------------------------------------------------------------------

/**
 * Valida el nombre de una categoría: letras, números, tildes, ñ, espacios y
 * guiones. Entre 3 y 50 caracteres.
 * @param {string} nombre
 * @returns {boolean}
 */
const esNombreValido = (nombre) =>
    typeof nombre === 'string' && /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s\-0-9]{3,50}$/.test(nombre.trim());

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /categorias:
 *   get:
 *     summary: Listar todas las categorías (HU-22)
 *     description: |
 *       Endpoint **público** que retorna todas las categorías del catálogo de
 *       servicios junto con el conteo de subcategorías activas de cada una.
 *
 *       Útil para que los clientes naveguen el catálogo cuando van a crear
 *       una solicitud de servicio.
 *     tags: [Categorías]
 *     parameters:
 *       - in: query
 *         name: activo
 *         schema:
 *           type: boolean
 *         description: "Filtrar por estado activo/inactivo. Si se omite, retorna todas."
 *         example: true
 *     responses:
 *       200:
 *         description: Lista de categorías obtenida exitosamente
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
 *                   example: "Categorías obtenidas exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_categoria:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: "Plomería"
 *                       descripcion:
 *                         type: string
 *                         example: "Servicios de instalación y reparación de tuberías"
 *                       activo:
 *                         type: boolean
 *                         example: true
 *                       total_subcategorias:
 *                         type: integer
 *                         example: 4
 *                         description: "Total de subcategorías activas bajo esta categoría"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerCategorias = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Construir cláusula WHERE según query param ?activo=
        // ----------------------------------------------------------------
        const whereClause = {};
        if (req.query.activo !== undefined) {
            whereClause.activo = req.query.activo === 'true';
        }

        // ----------------------------------------------------------------
        // 2. Obtener categorías con conteo de subcategorías activas
        //    La relación Categoria.hasMany(Subcategoria) NO tiene alias,
        //    por lo que incluimos usando el modelo directamente.
        // ----------------------------------------------------------------
        const categorias = await Categoria.findAll({
            where: whereClause,
            include: [
                {
                    model: Subcategoria,
                    attributes: [], // solo nos interesa el conteo, no los datos
                    where: { activo: true },
                    required: false, // LEFT JOIN — categorías sin subcategorías también aparecen
                },
            ],
            attributes: {
                include: [
                    [
                        sequelize.fn('COUNT', sequelize.col('Subcategoria.id_subcategoria')),
                        'total_subcategorias',
                    ],
                ],
            },
            group: ['Categoria.id_categoria'],
            order: [['nombre', 'ASC']],
        });

        logger.info(`obtenerCategorias: ${categorias.length} categorías retornadas`);

        return res.status(200).json({
            success: true,
            message: 'Categorías obtenidas exitosamente',
            total: categorias.length,
            data: categorias.map((c) => ({
                id_categoria:       c.id_categoria,
                nombre:             c.nombre,
                descripcion:        c.descripcion,
                activo:             c.activo,
                total_subcategorias: parseInt(c.dataValues.total_subcategorias ?? 0, 10),
            })),
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /categorias/{id}:
 *   get:
 *     summary: Obtener una categoría por ID con sus subcategorías (HU-22)
 *     description: |
 *       Endpoint **público** que retorna el detalle completo de una categoría
 *       incluyendo la lista de todas sus subcategorías activas.
 *     tags: [Categorías]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría
 *         example: 1
 *     responses:
 *       200:
 *         description: Categoría obtenida exitosamente
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
 *                   example: "Categoría obtenida exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_categoria:
 *                       type: integer
 *                       example: 1
 *                     nombre:
 *                       type: string
 *                       example: "Plomería"
 *                     descripcion:
 *                       type: string
 *                       example: "Servicios de instalación y reparación de tuberías"
 *                     activo:
 *                       type: boolean
 *                       example: true
 *                     subcategorias:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_subcategoria:
 *                             type: integer
 *                             example: 3
 *                           nombre:
 *                             type: string
 *                             example: "Reparación de tuberías"
 *                           descripcion:
 *                             type: string
 *                             example: "Detección y reparación de fugas en tuberías"
 *                           activo:
 *                             type: boolean
 *                             example: true
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerCategoriaPorId = async (req, res) => {
    try {
        const { id } = req.params;

        // ----------------------------------------------------------------
        // 1. Validar que el ID sea un entero positivo
        // ----------------------------------------------------------------
        const idNumerico = parseInt(id, 10);
        if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
            throw new ValidationError('Error de validación', ['El ID de la categoría debe ser un número entero positivo']);
        }

        // ----------------------------------------------------------------
        // 2. Buscar la categoría con sus subcategorías (sin alias)
        // ----------------------------------------------------------------
        const categoria = await Categoria.findByPk(idNumerico, {
            include: [
                {
                    model: Subcategoria,
                    attributes: ['id_subcategoria', 'nombre', 'descripcion', 'activo'],
                },
            ],
        });

        if (!categoria) {
            throw new NotFoundError(`No se encontró la categoría con ID ${idNumerico}`);
        }

        logger.info(`obtenerCategoriaPorId: Categoría id=${idNumerico} consultada`);

        return res.status(200).json({
            success: true,
            message: 'Categoría obtenida exitosamente',
            data: {
                id_categoria: categoria.id_categoria,
                nombre:       categoria.nombre,
                descripcion:  categoria.descripcion,
                activo:       categoria.activo,
                // Sequelize usa el nombre del modelo como propiedad cuando no hay alias
                subcategorias: (categoria.Subcategoria ?? []).map((s) => ({
                    id_subcategoria: s.id_subcategoria,
                    nombre:          s.nombre,
                    descripcion:     s.descripcion,
                    activo:          s.activo,
                })),
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /categorias:
 *   post:
 *     summary: Crear una nueva categoría (HU-22)
 *     description: |
 *       Crea una nueva categoría en el catálogo de servicios.
 *       **Solo Administradores.**
 *
 *       **Reglas de validación:**
 *       - `nombre`: requerido, entre 3 y 50 caracteres, único (sin importar mayúsculas/minúsculas).
 *       - `descripcion`: opcional, máximo 200 caracteres.
 *       - `activo`: booleano, por defecto `true`.
 *     tags: [Categorías]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearCategoriaRequest'
 *           examples:
 *             plomeria:
 *               summary: Crear categoría Plomería
 *               value:
 *                 nombre: "Plomería"
 *                 descripcion: "Servicios de instalación y reparación de tuberías, grifería y sistemas hidráulicos"
 *                 activo: true
 *             electricidad:
 *               summary: Crear categoría Electricidad
 *               value:
 *                 nombre: "Electricidad"
 *                 descripcion: "Instalaciones eléctricas residenciales y comerciales"
 *             cerrajeria:
 *               summary: Crear categoría sin descripción
 *               value:
 *                 nombre: "Cerrajería"
 *     responses:
 *       201:
 *         description: Categoría creada exitosamente
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
 *                   example: "Categoría creada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_categoria:
 *                       type: integer
 *                       example: 3
 *                     nombre:
 *                       type: string
 *                       example: "Plomería"
 *                     descripcion:
 *                       type: string
 *                       example: "Servicios de instalación y reparación de tuberías"
 *                     activo:
 *                       type: boolean
 *                       example: true
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         description: Ya existe una categoría con ese nombre
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Ya existe una categoría con el nombre 'Plomería'"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearCategoria = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { nombre, descripcion, activo } = req.body;

        // ----------------------------------------------------------------
        // 1. Validar campo requerido: nombre
        // ----------------------------------------------------------------
        if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
            await t.rollback();
            throw new ValidationError('Error de validación', ['El campo nombre es requerido']);
        }

        const nombreLimpio = nombre.trim();

        // ----------------------------------------------------------------
        // 2. Validar formato del nombre
        // ----------------------------------------------------------------
        if (!esNombreValido(nombreLimpio)) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El nombre solo puede contener letras, números, tildes, ñ y espacios. Entre 3 y 50 caracteres.',
            ]);
        }

        // ----------------------------------------------------------------
        // 3. Validar descripción si se proporcionó
        // ----------------------------------------------------------------
        if (descripcion !== undefined && descripcion !== null) {
            if (typeof descripcion !== 'string') {
                await t.rollback();
                throw new ValidationError('Error de validación', ['El campo descripcion debe ser texto']);
            }
            if (descripcion.trim().length > 200) {
                await t.rollback();
                throw new ValidationError('Error de validación', [
                    'La descripción no puede superar los 200 caracteres',
                ]);
            }
        }

        // ----------------------------------------------------------------
        // 4. Verificar unicidad del nombre (case-insensitive con iLike)
        // ----------------------------------------------------------------
        const categoriaExistente = await Categoria.findOne({
            where: { nombre: { [Op.iLike]: nombreLimpio } },
            transaction: t,
        });

        if (categoriaExistente) {
            await t.rollback();
            throw new ConflictError(`Ya existe una categoría con el nombre '${nombreLimpio}'`);
        }

        // ----------------------------------------------------------------
        // 5. Crear la categoría
        // ----------------------------------------------------------------
        const nuevaCategoria = await Categoria.create(
            {
                nombre:      nombreLimpio,
                descripcion: descripcion ? descripcion.trim() : null,
                activo:      activo !== undefined ? Boolean(activo) : true,
            },
            { transaction: t }
        );

        await t.commit();

        logger.info(`crearCategoria: Categoría creada con id=${nuevaCategoria.id_categoria} nombre='${nuevaCategoria.nombre}'`);

        return res.status(201).json({
            success: true,
            message: 'Categoría creada exitosamente',
            data: {
                id_categoria: nuevaCategoria.id_categoria,
                nombre:       nuevaCategoria.nombre,
                descripcion:  nuevaCategoria.descripcion,
                activo:       nuevaCategoria.activo,
            },
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
 * /categorias/{id}:
 *   put:
 *     summary: Actualizar una categoría (HU-22)
 *     description: |
 *       Actualiza los datos de una categoría existente.
 *       **Solo Administradores.**
 *
 *       Solo se actualizan los campos que se envíen en el body.
 *       Al menos uno de los campos editables debe estar presente.
 *
 *       **Campos editables:** `nombre`, `descripcion`, `activo`.
 *     tags: [Categorías]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría a actualizar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarCategoriaRequest'
 *           examples:
 *             cambiar_nombre:
 *               summary: Cambiar solo el nombre
 *               value:
 *                 nombre: "Fontanería"
 *             desactivar:
 *               summary: Desactivar categoría
 *               value:
 *                 activo: false
 *             actualizacion_completa:
 *               summary: Actualizar todos los campos
 *               value:
 *                 nombre: "Plomería Residencial"
 *                 descripcion: "Servicios hidráulicos para viviendas y apartamentos"
 *                 activo: true
 *     responses:
 *       200:
 *         description: Categoría actualizada exitosamente
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
 *                   example: "Categoría actualizada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_categoria:
 *                       type: integer
 *                       example: 1
 *                     nombre:
 *                       type: string
 *                       example: "Fontanería"
 *                     descripcion:
 *                       type: string
 *                       example: "Servicios hidráulicos para viviendas"
 *                     activo:
 *                       type: boolean
 *                       example: true
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: Ya existe otra categoría con ese nombre
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Ya existe una categoría con el nombre 'Fontanería'"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const actualizarCategoria = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { nombre, descripcion, activo } = req.body;

        // ----------------------------------------------------------------
        // 1. Validar ID numérico
        // ----------------------------------------------------------------
        const idNumerico = parseInt(id, 10);
        if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', ['El ID de la categoría debe ser un número entero positivo']);
        }

        // ----------------------------------------------------------------
        // 2. Verificar que al menos un campo fue enviado
        // ----------------------------------------------------------------
        if (nombre === undefined && descripcion === undefined && activo === undefined) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'Debe enviar al menos un campo para actualizar: nombre, descripcion o activo',
            ]);
        }

        // ----------------------------------------------------------------
        // 3. Verificar que la categoría existe
        // ----------------------------------------------------------------
        const categoria = await Categoria.findByPk(idNumerico, { transaction: t });
        if (!categoria) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la categoría con ID ${idNumerico}`);
        }

        // ----------------------------------------------------------------
        // 4. Validar campos presentes
        // ----------------------------------------------------------------
        const errores = [];

        if (nombre !== undefined) {
            if (typeof nombre !== 'string' || nombre.trim() === '') {
                errores.push('El campo nombre no puede ser vacío');
            } else if (!esNombreValido(nombre.trim())) {
                errores.push('El nombre solo puede contener letras, números, tildes, ñ y espacios. Entre 3 y 50 caracteres.');
            }
        }

        if (descripcion !== undefined && descripcion !== null) {
            if (typeof descripcion !== 'string') {
                errores.push('El campo descripcion debe ser texto');
            } else if (descripcion.trim().length > 200) {
                errores.push('La descripción no puede superar los 200 caracteres');
            }
        }

        if (errores.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', errores);
        }

        // ----------------------------------------------------------------
        // 5. Si se cambia el nombre, verificar que no esté en uso por otra categoría
        // ----------------------------------------------------------------
        if (nombre !== undefined) {
            const nombreLimpio = nombre.trim();
            const duplicado = await Categoria.findOne({
                where: {
                    nombre:       { [Op.iLike]: nombreLimpio },
                    id_categoria: { [Op.ne]: idNumerico },
                },
                transaction: t,
            });

            if (duplicado) {
                await t.rollback();
                throw new ConflictError(`Ya existe una categoría con el nombre '${nombreLimpio}'`);
            }
        }

        // ----------------------------------------------------------------
        // 6. Construir objeto con solo los campos presentes
        // ----------------------------------------------------------------
        const camposActualizar = {};
        if (nombre !== undefined)      camposActualizar.nombre      = nombre.trim();
        if (descripcion !== undefined)  camposActualizar.descripcion  = descripcion ? descripcion.trim() : null;
        if (activo !== undefined)       camposActualizar.activo       = Boolean(activo);

        // ----------------------------------------------------------------
        // 7. Actualizar
        // ----------------------------------------------------------------
        await Categoria.update(camposActualizar, {
            where: { id_categoria: idNumerico },
            transaction: t,
        });

        await t.commit();

        // Recuperar datos actualizados
        const categoriaActualizada = await Categoria.findByPk(idNumerico);

        logger.info(`actualizarCategoria: Categoría id=${idNumerico} actualizada — campos: ${Object.keys(camposActualizar).join(', ')}`);

        return res.status(200).json({
            success: true,
            message: 'Categoría actualizada exitosamente',
            data: {
                id_categoria: categoriaActualizada.id_categoria,
                nombre:       categoriaActualizada.nombre,
                descripcion:  categoriaActualizada.descripcion,
                activo:       categoriaActualizada.activo,
            },
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
 * /categorias/{id}:
 *   delete:
 *     summary: Eliminar una categoría (HU-22)
 *     description: |
 *       Elimina permanentemente una categoría del catálogo.
 *       **Solo Administradores.**
 *
 *       **Restricción de integridad:** La eliminación es bloqueada si la categoría
 *       tiene subcategorías asociadas (sin importar si están activas o no).
 *       Primero debe eliminar o reasignar todas las subcategorías.
 *
 *       La base de datos tiene `ON DELETE RESTRICT` en la FK de Subcategoria
 *       hacia Categoria, lo que garantiza la integridad referencial.
 *     tags: [Categorías]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría a eliminar
 *         example: 3
 *     responses:
 *       200:
 *         description: Categoría eliminada exitosamente
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
 *                   example: "Categoría eliminada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_categoria:
 *                       type: integer
 *                       example: 3
 *                     nombre:
 *                       type: string
 *                       example: "Cerrajería"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: La categoría no puede eliminarse porque tiene subcategorías
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "No se puede eliminar la categoría porque tiene 4 subcategoría(s) asociada(s). Elimine o reasigne las subcategorías primero."
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const eliminarCategoria = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;

        // ----------------------------------------------------------------
        // 1. Validar ID
        // ----------------------------------------------------------------
        const idNumerico = parseInt(id, 10);
        if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', ['El ID de la categoría debe ser un número entero positivo']);
        }

        // ----------------------------------------------------------------
        // 2. Verificar que la categoría existe
        // ----------------------------------------------------------------
        const categoria = await Categoria.findByPk(idNumerico, { transaction: t });
        if (!categoria) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la categoría con ID ${idNumerico}`);
        }

        // ----------------------------------------------------------------
        // 3. Verificar que no tenga subcategorías asociadas antes de intentar
        //    eliminar (damos un mensaje claro en vez de dejar que la DB lance
        //    SequelizeForeignKeyConstraintError)
        // ----------------------------------------------------------------
        const totalSubcategorias = await Subcategoria.count({
            where: { id_categoria: idNumerico },
            transaction: t,
        });

        if (totalSubcategorias > 0) {
            await t.rollback();
            throw new ConflictError(
                `No se puede eliminar la categoría porque tiene ${totalSubcategorias} subcategoría(s) asociada(s). Elimine o reasigne las subcategorías primero.`
            );
        }

        // ----------------------------------------------------------------
        // 4. Eliminar la categoría
        // ----------------------------------------------------------------
        const nombreEliminado = categoria.nombre;
        await categoria.destroy({ transaction: t });

        await t.commit();

        logger.info(`eliminarCategoria: Categoría id=${idNumerico} nombre='${nombreEliminado}' eliminada por usuario id=${req.usuario?.id_usuario}`);

        return res.status(200).json({
            success: true,
            message: 'Categoría eliminada exitosamente',
            data: {
                id_categoria: idNumerico,
                nombre:       nombreEliminado,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};
