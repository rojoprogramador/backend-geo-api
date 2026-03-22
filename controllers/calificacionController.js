import { Op } from 'sequelize';
import {
    sequelize,
    Calificacion,
    Servicio,
    Cliente,
    Tecnico,
    Usuario,
    Subcategoria,
    EstadoSolicitud,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import {
    ValidationError,
    NotFoundError,
    ForbiddenError,
    ConflictError,
} from '../utils/errors/AppError.js';
import { obtenerCliente, obtenerTecnico } from '../utils/profileHelpers.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constantes de estados de solicitud (sincronizadas con seeders)
// ---------------------------------------------------------------------------
const ESTADO_COMPLETADA = 6; // Servicio completado — único estado que permite calificar

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /calificaciones:
 *   post:
 *     summary: Calificar un servicio completado (HU-17)
 *     description: |
 *       Permite al cliente autenticado enviar una calificación (1–5 estrellas)
 *       para un servicio que ya fue completado.
 *
 *       **Proceso interno (transacción atómica):**
 *       1. Valida todos los campos de entrada.
 *       2. Verifica que el servicio exista y esté en estado COMPLETADA (id_estado=6).
 *       3. Verifica que el cliente autenticado sea el propietario del servicio.
 *       4. Verifica que el servicio aún no haya sido calificado (una calificación por servicio).
 *       5. Dentro de la transacción:
 *          - Crea la Calificacion con id_servicio, id_cliente, id_tecnico (del servicio),
 *            puntuacion, comentario y fecha_calificacion=NOW.
 *          - Recalcula el prom_calificacion del técnico usando AVG en BD.
 *       6. Retorna la calificacion creada junto al nuevo promedio del técnico.
 *
 *       **Reglas de validación:**
 *       - `id_servicio`: entero positivo, requerido.
 *       - `puntuacion`: entero entre 1 y 5, requerido.
 *       - `comentario`: texto entre 5 y 1000 caracteres (opcional).
 *     tags: [Calificaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearCalificacionRequest'
 *           examples:
 *             cinco_estrellas:
 *               summary: Calificación de 5 estrellas con comentario
 *               value:
 *                 id_servicio: 12
 *                 puntuacion: 5
 *                 comentario: "Excelente trabajo, muy puntual y profesional. Dejó todo limpio."
 *             tres_estrellas:
 *               summary: Calificación de 3 estrellas sin comentario
 *               value:
 *                 id_servicio: 13
 *                 puntuacion: 3
 *             cuatro_estrellas_cerrajeria:
 *               summary: Calificación de cerrajería
 *               value:
 *                 id_servicio: 14
 *                 puntuacion: 4
 *                 comentario: "Buen servicio, llegó a tiempo y resolvió el problema rápidamente."
 *     responses:
 *       201:
 *         description: Calificación registrada exitosamente
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
 *                   example: "Calificación registrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/CalificacionCreada'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: El servicio ya fue calificado o no está en estado COMPLETADA
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               ya_calificado:
 *                 summary: El servicio ya tiene calificación
 *                 value:
 *                   success: false
 *                   message: "Este servicio ya fue calificado. Solo se permite una calificación por servicio"
 *               estado_invalido:
 *                 summary: El servicio no está completado
 *                 value:
 *                   success: false
 *                   message: "Solo se puede calificar un servicio en estado COMPLETADA"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearCalificacion = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body
        // ----------------------------------------------------------------
        const { id_servicio, puntuacion, comentario } = req.body;

        // ----------------------------------------------------------------
        // 2. Validaciones de presencia (fase 1)
        // ----------------------------------------------------------------
        const camposFaltantes = [];

        if (id_servicio === undefined || id_servicio === null)
            camposFaltantes.push('El campo id_servicio es requerido');
        if (puntuacion === undefined || puntuacion === null)
            camposFaltantes.push('El campo puntuacion es requerido');

        if (camposFaltantes.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', camposFaltantes);
        }

        // ----------------------------------------------------------------
        // 3. Validaciones de formato (fase 2)
        // ----------------------------------------------------------------
        const erroresFormato = [];

        if (!Number.isInteger(Number(id_servicio)) || Number(id_servicio) < 1)
            erroresFormato.push('El id_servicio debe ser un entero positivo');

        const puntuacionNum = parseInt(puntuacion);
        if (isNaN(puntuacionNum) || puntuacionNum < 1 || puntuacionNum > 5)
            erroresFormato.push('La puntuacion debe ser un entero entre 1 y 5');

        if (comentario !== undefined && comentario !== null) {
            const comentarioTrimmed = String(comentario).trim();
            if (comentarioTrimmed.length < 5 || comentarioTrimmed.length > 1000)
                erroresFormato.push('El comentario debe tener entre 5 y 1000 caracteres');
        }

        if (erroresFormato.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', erroresFormato);
        }

        // ----------------------------------------------------------------
        // 4. Obtener el perfil de Cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 5. Verificar que el servicio existe y está en estado COMPLETADA (6)
        // ----------------------------------------------------------------
        const servicio = await Servicio.findByPk(Number(id_servicio), {
            transaction: t,
        });

        if (!servicio) {
            await t.rollback();
            throw new NotFoundError(`No se encontró el servicio con id ${id_servicio}`);
        }

        if (servicio.id_estado !== ESTADO_COMPLETADA) {
            await t.rollback();
            throw new ConflictError(
                'Solo se puede calificar un servicio en estado COMPLETADA'
            );
        }

        // ----------------------------------------------------------------
        // 6. Verificar que el cliente autenticado es el propietario del servicio
        // ----------------------------------------------------------------
        if (servicio.id_cliente !== cliente.id_cliente) {
            await t.rollback();
            throw new ForbiddenError(
                'No tienes permiso para calificar este servicio'
            );
        }

        // ----------------------------------------------------------------
        // 7. Verificar que el servicio aún no ha sido calificado
        //    (una sola calificación por servicio — restricción de negocio)
        // ----------------------------------------------------------------
        const calificacionExistente = await Calificacion.findOne({
            where: { id_servicio: Number(id_servicio) },
            transaction: t,
        });

        if (calificacionExistente) {
            await t.rollback();
            throw new ConflictError(
                'Este servicio ya fue calificado. Solo se permite una calificación por servicio'
            );
        }

        // ----------------------------------------------------------------
        // 8. Crear la calificacion dentro de la transacción
        // ----------------------------------------------------------------
        const nuevaCalificacion = await Calificacion.create(
            {
                id_servicio:       Number(id_servicio),
                id_cliente:        cliente.id_cliente,
                id_tecnico:        servicio.id_tecnico,
                puntuacion:        puntuacionNum,
                comentario:        comentario ? String(comentario).trim() : null,
                fecha_calificacion: new Date(),
            },
            { transaction: t }
        );

        logger.info(
            `crearCalificacion: Calificación ${nuevaCalificacion.id_calificacion} creada ` +
            `por cliente ${cliente.id_cliente} para servicio ${id_servicio} — ` +
            `puntuacion: ${puntuacionNum}/5 — técnico: ${servicio.id_tecnico}`
        );

        // ----------------------------------------------------------------
        // 9. Recalcular prom_calificacion del técnico usando AVG en BD
        //    Se incluye la calificación recién creada porque la transacción
        //    es la misma (lectura dentro de la misma transacción la ve).
        // ----------------------------------------------------------------
        const resultado = await Calificacion.findOne({
            where: { id_tecnico: servicio.id_tecnico },
            attributes: [
                [sequelize.fn('AVG', sequelize.col('puntuacion')), 'promedio'],
                [sequelize.fn('COUNT', sequelize.col('id_calificacion')), 'total'],
            ],
            raw: true,
            transaction: t,
        });

        const nuevoPromedio = parseFloat(resultado.promedio).toFixed(2);
        const totalCalificaciones = parseInt(resultado.total);

        await Tecnico.update(
            { prom_calificacion: nuevoPromedio },
            { where: { id_tecnico: servicio.id_tecnico }, transaction: t }
        );

        logger.info(
            `crearCalificacion: prom_calificacion del técnico ${servicio.id_tecnico} ` +
            `actualizado a ${nuevoPromedio} (total: ${totalCalificaciones} calificaciones)`
        );

        await t.commit();

        // ── WebSocket: notificar al técnico que recibió una calificación (best-effort) ──
        try {
            const { emitCalificacionRecibida } = await import('../sockets/services/socketEmitter.js');
            const tecnicoCalificado = await Tecnico.findByPk(servicio.id_tecnico, { attributes: ['id_usuario'] });
            if (tecnicoCalificado?.id_usuario) {
                emitCalificacionRecibida({
                    id_tecnico_usuario: tecnicoCalificado.id_usuario,
                    calificacionData: {
                        id_servicio:    Number(id_servicio),
                        id_cliente:     cliente.id_cliente,
                        puntuacion:     puntuacionNum,
                        comentario:     comentario ? String(comentario).trim() : null,
                        nuevo_promedio: parseFloat(nuevoPromedio),
                    },
                });
            }
        } catch (wsErr) {
            logger.warn(`crearCalificacion: WebSocket emit falló (no-crítico): ${wsErr.message}`);
        }

        // Cargar la calificación completa para la respuesta (fuera de transacción)
        const calificacionCompleta = await Calificacion.findByPk(
            nuevaCalificacion.id_calificacion,
            {
                include: [
                    {
                        model: Cliente,
                        as:    'cliente',
                        attributes: ['id_cliente'],
                        include: [
                            {
                                model: Usuario,
                                as:    'datos_usuario',
                                attributes: ['nombre', 'apellido'],
                            },
                        ],
                    },
                    {
                        model: Tecnico,
                        as:    'tecnico',
                        attributes: ['id_tecnico', 'prom_calificacion'],
                        include: [
                            {
                                model: Usuario,
                                as:    'datos_usuario',
                                attributes: ['nombre', 'apellido'],
                            },
                        ],
                    },
                    {
                        model: Servicio,
                        as:    'servicio',
                        attributes: ['id_servicio', 'id_estado', 'valor_total', 'fecha_servicio'],
                        include: [
                            {
                                model: Subcategoria,
                                as:    'subcategoria',
                                attributes: ['id_subcategoria', 'nombre'],
                            },
                        ],
                    },
                ],
            }
        );

        return res.status(201).json({
            success: true,
            message:  'Calificación registrada exitosamente',
            data: {
                calificacion:          calificacionCompleta,
                nuevo_promedio_tecnico: parseFloat(nuevoPromedio),
                total_calificaciones:   totalCalificaciones,
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
 * /calificaciones/tecnico/{id_tecnico}:
 *   get:
 *     summary: Obtener calificaciones de un técnico (HU-18)
 *     description: |
 *       Retorna todas las calificaciones recibidas por un técnico específico,
 *       paginadas y ordenadas de más reciente a más antigua.
 *
 *       **Datos incluidos:**
 *       - Datos del cliente calificador: nombre y apellido.
 *       - Datos del servicio calificado: subcategoría.
 *       - Promedio actual (prom_calificacion del técnico) y total de calificaciones.
 *
 *       **Paginación:**
 *       - `page`: número de página (default 1).
 *       - `limit`: registros por página (default 10, máximo 50).
 *     tags: [Calificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id_tecnico
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del técnico cuyas calificaciones se desean consultar
 *         example: 3
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página (paginación)
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Cantidad de calificaciones por página (máximo 50)
 *         example: 10
 *     responses:
 *       200:
 *         description: Calificaciones obtenidas exitosamente
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
 *                   example: "Se encontraron 15 calificaciones para el técnico 3"
 *                 data:
 *                   $ref: '#/components/schemas/CalificacionesTecnicoResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerCalificacionesTecnico = async (req, res) => {
    try {
        const idTecnico = parseInt(req.params.id_tecnico);

        if (!idTecnico || idTecnico < 1) {
            throw new ValidationError('Error de validación', [
                'El id_tecnico debe ser un entero positivo',
            ]);
        }

        // Paginación — validar y normalizar parámetros query
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        // ----------------------------------------------------------------
        // 1. Verificar que el técnico existe
        // ----------------------------------------------------------------
        const tecnico = await Tecnico.findByPk(idTecnico, {
            attributes: ['id_tecnico', 'prom_calificacion'],
            include: [
                {
                    model: Usuario,
                    as:    'datos_usuario',
                    attributes: ['nombre', 'apellido'],
                },
            ],
        });

        if (!tecnico) {
            throw new NotFoundError(`No se encontró el técnico con id ${idTecnico}`);
        }

        // ----------------------------------------------------------------
        // 2. Obtener calificaciones paginadas, ordenadas por fecha DESC
        // ----------------------------------------------------------------
        const { count: totalCalificaciones, rows: calificaciones } =
            await Calificacion.findAndCountAll({
                where: { id_tecnico: idTecnico },
                include: [
                    {
                        model: Cliente,
                        as:    'cliente',
                        attributes: ['id_cliente'],
                        include: [
                            {
                                model: Usuario,
                                as:    'datos_usuario',
                                attributes: ['nombre', 'apellido'],
                            },
                        ],
                    },
                    {
                        model: Servicio,
                        as:    'servicio',
                        attributes: ['id_servicio', 'fecha_servicio', 'valor_total'],
                        include: [
                            {
                                model: Subcategoria,
                                as:    'subcategoria',
                                attributes: ['id_subcategoria', 'nombre'],
                            },
                        ],
                    },
                ],
                order:  [['fecha_calificacion', 'DESC']],
                limit,
                offset,
            });

        const totalPaginas = Math.ceil(totalCalificaciones / limit);

        logger.info(
            `obtenerCalificacionesTecnico: ${totalCalificaciones} calificación(es) ` +
            `para técnico ${idTecnico} — página ${page}/${totalPaginas}`
        );

        return res.status(200).json({
            success: true,
            message:  `Se encontraron ${totalCalificaciones} calificaciones para el técnico ${idTecnico}`,
            data: {
                tecnico: {
                    id_tecnico:        tecnico.id_tecnico,
                    nombre:            tecnico.datos_usuario?.nombre,
                    apellido:          tecnico.datos_usuario?.apellido,
                    prom_calificacion: tecnico.prom_calificacion,
                },
                total_calificaciones: totalCalificaciones,
                pagina_actual:        page,
                total_paginas:        totalPaginas,
                por_pagina:           limit,
                calificaciones,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /calificaciones/tecnico/mi-promedio:
 *   get:
 *     summary: Ver mi promedio como técnico
 *     description: |
 *       Permite al técnico autenticado ver su promedio de calificaciones,
 *       el total de calificaciones recibidas y un desglose por número de estrellas
 *       (cuántas calificaciones de 1, 2, 3, 4 y 5 estrellas ha recibido).
 *
 *       **Acceso:** Solo para usuarios con rol Técnico.
 *     tags: [Calificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promedio y estadísticas de calificaciones obtenidos exitosamente
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
 *                   example: "Estadísticas de calificaciones obtenidas exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/PromedioTecnicoResponse'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerMiCalificacionComoTecnico = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Obtener el perfil de Técnico del usuario autenticado
        // ----------------------------------------------------------------
        const tecnico = await obtenerTecnico(req.usuario.id_usuario);

        // Recargar con solo los atributos necesarios
        await tecnico.reload({ attributes: ['id_tecnico', 'prom_calificacion'] });

        // ----------------------------------------------------------------
        // 2. Obtener total de calificaciones y promedio actualizado desde BD
        // ----------------------------------------------------------------
        const estadisticas = await Calificacion.findOne({
            where: { id_tecnico: tecnico.id_tecnico },
            attributes: [
                [sequelize.fn('AVG',   sequelize.col('puntuacion')),     'promedio'],
                [sequelize.fn('COUNT', sequelize.col('id_calificacion')), 'total'],
            ],
            raw: true,
        });

        const promedioActual = estadisticas.promedio
            ? parseFloat(estadisticas.promedio).toFixed(2)
            : '0.00';
        const totalCalificaciones = parseInt(estadisticas.total) || 0;

        // ----------------------------------------------------------------
        // 3. Desglose por número de estrellas (1–5)
        //    Conteo de cuántas calificaciones tiene de cada puntuación
        // ----------------------------------------------------------------
        const desgloseRaw = await Calificacion.findAll({
            where: { id_tecnico: tecnico.id_tecnico },
            attributes: [
                'puntuacion',
                [sequelize.fn('COUNT', sequelize.col('id_calificacion')), 'cantidad'],
            ],
            group:  ['puntuacion'],
            order:  [['puntuacion', 'ASC']],
            raw:    true,
        });

        // Construir objeto { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } y llenar con datos reales
        const desglosePorEstrellas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const fila of desgloseRaw) {
            const estrellas = parseInt(fila.puntuacion);
            if (estrellas >= 1 && estrellas <= 5) {
                desglosePorEstrellas[estrellas] = parseInt(fila.cantidad);
            }
        }

        logger.info(
            `obtenerMiCalificacionComoTecnico: Técnico ${tecnico.id_tecnico} ` +
            `— promedio: ${promedioActual} (${totalCalificaciones} calificaciones)`
        );

        return res.status(200).json({
            success: true,
            message:  'Estadísticas de calificaciones obtenidas exitosamente',
            data: {
                id_tecnico:           tecnico.id_tecnico,
                prom_calificacion:    parseFloat(promedioActual),
                total_calificaciones: totalCalificaciones,
                desglose_por_estrellas: desglosePorEstrellas,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /calificaciones/servicio/{id_servicio}:
 *   get:
 *     summary: Obtener la calificación de un servicio específico
 *     description: |
 *       Retorna la calificación asociada a un servicio, si existe.
 *
 *       **Control de acceso:**
 *       - El cliente propietario del servicio puede verla.
 *       - El técnico que realizó el servicio puede verla.
 *       - Un Administrador puede verla siempre.
 *       - Cualquier otro usuario recibirá un error 403.
 *
 *       Si el servicio no tiene calificación aún, se retorna `null` en `data.calificacion`
 *       con `success: true` y un mensaje informativo.
 *     tags: [Calificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id_servicio
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del servicio cuya calificación se desea consultar
 *         example: 12
 *     responses:
 *       200:
 *         description: Calificación obtenida exitosamente (puede ser null si no existe)
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
 *                   example: "Calificación obtenida exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_servicio:
 *                       type: integer
 *                       example: 12
 *                     calificacion:
 *                       nullable: true
 *                       $ref: '#/components/schemas/CalificacionDetalle'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerCalificacionServicio = async (req, res) => {
    try {
        const idServicio = parseInt(req.params.id_servicio);

        if (!idServicio || idServicio < 1) {
            throw new ValidationError('Error de validación', [
                'El id_servicio debe ser un entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 1. Verificar que el servicio existe
        // ----------------------------------------------------------------
        const servicio = await Servicio.findByPk(idServicio, {
            attributes: ['id_servicio', 'id_cliente', 'id_tecnico'],
        });

        if (!servicio) {
            throw new NotFoundError(`No se encontró el servicio con id ${idServicio}`);
        }

        // ----------------------------------------------------------------
        // 2. Control de acceso:
        //    Determinar si el usuario autenticado tiene permiso para ver
        //    la calificación de este servicio.
        //    Roles: 'Administrador' tiene acceso irrestricto.
        //    'Cliente' solo si es el propietario del servicio.
        //    'Tecnico' solo si realizó el servicio.
        // ----------------------------------------------------------------
        const { rol, id_usuario } = req.usuario;

        if (rol !== 'ADMIN') {
            if (rol === 'CLIENTE') {
                // Verificar que el cliente autenticado es el dueño del servicio
                const cliente = await obtenerCliente(id_usuario);

                if (cliente.id_cliente !== servicio.id_cliente) {
                    throw new ForbiddenError(
                        'No tienes permiso para ver la calificación de este servicio'
                    );
                }
            } else if (rol === 'TECNICO') {
                // Verificar que el técnico autenticado realizó este servicio
                const tecnico = await obtenerTecnico(id_usuario);

                if (tecnico.id_tecnico !== servicio.id_tecnico) {
                    throw new ForbiddenError(
                        'No tienes permiso para ver la calificación de este servicio'
                    );
                }
            } else {
                // Rol desconocido — denegar acceso por defecto
                throw new ForbiddenError(
                    'No tienes permiso para ver la calificación de este servicio'
                );
            }
        }

        // ----------------------------------------------------------------
        // 3. Buscar la calificación del servicio (puede no existir aún)
        // ----------------------------------------------------------------
        const calificacion = await Calificacion.findOne({
            where: { id_servicio: idServicio },
            include: [
                {
                    model: Cliente,
                    as:    'cliente',
                    attributes: ['id_cliente'],
                    include: [
                        {
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido'],
                        },
                    ],
                },
                {
                    model: Tecnico,
                    as:    'tecnico',
                    attributes: ['id_tecnico', 'prom_calificacion'],
                    include: [
                        {
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido'],
                        },
                    ],
                },
            ],
        });

        const mensaje = calificacion
            ? 'Calificación obtenida exitosamente'
            : 'Este servicio aún no ha sido calificado';

        logger.info(
            `obtenerCalificacionServicio: Usuario ${id_usuario} (${rol}) consultó ` +
            `calificación del servicio ${idServicio} — ${calificacion ? 'encontrada' : 'sin calificación'}`
        );

        return res.status(200).json({
            success: true,
            message:  mensaje,
            data: {
                id_servicio:  idServicio,
                calificacion: calificacion ?? null,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};
