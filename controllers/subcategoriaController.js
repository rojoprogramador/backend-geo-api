import { sequelize, Categoria, Subcategoria, Especialidad, Solicitud } from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Helpers de validación locales
// ---------------------------------------------------------------------------

/**
 * Valida el nombre de una subcategoría: letras, números, tildes, ñ, espacios
 * y guiones. Entre 3 y 50 caracteres.
 * @param {string} nombre
 * @returns {boolean}
 */
const esNombreValido = (nombre) =>
    typeof nombre === 'string' && /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s\-0-9]{3,50}$/.test(nombre.trim());

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /subcategorias:
 *   get:
 *     summary: Listar todas las subcategorías (HU-23)
 *     description: |
 *       Endpoint **público** que retorna todas las subcategorías del catálogo
 *       junto con la información de su categoría padre.
 *
 *       Usado por los clientes para seleccionar el tipo de servicio específico
 *       al crear una solicitud.
 *     tags: [Subcategorías]
 *     parameters:
 *       - in: query
 *         name: activo
 *         schema:
 *           type: boolean
 *         description: "Filtrar por estado activo/inactivo. Si se omite, retorna todas."
 *         example: true
 *       - in: query
 *         name: id_categoria
 *         schema:
 *           type: integer
 *         description: "Filtrar subcategorías por categoría padre."
 *         example: 1
 *     responses:
 *       200:
 *         description: Lista de subcategorías obtenida exitosamente
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
 *                   example: "Subcategorías obtenidas exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 12
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_subcategoria:
 *                         type: integer
 *                         example: 3
 *                       nombre:
 *                         type: string
 *                         example: "Reparación de tuberías"
 *                       descripcion:
 *                         type: string
 *                         example: "Detección y reparación de fugas en tuberías"
 *                       activo:
 *                         type: boolean
 *                         example: true
 *                       id_categoria:
 *                         type: integer
 *                         example: 1
 *                       categoria:
 *                         type: object
 *                         properties:
 *                           id_categoria:
 *                             type: integer
 *                             example: 1
 *                           nombre:
 *                             type: string
 *                             example: "Plomería"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerSubcategorias = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Construir cláusula WHERE según query params
        // ----------------------------------------------------------------
        const whereClause = {};

        if (req.query.activo !== undefined) {
            whereClause.activo = req.query.activo === 'true';
        }

        if (req.query.id_categoria !== undefined) {
            const idCat = parseInt(req.query.id_categoria, 10);
            if (!Number.isInteger(idCat) || idCat <= 0) {
                throw new ValidationError('Error de validación', [
                    'El parámetro id_categoria debe ser un número entero positivo',
                ]);
            }
            whereClause.id_categoria = idCat;
        }

        // ----------------------------------------------------------------
        // 2. Obtener subcategorías con su categoría padre
        //    La relación Subcategoria.belongsTo(Categoria) NO tiene alias,
        //    por lo que incluimos usando el modelo directamente.
        // ----------------------------------------------------------------
        const subcategorias = await Subcategoria.findAll({
            where: whereClause,
            include: [
                {
                    model: Categoria,
                    attributes: ['id_categoria', 'nombre'],
                },
            ],
            order: [
                [Categoria, 'nombre', 'ASC'],
                ['nombre', 'ASC'],
            ],
        });

        logger.info(`obtenerSubcategorias: ${subcategorias.length} subcategorías retornadas`);

        return res.status(200).json({
            success: true,
            message: 'Subcategorías obtenidas exitosamente',
            total: subcategorias.length,
            data: subcategorias.map((s) => ({
                id_subcategoria: s.id_subcategoria,
                nombre:          s.nombre,
                descripcion:     s.descripcion,
                activo:          s.activo,
                id_categoria:    s.id_categoria,
                // Sequelize usa el nombre del modelo como propiedad cuando no hay alias
                categoria: s.Categoria
                    ? {
                          id_categoria: s.Categoria.id_categoria,
                          nombre:       s.Categoria.nombre,
                      }
                    : null,
            })),
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /subcategorias/{id}:
 *   get:
 *     summary: Obtener una subcategoría por ID (HU-23)
 *     description: |
 *       Endpoint **público** que retorna el detalle completo de una subcategoría
 *       incluyendo la información de su categoría padre.
 *     tags: [Subcategorías]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la subcategoría
 *         example: 3
 *     responses:
 *       200:
 *         description: Subcategoría obtenida exitosamente
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
 *                   example: "Subcategoría obtenida exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_subcategoria:
 *                       type: integer
 *                       example: 3
 *                     nombre:
 *                       type: string
 *                       example: "Reparación de tuberías"
 *                     descripcion:
 *                       type: string
 *                       example: "Detección y reparación de fugas en tuberías"
 *                     activo:
 *                       type: boolean
 *                       example: true
 *                     id_categoria:
 *                       type: integer
 *                       example: 1
 *                     categoria:
 *                       type: object
 *                       properties:
 *                         id_categoria:
 *                           type: integer
 *                           example: 1
 *                         nombre:
 *                           type: string
 *                           example: "Plomería"
 *                         descripcion:
 *                           type: string
 *                           example: "Servicios de instalación y reparación de tuberías"
 *                         activo:
 *                           type: boolean
 *                           example: true
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerSubcategoriaPorId = async (req, res) => {
    try {
        const { id } = req.params;

        // ----------------------------------------------------------------
        // 1. Validar ID
        // ----------------------------------------------------------------
        const idNumerico = parseInt(id, 10);
        if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
            throw new ValidationError('Error de validación', [
                'El ID de la subcategoría debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Buscar subcategoría con su categoría padre (sin alias)
        // ----------------------------------------------------------------
        const subcategoria = await Subcategoria.findByPk(idNumerico, {
            include: [
                {
                    model: Categoria,
                    attributes: ['id_categoria', 'nombre', 'descripcion', 'activo'],
                },
            ],
        });

        if (!subcategoria) {
            throw new NotFoundError(`No se encontró la subcategoría con ID ${idNumerico}`);
        }

        logger.info(`obtenerSubcategoriaPorId: Subcategoría id=${idNumerico} consultada`);

        return res.status(200).json({
            success: true,
            message: 'Subcategoría obtenida exitosamente',
            data: {
                id_subcategoria: subcategoria.id_subcategoria,
                nombre:          subcategoria.nombre,
                descripcion:     subcategoria.descripcion,
                activo:          subcategoria.activo,
                id_categoria:    subcategoria.id_categoria,
                categoria: subcategoria.Categoria
                    ? {
                          id_categoria: subcategoria.Categoria.id_categoria,
                          nombre:       subcategoria.Categoria.nombre,
                          descripcion:  subcategoria.Categoria.descripcion,
                          activo:       subcategoria.Categoria.activo,
                      }
                    : null,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /subcategorias:
 *   post:
 *     summary: Crear una nueva subcategoría (HU-23)
 *     description: |
 *       Crea una nueva subcategoría dentro de una categoría existente.
 *       **Solo Administradores.**
 *
 *       **Reglas de validación:**
 *       - `nombre`: requerido, entre 3 y 50 caracteres, único dentro de la misma categoría.
 *       - `descripcion`: opcional, máximo 300 caracteres.
 *       - `id_categoria`: requerido, debe existir en la tabla Categoria.
 *       - `activo`: booleano, por defecto `true`.
 *     tags: [Subcategorías]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearSubcategoriaRequest'
 *           examples:
 *             reparacion_tuberia:
 *               summary: Subcategoría de plomería
 *               value:
 *                 nombre: "Reparación de tuberías"
 *                 descripcion: "Detección y reparación de fugas en tuberías de agua fría y caliente"
 *                 id_categoria: 1
 *                 activo: true
 *             instalacion_electrica:
 *               summary: Subcategoría de electricidad
 *               value:
 *                 nombre: "Instalación de tomacorrientes"
 *                 descripcion: "Instalación y reemplazo de tomacorrientes e interruptores"
 *                 id_categoria: 2
 *             apertura_puertas:
 *               summary: Subcategoría mínima (sin descripción)
 *               value:
 *                 nombre: "Apertura de puertas"
 *                 id_categoria: 3
 *     responses:
 *       201:
 *         description: Subcategoría creada exitosamente
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
 *                   example: "Subcategoría creada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_subcategoria:
 *                       type: integer
 *                       example: 7
 *                     nombre:
 *                       type: string
 *                       example: "Reparación de tuberías"
 *                     descripcion:
 *                       type: string
 *                       example: "Detección y reparación de fugas"
 *                     id_categoria:
 *                       type: integer
 *                       example: 1
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
 *         description: Ya existe una subcategoría con ese nombre en la categoría
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Ya existe una subcategoría con el nombre 'Reparación de tuberías' en esta categoría"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearSubcategoria = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { nombre, descripcion, id_categoria, activo } = req.body;

        // ----------------------------------------------------------------
        // 1. Validar campos requeridos
        // ----------------------------------------------------------------
        const camposFaltantes = [];
        if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
            camposFaltantes.push('El campo nombre es requerido');
        }
        if (id_categoria === undefined || id_categoria === null) {
            camposFaltantes.push('El campo id_categoria es requerido');
        }

        if (camposFaltantes.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', camposFaltantes);
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
        // 3. Validar id_categoria sea entero positivo
        // ----------------------------------------------------------------
        const idCat = parseInt(id_categoria, 10);
        if (!Number.isInteger(idCat) || idCat <= 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El campo id_categoria debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 4. Validar descripción si se proporcionó
        // ----------------------------------------------------------------
        if (descripcion !== undefined && descripcion !== null) {
            if (typeof descripcion !== 'string') {
                await t.rollback();
                throw new ValidationError('Error de validación', ['El campo descripcion debe ser texto']);
            }
            if (descripcion.trim().length > 300) {
                await t.rollback();
                throw new ValidationError('Error de validación', [
                    'La descripción no puede superar los 300 caracteres',
                ]);
            }
        }

        // ----------------------------------------------------------------
        // 5. Verificar que la categoría padre existe
        // ----------------------------------------------------------------
        const categoriaExistente = await Categoria.findByPk(idCat, { transaction: t });
        if (!categoriaExistente) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la categoría con ID ${idCat}`);
        }

        // ----------------------------------------------------------------
        // 6. Verificar unicidad del nombre DENTRO de la misma categoría
        // ----------------------------------------------------------------
        const subcategoriaExistente = await Subcategoria.findOne({
            where: {
                nombre:       { [Op.iLike]: nombreLimpio },
                id_categoria: idCat,
            },
            transaction: t,
        });

        if (subcategoriaExistente) {
            await t.rollback();
            throw new ConflictError(
                `Ya existe una subcategoría con el nombre '${nombreLimpio}' en la categoría '${categoriaExistente.nombre}'`
            );
        }

        // ----------------------------------------------------------------
        // 7. Crear la subcategoría
        // ----------------------------------------------------------------
        const nuevaSubcategoria = await Subcategoria.create(
            {
                nombre:       nombreLimpio,
                descripcion:  descripcion ? descripcion.trim() : null,
                id_categoria: idCat,
                activo:       activo !== undefined ? Boolean(activo) : true,
            },
            { transaction: t }
        );

        await t.commit();

        logger.info(
            `crearSubcategoria: Subcategoría creada con id=${nuevaSubcategoria.id_subcategoria} nombre='${nuevaSubcategoria.nombre}' en categoría id=${idCat}`
        );

        return res.status(201).json({
            success: true,
            message: 'Subcategoría creada exitosamente',
            data: {
                id_subcategoria: nuevaSubcategoria.id_subcategoria,
                nombre:          nuevaSubcategoria.nombre,
                descripcion:     nuevaSubcategoria.descripcion,
                id_categoria:    nuevaSubcategoria.id_categoria,
                activo:          nuevaSubcategoria.activo,
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
 * /subcategorias/{id}:
 *   put:
 *     summary: Actualizar una subcategoría (HU-23)
 *     description: |
 *       Actualiza los datos de una subcategoría existente.
 *       **Solo Administradores.**
 *
 *       Solo se actualizan los campos que se envíen en el body.
 *       Al menos uno de los campos editables debe estar presente.
 *
 *       **Campos editables:** `nombre`, `descripcion`, `id_categoria`, `activo`.
 *
 *       Si se cambia `id_categoria`, se verifica que la nueva categoría exista
 *       y que el nombre no esté duplicado en la nueva categoría.
 *     tags: [Subcategorías]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la subcategoría a actualizar
 *         example: 3
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ActualizarSubcategoriaRequest'
 *           examples:
 *             cambiar_nombre:
 *               summary: Cambiar solo el nombre
 *               value:
 *                 nombre: "Detección de fugas"
 *             desactivar:
 *               summary: Desactivar subcategoría
 *               value:
 *                 activo: false
 *             mover_categoria:
 *               summary: Mover a otra categoría
 *               value:
 *                 id_categoria: 2
 *                 nombre: "Instalación de duchas eléctricas"
 *             actualizacion_completa:
 *               summary: Actualizar todos los campos
 *               value:
 *                 nombre: "Reparación de tuberías residenciales"
 *                 descripcion: "Servicio especializado en tuberías de viviendas y apartamentos"
 *                 activo: true
 *     responses:
 *       200:
 *         description: Subcategoría actualizada exitosamente
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
 *                   example: "Subcategoría actualizada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_subcategoria:
 *                       type: integer
 *                       example: 3
 *                     nombre:
 *                       type: string
 *                       example: "Detección de fugas"
 *                     descripcion:
 *                       type: string
 *                       example: "Detección de fugas en tuberías"
 *                     id_categoria:
 *                       type: integer
 *                       example: 1
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
 *         description: Ya existe otra subcategoría con ese nombre en la misma categoría
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Ya existe una subcategoría con el nombre 'Detección de fugas' en esta categoría"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const actualizarSubcategoria = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { nombre, descripcion, id_categoria, activo } = req.body;

        // ----------------------------------------------------------------
        // 1. Validar ID
        // ----------------------------------------------------------------
        const idNumerico = parseInt(id, 10);
        if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El ID de la subcategoría debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Verificar que al menos un campo fue enviado
        // ----------------------------------------------------------------
        if (
            nombre === undefined &&
            descripcion === undefined &&
            id_categoria === undefined &&
            activo === undefined
        ) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'Debe enviar al menos un campo para actualizar: nombre, descripcion, id_categoria o activo',
            ]);
        }

        // ----------------------------------------------------------------
        // 3. Verificar que la subcategoría existe
        // ----------------------------------------------------------------
        const subcategoria = await Subcategoria.findByPk(idNumerico, { transaction: t });
        if (!subcategoria) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la subcategoría con ID ${idNumerico}`);
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
            } else if (descripcion.trim().length > 300) {
                errores.push('La descripción no puede superar los 300 caracteres');
            }
        }

        if (id_categoria !== undefined) {
            const idCatNum = parseInt(id_categoria, 10);
            if (!Number.isInteger(idCatNum) || idCatNum <= 0) {
                errores.push('El campo id_categoria debe ser un número entero positivo');
            }
        }

        if (errores.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', errores);
        }

        // ----------------------------------------------------------------
        // 5. Si se cambia la categoría, verificar que la nueva existe
        // ----------------------------------------------------------------
        // Determinamos con qué categoría trabajaremos para la validación de unicidad
        let idCatObjetivo = subcategoria.id_categoria;

        if (id_categoria !== undefined) {
            const idCatNum = parseInt(id_categoria, 10);
            const categoriaObjetivo = await Categoria.findByPk(idCatNum, { transaction: t });
            if (!categoriaObjetivo) {
                await t.rollback();
                throw new NotFoundError(`No se encontró la categoría con ID ${idCatNum}`);
            }
            idCatObjetivo = idCatNum;
        }

        // ----------------------------------------------------------------
        // 6. Verificar unicidad del nombre en la categoría destino
        //    Solo si se envía nombre O se cambia de categoría (o ambos)
        // ----------------------------------------------------------------
        if (nombre !== undefined || id_categoria !== undefined) {
            const nombreObjetivo = nombre !== undefined ? nombre.trim() : subcategoria.nombre;

            const duplicado = await Subcategoria.findOne({
                where: {
                    nombre:          { [Op.iLike]: nombreObjetivo },
                    id_categoria:    idCatObjetivo,
                    id_subcategoria: { [Op.ne]: idNumerico },
                },
                transaction: t,
            });

            if (duplicado) {
                await t.rollback();
                throw new ConflictError(
                    `Ya existe una subcategoría con el nombre '${nombreObjetivo}' en la categoría destino`
                );
            }
        }

        // ----------------------------------------------------------------
        // 7. Construir objeto con solo los campos presentes
        // ----------------------------------------------------------------
        const camposActualizar = {};
        if (nombre !== undefined)       camposActualizar.nombre       = nombre.trim();
        if (descripcion !== undefined)  camposActualizar.descripcion  = descripcion ? descripcion.trim() : null;
        if (id_categoria !== undefined) camposActualizar.id_categoria = parseInt(id_categoria, 10);
        if (activo !== undefined)       camposActualizar.activo       = Boolean(activo);

        // ----------------------------------------------------------------
        // 8. Actualizar
        // ----------------------------------------------------------------
        await Subcategoria.update(camposActualizar, {
            where: { id_subcategoria: idNumerico },
            transaction: t,
        });

        await t.commit();

        // Recuperar datos actualizados
        const subcategoriaActualizada = await Subcategoria.findByPk(idNumerico);

        logger.info(
            `actualizarSubcategoria: Subcategoría id=${idNumerico} actualizada — campos: ${Object.keys(camposActualizar).join(', ')}`
        );

        return res.status(200).json({
            success: true,
            message: 'Subcategoría actualizada exitosamente',
            data: {
                id_subcategoria: subcategoriaActualizada.id_subcategoria,
                nombre:          subcategoriaActualizada.nombre,
                descripcion:     subcategoriaActualizada.descripcion,
                id_categoria:    subcategoriaActualizada.id_categoria,
                activo:          subcategoriaActualizada.activo,
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
 * /subcategorias/{id}:
 *   delete:
 *     summary: Eliminar una subcategoría (HU-23)
 *     description: |
 *       Elimina permanentemente una subcategoría del catálogo.
 *       **Solo Administradores.**
 *
 *       **Restricciones de integridad antes de eliminar:**
 *       1. No puede tener especialidades de técnicos activas (`Especialidad`).
 *       2. No puede tener solicitudes de servicio asociadas (`Solicitud`).
 *
 *       Estos chequeos previenen el error de FK de la base de datos y dan
 *       mensajes de error descriptivos al administrador.
 *     tags: [Subcategorías]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la subcategoría a eliminar
 *         example: 7
 *     responses:
 *       200:
 *         description: Subcategoría eliminada exitosamente
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
 *                   example: "Subcategoría eliminada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_subcategoria:
 *                       type: integer
 *                       example: 7
 *                     nombre:
 *                       type: string
 *                       example: "Apertura de puertas"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: La subcategoría tiene registros dependientes y no puede eliminarse
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               tiene_especialidades:
 *                 summary: Técnicos con esta especialidad
 *                 value:
 *                   success: false
 *                   message: "No se puede eliminar la subcategoría porque 3 técnico(s) la tienen como especialidad. Reasigne las especialidades primero."
 *               tiene_solicitudes:
 *                 summary: Solicitudes de servicio vinculadas
 *                 value:
 *                   success: false
 *                   message: "No se puede eliminar la subcategoría porque tiene 12 solicitud(es) asociada(s)."
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const eliminarSubcategoria = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;

        // ----------------------------------------------------------------
        // 1. Validar ID
        // ----------------------------------------------------------------
        const idNumerico = parseInt(id, 10);
        if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El ID de la subcategoría debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Verificar que la subcategoría existe
        // ----------------------------------------------------------------
        const subcategoria = await Subcategoria.findByPk(idNumerico, { transaction: t });
        if (!subcategoria) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la subcategoría con ID ${idNumerico}`);
        }

        // ----------------------------------------------------------------
        // 3. Verificar que no tenga especialidades de técnicos activas
        //    (tabla Especialidad — pivot N:N entre Tecnico y Subcategoria)
        // ----------------------------------------------------------------
        const totalEspecialidades = await Especialidad.count({
            where: { id_subcategoria: idNumerico },
            transaction: t,
        });

        if (totalEspecialidades > 0) {
            await t.rollback();
            throw new ConflictError(
                `No se puede eliminar la subcategoría porque ${totalEspecialidades} técnico(s) la tienen como especialidad. Reasigne las especialidades primero.`
            );
        }

        // ----------------------------------------------------------------
        // 4. Verificar que no tenga solicitudes de servicio asociadas
        // ----------------------------------------------------------------
        const totalSolicitudes = await Solicitud.count({
            where: { id_subcategoria: idNumerico },
            transaction: t,
        });

        if (totalSolicitudes > 0) {
            await t.rollback();
            throw new ConflictError(
                `No se puede eliminar la subcategoría porque tiene ${totalSolicitudes} solicitud(es) de servicio asociada(s).`
            );
        }

        // ----------------------------------------------------------------
        // 5. Eliminar la subcategoría
        // ----------------------------------------------------------------
        const nombreEliminado = subcategoria.nombre;
        await subcategoria.destroy({ transaction: t });

        await t.commit();

        logger.info(
            `eliminarSubcategoria: Subcategoría id=${idNumerico} nombre='${nombreEliminado}' eliminada por usuario id=${req.usuario?.id_usuario}`
        );

        return res.status(200).json({
            success: true,
            message: 'Subcategoría eliminada exitosamente',
            data: {
                id_subcategoria: idNumerico,
                nombre:          nombreEliminado,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};
