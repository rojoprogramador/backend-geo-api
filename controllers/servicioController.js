import { Op } from 'sequelize';
import {
    sequelize,
    Servicio,
    Solicitud,
    Cotizacion,
    Cliente,
    Tecnico,
    Subcategoria,
    EstadoSolicitud,
    MedioPago,
    Transaccion,
    CuentaTecnico,
    Usuario,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { obtenerCliente, obtenerTecnico } from '../utils/profileHelpers.js';

// ---------------------------------------------------------------------------
// Constantes de estados de solicitud (sincronizadas con seeders de EstadoSolicitud)
// ---------------------------------------------------------------------------
const ESTADO_ASIGNADA   = 4; // Cliente aceptó cotización, técnico asignado
const ESTADO_EN_PROCESO = 5; // Técnico inició el trabajo
const ESTADO_COMPLETADA = 6; // Trabajo terminado

// Comisión de la plataforma sobre el valor total del servicio
const COMISION_PLATAFORMA = 0.15;

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /servicios/iniciar/{id_solicitud}:
 *   put:
 *     summary: Iniciar la ejecución de un servicio (HU-16)
 *     description: |
 *       Permite al técnico asignado iniciar formalmente el trabajo correspondiente
 *       a una solicitud en estado ASIGNADA (4).
 *
 *       **Proceso interno:**
 *       1. Verifica que la solicitud exista y que el técnico autenticado sea el técnico asignado.
 *       2. Verifica que la solicitud esté en estado ASIGNADA (4).
 *       3. En una transacción atómica:
 *          - Crea un registro `Servicio` con los datos heredados de la solicitud.
 *          - Establece el estado del Servicio en EN_PROCESO (5).
 *          - Actualiza el estado de la Solicitud a EN_PROCESO (5).
 *          - Garantiza que el técnico tenga una `CuentaTecnico` (findOrCreate).
 *       4. Retorna el servicio creado.
 *
 *       **Reglas de negocio:**
 *       - Solo el técnico asignado puede iniciar el servicio.
 *       - La solicitud debe estar en estado ASIGNADA (4).
 *       - No se puede iniciar un servicio dos veces (validación de Servicio existente).
 *     tags: [Servicios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id_solicitud
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID de la solicitud a iniciar (`id_solicitud`)
 *         example: 15
 *     responses:
 *       201:
 *         description: Servicio iniciado exitosamente
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
 *                   example: "Servicio iniciado exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_servicio:
 *                       type: integer
 *                       example: 8
 *                     id_solicitud:
 *                       type: integer
 *                       example: 15
 *                     id_cliente:
 *                       type: integer
 *                       example: 3
 *                     id_tecnico:
 *                       type: integer
 *                       example: 7
 *                     id_subcategoria:
 *                       type: integer
 *                       example: 2
 *                     id_estado:
 *                       type: integer
 *                       example: 5
 *                     fecha_servicio:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-02-12T10:30:00.000Z"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-02-12T10:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: La solicitud no está en estado ASIGNADA o ya tiene un servicio activo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               estado_invalido:
 *                 summary: Solicitud no está en estado ASIGNADA
 *                 value:
 *                   success: false
 *                   message: "La solicitud no está en estado ASIGNADA. Estado actual: COMPLETADA"
 *               servicio_ya_existe:
 *                 summary: El servicio ya fue iniciado
 *                 value:
 *                   success: false
 *                   message: "Esta solicitud ya tiene un servicio en curso (id_servicio: 8)"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const iniciarServicio = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Validar parámetro de ruta
        // ----------------------------------------------------------------
        const idSolicitud = parseInt(req.params.id_solicitud, 10);
        if (!Number.isInteger(idSolicitud) || idSolicitud <= 0) {
            await t.rollback();
            throw new ValidationError('Parámetro inválido', [
                'El parámetro id_solicitud debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Obtener el perfil Tecnico del usuario autenticado
        // ----------------------------------------------------------------
        const tecnico = await obtenerTecnico(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 3. Buscar la solicitud y verificar que le pertenece al técnico
        // ----------------------------------------------------------------
        const solicitud = await Solicitud.findByPk(idSolicitud, {
            include: [
                { model: EstadoSolicitud, as: 'estado', attributes: ['descripcion'] },
            ],
            transaction: t,
        });

        if (!solicitud) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la solicitud con ID ${idSolicitud}`);
        }

        if (solicitud.id_tecnico !== tecnico.id_tecnico) {
            await t.rollback();
            throw new ForbiddenError('No tienes permiso para iniciar este servicio. No eres el técnico asignado a esta solicitud');
        }

        // ----------------------------------------------------------------
        // 4. Verificar estado de la solicitud: debe ser ASIGNADA (4)
        // ----------------------------------------------------------------
        if (solicitud.id_estado !== ESTADO_ASIGNADA) {
            await t.rollback();
            throw new ConflictError(
                `La solicitud no está en estado ASIGNADA. Estado actual: ${solicitud.estado?.descripcion ?? solicitud.id_estado}`
            );
        }

        // ----------------------------------------------------------------
        // 5. Verificar que no exista ya un Servicio para esta solicitud
        //    (protección contra doble envío / idempotencia)
        // ----------------------------------------------------------------
        const servicioExistente = await Servicio.findOne({
            where: { id_solicitud: idSolicitud },
            transaction: t,
        });

        if (servicioExistente) {
            await t.rollback();
            throw new ConflictError(
                `Esta solicitud ya tiene un servicio en curso (id_servicio: ${servicioExistente.id_servicio})`
            );
        }

        // ----------------------------------------------------------------
        // 6. Crear el Servicio heredando datos de la solicitud
        //    - La ubicacion_servicio se toma de ubicacion_solicitud
        //    - id_estado = EN_PROCESO (5)
        // ----------------------------------------------------------------
        const nuevoServicio = await Servicio.create(
            {
                id_solicitud:     idSolicitud,
                id_cliente:       solicitud.id_cliente,
                id_tecnico:       tecnico.id_tecnico,
                id_subcategoria:  solicitud.id_subcategoria,
                ubicacion_servicio: solicitud.ubicacion_solicitud,
                id_estado:        ESTADO_EN_PROCESO,
                valor_total:      0,
            },
            { transaction: t }
        );

        logger.info(
            `iniciarServicio: Servicio id=${nuevoServicio.id_servicio} creado para solicitud id=${idSolicitud} — técnico id=${tecnico.id_tecnico}`
        );

        // ----------------------------------------------------------------
        // 7. Actualizar el estado de la Solicitud a EN_PROCESO (5)
        // ----------------------------------------------------------------
        await Solicitud.update(
            { id_estado: ESTADO_EN_PROCESO },
            {
                where: { id_solicitud: idSolicitud },
                transaction: t,
            }
        );

        // ----------------------------------------------------------------
        // 8. Garantizar que el técnico tenga una CuentaTecnico
        //    findOrCreate crea la cuenta con saldos en 0 si no existe
        // ----------------------------------------------------------------
        const [cuenta, cuentaCreada] = await CuentaTecnico.findOrCreate({
            where: { id_tecnico: tecnico.id_tecnico },
            defaults: {
                id_tecnico:                    tecnico.id_tecnico,
                saldo_disponible:              0,
                saldo_pendiente:               0,
                total_ganado:                  0,
                total_comisiones_plataforma:   0,
            },
            transaction: t,
        });

        if (cuentaCreada) {
            logger.info(
                `iniciarServicio: CuentaTecnico creada automáticamente para técnico id=${tecnico.id_tecnico}`
            );
        }

        await t.commit();

        return res.status(201).json({
            success: true,
            message: 'Servicio iniciado exitosamente',
            data: {
                id_servicio:     nuevoServicio.id_servicio,
                id_solicitud:    nuevoServicio.id_solicitud,
                id_cliente:      nuevoServicio.id_cliente,
                id_tecnico:      nuevoServicio.id_tecnico,
                id_subcategoria: nuevoServicio.id_subcategoria,
                id_estado:       nuevoServicio.id_estado,
                valor_total:     nuevoServicio.valor_total,
                fecha_servicio:  nuevoServicio.fecha_servicio,
                createdAt:       nuevoServicio.createdAt,
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
 * /servicios/{id}/finalizar:
 *   put:
 *     summary: Finalizar un servicio y registrar el pago (HU-16)
 *     description: |
 *       Permite al técnico asignado finalizar un servicio que está en estado
 *       EN_PROCESO (5), registrar el pago y acreditar las ganancias en su cuenta.
 *
 *       **Proceso interno (todo en una sola transacción atómica):**
 *       1. Actualiza el Servicio: id_estado=COMPLETADA (6), id_medioPago, imagenes, valor_total.
 *          Si no se envía `valor_total`, se usa el `valor_cotizacion` de la cotización ACEPTADA.
 *       2. Actualiza la Solicitud de origen a COMPLETADA (6).
 *       3. Crea la Transaccion:
 *          - `comision_plataforma` = valor_total * 15%
 *          - `monto_tecnico` = valor_total - comision_plataforma
 *          - `estado_pago` = PENDIENTE (el pago aún no se ha procesado)
 *       4. Incrementa en CuentaTecnico (operación atómica):
 *          - `saldo_pendiente` += monto_tecnico
 *          - `total_ganado` += monto_tecnico
 *          - `total_comisiones_plataforma` += comision_plataforma
 *
 *       **Reglas de negocio:**
 *       - Solo el técnico asignado al servicio puede finalizarlo.
 *       - El servicio debe estar en estado EN_PROCESO (5).
 *       - `id_medioPago` es obligatorio.
 *       - Si `valor_total` no se envía, se obtiene de la cotización ACEPTADA de la solicitud origen.
 *       - Si no hay cotización aceptada y tampoco se envía valor_total, se lanza error de validación.
 *     tags: [Servicios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del servicio a finalizar (`id_servicio`)
 *         example: 8
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_medioPago
 *             properties:
 *               id_medioPago:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *                 description: "ID del medio de pago (1=EFECTIVO, 2=TARJETA_CREDITO, 3=TRANSFERENCIA, 4=SALDO_APP)"
 *               valor_total:
 *                 type: number
 *                 format: float
 *                 minimum: 0.01
 *                 nullable: true
 *                 example: 180000
 *                 description: "Valor total cobrado en COP. Si no se envía, se usa el valor de la cotización aceptada."
 *               imagenes:
 *                 type: string
 *                 nullable: true
 *                 example: "https://storage.geoapi.co/servicios/8/foto1.jpg,https://storage.geoapi.co/servicios/8/foto2.jpg"
 *                 description: "URLs de fotos de evidencia del trabajo realizado (separadas por coma)"
 *           examples:
 *             efectivo_con_valor:
 *               summary: Pago en efectivo con valor confirmado
 *               value:
 *                 id_medioPago: 1
 *                 valor_total: 180000
 *                 imagenes: "https://storage.geoapi.co/servicios/8/evidencia1.jpg"
 *             transferencia_valor_cotizacion:
 *               summary: Transferencia usando valor de la cotización
 *               value:
 *                 id_medioPago: 3
 *             tarjeta_con_fotos:
 *               summary: Pago con tarjeta y múltiples fotos
 *               value:
 *                 id_medioPago: 2
 *                 valor_total: 95000
 *                 imagenes: "https://storage.geoapi.co/servicios/8/foto1.jpg,https://storage.geoapi.co/servicios/8/foto2.jpg"
 *     responses:
 *       200:
 *         description: Servicio finalizado y transacción registrada exitosamente
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
 *                   example: "Servicio finalizado exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_servicio:
 *                       type: integer
 *                       example: 8
 *                     id_estado:
 *                       type: integer
 *                       example: 6
 *                     valor_total:
 *                       type: number
 *                       format: float
 *                       example: 180000
 *                     transaccion:
 *                       type: object
 *                       properties:
 *                         id_transaccion:
 *                           type: integer
 *                           example: 5
 *                         monto_total:
 *                           type: number
 *                           format: float
 *                           example: 180000
 *                         comision_plataforma:
 *                           type: number
 *                           format: float
 *                           example: 27000
 *                         monto_tecnico:
 *                           type: number
 *                           format: float
 *                           example: 153000
 *                         estado_pago:
 *                           type: string
 *                           example: "PENDIENTE"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: El servicio no está en estado EN_PROCESO o ya fue finalizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "El servicio no está en estado EN_PROCESO. Estado actual: COMPLETADA"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const finalizarServicio = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Validar parámetro de ruta
        // ----------------------------------------------------------------
        const idServicio = parseInt(req.params.id, 10);
        if (!Number.isInteger(idServicio) || idServicio <= 0) {
            await t.rollback();
            throw new ValidationError('Parámetro inválido', [
                'El parámetro id debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Validar campos del body
        // ----------------------------------------------------------------
        const { id_medioPago, imagenes, valor_total: valorTotalBody } = req.body;

        if (!id_medioPago) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El campo id_medioPago es requerido',
            ]);
        }

        const idMedioPagoNum = parseInt(id_medioPago, 10);
        if (!Number.isInteger(idMedioPagoNum) || idMedioPagoNum <= 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El campo id_medioPago debe ser un entero positivo',
            ]);
        }

        if (valorTotalBody !== undefined && valorTotalBody !== null) {
            const valorNum = parseFloat(valorTotalBody);
            if (isNaN(valorNum) || valorNum <= 0) {
                await t.rollback();
                throw new ValidationError('Error de validación', [
                    'El campo valor_total debe ser un número mayor a 0',
                ]);
            }
        }

        // ----------------------------------------------------------------
        // 3. Obtener el perfil Tecnico del usuario autenticado
        // ----------------------------------------------------------------
        const tecnico = await obtenerTecnico(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 4. Buscar el Servicio con su solicitud de origen para acceder
        //    a las cotizaciones cuando no se envía valor_total
        // ----------------------------------------------------------------
        const servicio = await Servicio.findByPk(idServicio, {
            include: [
                {
                    model: EstadoSolicitud,
                    as: 'estado',
                    attributes: ['descripcion'],
                },
                {
                    model: Solicitud,
                    as: 'solicitud_origen',
                    attributes: ['id_solicitud', 'id_estado'],
                    include: [
                        {
                            model: Cotizacion,
                            as: 'cotizaciones',
                            where: { estado: 'ACEPTADA' },
                            required: false,
                            attributes: ['id_cotizacion', 'valor_cotizacion'],
                        },
                    ],
                },
            ],
            transaction: t,
        });

        if (!servicio) {
            await t.rollback();
            throw new NotFoundError(`No se encontró el servicio con ID ${idServicio}`);
        }

        // ----------------------------------------------------------------
        // 5. Verificar que el técnico autenticado es el técnico del servicio
        // ----------------------------------------------------------------
        if (servicio.id_tecnico !== tecnico.id_tecnico) {
            await t.rollback();
            throw new ForbiddenError('No tienes permiso para finalizar este servicio. No eres el técnico asignado');
        }

        // ----------------------------------------------------------------
        // 6. Verificar estado del servicio: debe ser EN_PROCESO (5)
        // ----------------------------------------------------------------
        if (servicio.id_estado !== ESTADO_EN_PROCESO) {
            await t.rollback();
            throw new ConflictError(
                `El servicio no está en estado EN_PROCESO. Estado actual: ${servicio.estado?.descripcion ?? servicio.id_estado}`
            );
        }

        // ----------------------------------------------------------------
        // 7. Verificar que el MedioPago existe
        // ----------------------------------------------------------------
        const medioPago = await MedioPago.findByPk(idMedioPagoNum, { transaction: t });
        if (!medioPago) {
            await t.rollback();
            throw new NotFoundError(`No se encontró el medio de pago con ID ${idMedioPagoNum}`);
        }

        // ----------------------------------------------------------------
        // 8. Determinar el valor total del servicio
        //    - Si se envió en el body, se usa ese valor
        //    - Si no, se usa el valor de la cotización ACEPTADA
        //    - Si no existe ninguno de los dos, se lanza error
        // ----------------------------------------------------------------
        let valorTotalFinal;

        if (valorTotalBody !== undefined && valorTotalBody !== null) {
            valorTotalFinal = parseFloat(valorTotalBody);
        } else {
            const cotizacionAceptada = servicio.solicitud_origen?.cotizaciones?.[0] ?? null;
            if (!cotizacionAceptada) {
                await t.rollback();
                throw new ValidationError('Error de validación', [
                    'No se encontró una cotización aceptada para esta solicitud. Debe proporcionar el campo valor_total.',
                ]);
            }
            valorTotalFinal = parseFloat(cotizacionAceptada.valor_cotizacion);
        }

        // ----------------------------------------------------------------
        // 9. Calcular comisiones
        // ----------------------------------------------------------------
        const comisionPlataforma = parseFloat((valorTotalFinal * COMISION_PLATAFORMA).toFixed(2));
        const montoTecnico       = parseFloat((valorTotalFinal - comisionPlataforma).toFixed(2));

        // ----------------------------------------------------------------
        // 10. Actualizar el Servicio: COMPLETADA + datos de finalización
        // ----------------------------------------------------------------
        await Servicio.update(
            {
                id_estado:    ESTADO_COMPLETADA,
                id_medioPago: idMedioPagoNum,
                valor_total:  valorTotalFinal,
                imagenes:     imagenes ?? null,
            },
            {
                where: { id_servicio: idServicio },
                transaction: t,
            }
        );

        // ----------------------------------------------------------------
        // 11. Actualizar la Solicitud de origen a COMPLETADA (6)
        // ----------------------------------------------------------------
        if (servicio.id_solicitud) {
            await Solicitud.update(
                { id_estado: ESTADO_COMPLETADA },
                {
                    where: { id_solicitud: servicio.id_solicitud },
                    transaction: t,
                }
            );
        }

        // ----------------------------------------------------------------
        // 12. Crear la Transaccion
        // ----------------------------------------------------------------
        const transaccion = await Transaccion.create(
            {
                id_servicio:           idServicio,
                monto_total:           valorTotalFinal,
                monto_tecnico:         montoTecnico,
                comision_plataforma:   comisionPlataforma,
                id_medioPago:          idMedioPagoNum,
                metodo_cobro:          'PLATAFORMA',
                estado_pago:           'PENDIENTE',
            },
            { transaction: t }
        );

        logger.info(
            `finalizarServicio: Transacción id=${transaccion.id_transaccion} creada — servicio id=${idServicio} — monto_total=${valorTotalFinal} COP — comision=${comisionPlataforma} COP — monto_tecnico=${montoTecnico} COP`
        );

        // ----------------------------------------------------------------
        // 13. Actualizar la CuentaTecnico con incrementos atómicos
        //     REGLA DE ORO: nunca leer-sumar-escribir, siempre increment()
        // ----------------------------------------------------------------
        const cuenta = await CuentaTecnico.findOne({
            where: { id_tecnico: tecnico.id_tecnico },
            transaction: t,
        });

        if (!cuenta) {
            await t.rollback();
            logger.error(
                `finalizarServicio: CuentaTecnico no encontrada para técnico id=${tecnico.id_tecnico}. Debió crearse en iniciarServicio.`
            );
            throw new NotFoundError(
                'No se encontró la cuenta del técnico. Por favor contacte al administrador.'
            );
        }

        await cuenta.increment(
            {
                saldo_pendiente:             montoTecnico,
                total_ganado:                montoTecnico,
                total_comisiones_plataforma: comisionPlataforma,
            },
            { transaction: t }
        );

        await t.commit();

        logger.info(
            `finalizarServicio: Servicio id=${idServicio} COMPLETADO — técnico id=${tecnico.id_tecnico} — saldo_pendiente +${montoTecnico} COP`
        );

        return res.status(200).json({
            success: true,
            message: 'Servicio finalizado exitosamente',
            data: {
                id_servicio:  idServicio,
                id_solicitud: servicio.id_solicitud,
                id_tecnico:   tecnico.id_tecnico,
                id_estado:    ESTADO_COMPLETADA,
                valor_total:  valorTotalFinal,
                id_medioPago: idMedioPagoNum,
                imagenes:     imagenes ?? null,
                transaccion: {
                    id_transaccion:          transaccion.id_transaccion,
                    monto_total:             valorTotalFinal,
                    comision_plataforma:     comisionPlataforma,
                    monto_tecnico:           montoTecnico,
                    id_medioPago:            idMedioPagoNum,
                    metodo_cobro:            transaccion.metodo_cobro,
                    estado_pago:             transaccion.estado_pago,
                },
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
 * /servicios/tecnico/mis-servicios:
 *   get:
 *     summary: Listar servicios del técnico autenticado (HU-16)
 *     description: |
 *       Retorna el historial paginado de todos los servicios realizados por el
 *       técnico autenticado, ordenados del más reciente al más antiguo.
 *
 *       **Incluye por cada servicio:**
 *       - Solicitud de origen (trazabilidad)
 *       - Subcategoría del servicio
 *       - Estado actual
 *       - Datos del cliente con información del usuario
 *       - Transacción asociada (si existe)
 *
 *       **Paginación:**
 *       - `page` (entero >= 1, default: 1)
 *       - `limit` (entero 1–100, default: 20)
 *     tags: [Servicios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: "Número de página (comienza en 1)"
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: "Registros por página (máximo 100)"
 *         example: 20
 *     responses:
 *       200:
 *         description: Servicios del técnico obtenidos exitosamente
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
 *                   example: "Servicios obtenidos exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 12
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ServicioResumen'
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
export const obtenerServiciosPorTecnico = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Parsear y validar parámetros de paginación
        // ----------------------------------------------------------------
        const page  = parseInt(req.query.page  ?? '1',  10);
        const limit = parseInt(req.query.limit ?? '20', 10);

        const erroresPaginacion = [];
        if (!Number.isInteger(page)  || page  < 1)              erroresPaginacion.push('El parámetro page debe ser un entero mayor o igual a 1');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) erroresPaginacion.push('El parámetro limit debe ser un entero entre 1 y 100');

        if (erroresPaginacion.length > 0) {
            throw new ValidationError('Parámetros de paginación inválidos', erroresPaginacion);
        }

        const offset = (page - 1) * limit;

        // ----------------------------------------------------------------
        // 2. Obtener el perfil Tecnico del usuario autenticado
        // ----------------------------------------------------------------
        const tecnico = await obtenerTecnico(req.usuario.id_usuario);

        // ----------------------------------------------------------------
        // 3. Consultar servicios del técnico con relaciones completas
        // ----------------------------------------------------------------
        const { count, rows } = await Servicio.findAndCountAll({
            where: { id_tecnico: tecnico.id_tecnico },
            include: [
                {
                    model: Solicitud,
                    as: 'solicitud_origen',
                    attributes: ['id_solicitud', 'descripcion', 'prioridad', 'tipo_servicio', 'fecha_solicitud'],
                },
                {
                    model: Subcategoria,
                    as: 'subcategoria',
                    attributes: ['id_subcategoria', 'nombre'],
                },
                {
                    model: EstadoSolicitud,
                    as: 'estado',
                    attributes: ['id_estado', 'descripcion'],
                },
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['id_cliente'],
                    include: [
                        {
                            model: Usuario,
                            as: 'datos_usuario',
                            attributes: ['id_usuario', 'nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
                {
                    model: Transaccion,
                    as: 'transaccion',
                    attributes: ['id_transaccion', 'monto_total', 'monto_tecnico', 'comision_plataforma', 'estado_pago'],
                    required: false,
                },
            ],
            order:  [['createdAt', 'DESC']],
            limit,
            offset,
        });

        logger.info(
            `obtenerServiciosPorTecnico: técnico id=${tecnico.id_tecnico} — ${count} servicios — página ${page}`
        );

        return res.status(200).json({
            success: true,
            message: 'Servicios obtenidos exitosamente',
            total: count,
            page,
            limit,
            data: rows.map((s) => ({
                id_servicio:      s.id_servicio,
                id_solicitud:     s.id_solicitud,
                valor_total:      s.valor_total,
                fecha_servicio:   s.fecha_servicio,
                imagenes:         s.imagenes     ?? null,
                createdAt:        s.createdAt,
                solicitud_origen: s.solicitud_origen
                    ? {
                        id_solicitud:  s.solicitud_origen.id_solicitud,
                        descripcion:   s.solicitud_origen.descripcion  ?? null,
                        prioridad:     s.solicitud_origen.prioridad,
                        tipo_servicio: s.solicitud_origen.tipo_servicio,
                        fecha_solicitud: s.solicitud_origen.fecha_solicitud,
                    }
                    : null,
                subcategoria: s.subcategoria
                    ? { id_subcategoria: s.subcategoria.id_subcategoria, nombre: s.subcategoria.nombre }
                    : null,
                estado: s.estado
                    ? { id_estado: s.estado.id_estado, descripcion: s.estado.descripcion }
                    : null,
                cliente: s.cliente
                    ? {
                        id_cliente: s.cliente.id_cliente,
                        nombre:     s.cliente.datos_usuario?.nombre    ?? null,
                        apellido:   s.cliente.datos_usuario?.apellido  ?? null,
                        telefono:   s.cliente.datos_usuario?.telefono  ?? null,
                    }
                    : null,
                transaccion: s.transaccion
                    ? {
                        id_transaccion:          s.transaccion.id_transaccion,
                        monto_total:             s.transaccion.monto_total,
                        monto_tecnico:           s.transaccion.monto_tecnico,
                        comision_plataforma:     s.transaccion.comision_plataforma,
                        estado_pago:             s.transaccion.estado_pago,
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
 * /servicios/cliente/mis-servicios:
 *   get:
 *     summary: Listar servicios del cliente autenticado (HU-16)
 *     description: |
 *       Retorna el historial paginado de todos los servicios contratados por el
 *       cliente autenticado, ordenados del más reciente al más antiguo.
 *
 *       **Incluye por cada servicio:**
 *       - Solicitud de origen (trazabilidad)
 *       - Subcategoría del servicio
 *       - Estado actual
 *       - Datos del técnico con información del usuario
 *       - Transacción asociada (si existe)
 *
 *       **Paginación:**
 *       - `page` (entero >= 1, default: 1)
 *       - `limit` (entero 1–100, default: 20)
 *     tags: [Servicios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: "Número de página (comienza en 1)"
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: "Registros por página (máximo 100)"
 *         example: 20
 *     responses:
 *       200:
 *         description: Servicios del cliente obtenidos exitosamente
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
 *                   example: "Servicios obtenidos exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 5
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ServicioResumen'
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
export const obtenerServiciosPorCliente = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Parsear y validar parámetros de paginación
        // ----------------------------------------------------------------
        const page  = parseInt(req.query.page  ?? '1',  10);
        const limit = parseInt(req.query.limit ?? '20', 10);

        const erroresPaginacion = [];
        if (!Number.isInteger(page)  || page  < 1)              erroresPaginacion.push('El parámetro page debe ser un entero mayor o igual a 1');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) erroresPaginacion.push('El parámetro limit debe ser un entero entre 1 y 100');

        if (erroresPaginacion.length > 0) {
            throw new ValidationError('Parámetros de paginación inválidos', erroresPaginacion);
        }

        const offset = (page - 1) * limit;

        // ----------------------------------------------------------------
        // 2. Obtener el perfil Cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario);

        // ----------------------------------------------------------------
        // 3. Consultar servicios del cliente con relaciones completas
        // ----------------------------------------------------------------
        const { count, rows } = await Servicio.findAndCountAll({
            where: { id_cliente: cliente.id_cliente },
            include: [
                {
                    model: Solicitud,
                    as: 'solicitud_origen',
                    attributes: ['id_solicitud', 'descripcion', 'prioridad', 'tipo_servicio', 'fecha_solicitud'],
                },
                {
                    model: Subcategoria,
                    as: 'subcategoria',
                    attributes: ['id_subcategoria', 'nombre'],
                },
                {
                    model: EstadoSolicitud,
                    as: 'estado',
                    attributes: ['id_estado', 'descripcion'],
                },
                {
                    model: Tecnico,
                    as: 'tecnico',
                    attributes: ['id_tecnico', 'prom_calificacion'],
                    include: [
                        {
                            model: Usuario,
                            as: 'datos_usuario',
                            attributes: ['id_usuario', 'nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
                {
                    model: Transaccion,
                    as: 'transaccion',
                    attributes: ['id_transaccion', 'monto_total', 'estado_pago'],
                    required: false,
                },
            ],
            order:  [['createdAt', 'DESC']],
            limit,
            offset,
        });

        logger.info(
            `obtenerServiciosPorCliente: cliente id=${cliente.id_cliente} — ${count} servicios — página ${page}`
        );

        return res.status(200).json({
            success: true,
            message: 'Servicios obtenidos exitosamente',
            total: count,
            page,
            limit,
            data: rows.map((s) => ({
                id_servicio:      s.id_servicio,
                id_solicitud:     s.id_solicitud,
                valor_total:      s.valor_total,
                fecha_servicio:   s.fecha_servicio,
                imagenes:         s.imagenes     ?? null,
                createdAt:        s.createdAt,
                solicitud_origen: s.solicitud_origen
                    ? {
                        id_solicitud:    s.solicitud_origen.id_solicitud,
                        descripcion:     s.solicitud_origen.descripcion  ?? null,
                        prioridad:       s.solicitud_origen.prioridad,
                        tipo_servicio:   s.solicitud_origen.tipo_servicio,
                        fecha_solicitud: s.solicitud_origen.fecha_solicitud,
                    }
                    : null,
                subcategoria: s.subcategoria
                    ? { id_subcategoria: s.subcategoria.id_subcategoria, nombre: s.subcategoria.nombre }
                    : null,
                estado: s.estado
                    ? { id_estado: s.estado.id_estado, descripcion: s.estado.descripcion }
                    : null,
                tecnico: s.tecnico
                    ? {
                        id_tecnico:        s.tecnico.id_tecnico,
                        prom_calificacion: s.tecnico.prom_calificacion ?? null,
                        nombre:            s.tecnico.datos_usuario?.nombre   ?? null,
                        apellido:          s.tecnico.datos_usuario?.apellido ?? null,
                        telefono:          s.tecnico.datos_usuario?.telefono ?? null,
                    }
                    : null,
                transaccion: s.transaccion
                    ? {
                        id_transaccion: s.transaccion.id_transaccion,
                        monto_total:    s.transaccion.monto_total,
                        estado_pago:    s.transaccion.estado_pago,
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
 * /servicios/{id}:
 *   get:
 *     summary: Obtener detalle completo de un servicio por ID (HU-16)
 *     description: |
 *       Retorna el detalle completo de un servicio.
 *
 *       **Control de acceso:**
 *       - **Cliente**: solo puede ver sus propios servicios (`id_cliente` en el servicio).
 *       - **Técnico**: solo puede ver sus propios servicios (`id_tecnico` en el servicio).
 *       - **Administrador**: puede ver cualquier servicio.
 *
 *       **Incluye:**
 *       - Solicitud de origen con cotizaciones
 *       - Subcategoría del servicio
 *       - Estado actual
 *       - Datos del cliente con información del usuario
 *       - Datos del técnico con información del usuario
 *       - Transacción asociada con medio de pago
 *       - Medio de pago del servicio
 *     tags: [Servicios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID del servicio (`id_servicio`)
 *         example: 8
 *     responses:
 *       200:
 *         description: Servicio obtenido exitosamente
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
 *                   example: "Servicio obtenido exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_servicio:
 *                       type: integer
 *                       example: 8
 *                     id_solicitud:
 *                       type: integer
 *                       nullable: true
 *                       example: 15
 *                     valor_total:
 *                       type: number
 *                       format: float
 *                       example: 180000
 *                     fecha_servicio:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-02-12T14:00:00.000Z"
 *                     imagenes:
 *                       type: string
 *                       nullable: true
 *                       example: "https://storage.geoapi.co/servicios/8/foto1.jpg"
 *                     estado:
 *                       type: object
 *                       properties:
 *                         id_estado:
 *                           type: integer
 *                           example: 6
 *                         descripcion:
 *                           type: string
 *                           example: "COMPLETADA"
 *                     transaccion:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id_transaccion:
 *                           type: integer
 *                           example: 5
 *                         monto_total:
 *                           type: number
 *                           example: 180000
 *                         monto_tecnico:
 *                           type: number
 *                           example: 153000
 *                         comision_plataforma:
 *                           type: number
 *                           example: 27000
 *                         estado_pago:
 *                           type: string
 *                           example: "PENDIENTE"
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
export const obtenerServicioPorId = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Validar parámetro de ruta
        // ----------------------------------------------------------------
        const idServicio = parseInt(req.params.id, 10);
        if (!Number.isInteger(idServicio) || idServicio <= 0) {
            throw new ValidationError('Parámetro inválido', [
                'El parámetro id debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Obtener el servicio con todas las relaciones
        // ----------------------------------------------------------------
        const servicio = await Servicio.findByPk(idServicio, {
            include: [
                {
                    model: Solicitud,
                    as: 'solicitud_origen',
                    attributes: ['id_solicitud', 'descripcion', 'prioridad', 'tipo_servicio', 'fecha_solicitud'],
                    include: [
                        {
                            model: Cotizacion,
                            as: 'cotizaciones',
                            attributes: ['id_cotizacion', 'valor_cotizacion', 'estado', 'tiempo_estimado', 'incluye_materiales'],
                            required: false,
                        },
                    ],
                },
                {
                    model: Subcategoria,
                    as: 'subcategoria',
                    attributes: ['id_subcategoria', 'nombre'],
                },
                {
                    model: EstadoSolicitud,
                    as: 'estado',
                    attributes: ['id_estado', 'descripcion'],
                },
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['id_cliente'],
                    include: [
                        {
                            model: Usuario,
                            as: 'datos_usuario',
                            attributes: ['id_usuario', 'nombre', 'apellido', 'telefono', 'correo_electronico'],
                        },
                    ],
                },
                {
                    model: Tecnico,
                    as: 'tecnico',
                    attributes: ['id_tecnico', 'prom_calificacion'],
                    include: [
                        {
                            model: Usuario,
                            as: 'datos_usuario',
                            attributes: ['id_usuario', 'nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
                {
                    model: MedioPago,
                    as: 'medio_pago',
                    attributes: ['id_medioPago', 'descripcion'],
                    required: false,
                },
                {
                    model: Transaccion,
                    as: 'transaccion',
                    attributes: [
                        'id_transaccion',
                        'monto_total',
                        'monto_tecnico',
                        'comision_plataforma',
                        'metodo_cobro',
                        'estado_pago',
                        'fecha_pago',
                        'comprobante_url',
                    ],
                    required: false,
                    include: [
                        {
                            model: MedioPago,
                            as: 'medio_pago',
                            attributes: ['id_medioPago', 'descripcion'],
                        },
                    ],
                },
            ],
        });

        if (!servicio) {
            throw new NotFoundError(`No se encontró el servicio con ID ${idServicio}`);
        }

        // ----------------------------------------------------------------
        // 3. Control de acceso por rol
        //    - Cliente: solo sus servicios
        //    - Tecnico: solo sus servicios
        //    - Administrador: acceso total
        // ----------------------------------------------------------------
        const rol = req.usuario.rol;

        if (rol === 'CLIENTE') {
            // Verificar que el cliente autenticado sea el dueño del servicio
            const cliente = await obtenerCliente(req.usuario.id_usuario);
            if (servicio.id_cliente !== cliente.id_cliente) {
                throw new ForbiddenError('No tienes permiso para ver este servicio');
            }
        } else if (rol === 'TECNICO') {
            // Verificar que el técnico autenticado sea el técnico del servicio
            const tecnico = await obtenerTecnico(req.usuario.id_usuario);
            if (servicio.id_tecnico !== tecnico.id_tecnico) {
                throw new ForbiddenError('No tienes permiso para ver este servicio');
            }
        }
        // Administrador pasa sin restricción

        logger.info(
            `obtenerServicioPorId: Servicio id=${idServicio} consultado por id_usuario=${req.usuario.id_usuario} (rol: ${rol})`
        );

        return res.status(200).json({
            success: true,
            message: 'Servicio obtenido exitosamente',
            data: {
                id_servicio:    servicio.id_servicio,
                id_solicitud:   servicio.id_solicitud  ?? null,
                valor_total:    servicio.valor_total,
                fecha_servicio: servicio.fecha_servicio,
                imagenes:       servicio.imagenes      ?? null,
                createdAt:      servicio.createdAt,
                updatedAt:      servicio.updatedAt,
                solicitud_origen: servicio.solicitud_origen
                    ? {
                        id_solicitud:    servicio.solicitud_origen.id_solicitud,
                        descripcion:     servicio.solicitud_origen.descripcion  ?? null,
                        prioridad:       servicio.solicitud_origen.prioridad,
                        tipo_servicio:   servicio.solicitud_origen.tipo_servicio,
                        fecha_solicitud: servicio.solicitud_origen.fecha_solicitud,
                        cotizaciones:    (servicio.solicitud_origen.cotizaciones ?? []).map((c) => ({
                            id_cotizacion:       c.id_cotizacion,
                            valor_cotizacion:    c.valor_cotizacion,
                            estado:              c.estado,
                            tiempo_estimado:     c.tiempo_estimado     ?? null,
                            incluye_materiales:  c.incluye_materiales,
                        })),
                    }
                    : null,
                subcategoria: servicio.subcategoria
                    ? { id_subcategoria: servicio.subcategoria.id_subcategoria, nombre: servicio.subcategoria.nombre }
                    : null,
                estado: servicio.estado
                    ? { id_estado: servicio.estado.id_estado, descripcion: servicio.estado.descripcion }
                    : null,
                medio_pago: servicio.medio_pago
                    ? { id_medioPago: servicio.medio_pago.id_medioPago, descripcion: servicio.medio_pago.descripcion }
                    : null,
                cliente: servicio.cliente
                    ? {
                        id_cliente:         servicio.cliente.id_cliente,
                        id_usuario:         servicio.cliente.datos_usuario?.id_usuario         ?? null,
                        nombre:             servicio.cliente.datos_usuario?.nombre             ?? null,
                        apellido:           servicio.cliente.datos_usuario?.apellido           ?? null,
                        telefono:           servicio.cliente.datos_usuario?.telefono           ?? null,
                        correo_electronico: servicio.cliente.datos_usuario?.correo_electronico ?? null,
                    }
                    : null,
                tecnico: servicio.tecnico
                    ? {
                        id_tecnico:        servicio.tecnico.id_tecnico,
                        prom_calificacion: servicio.tecnico.prom_calificacion ?? null,
                        id_usuario:        servicio.tecnico.datos_usuario?.id_usuario  ?? null,
                        nombre:            servicio.tecnico.datos_usuario?.nombre      ?? null,
                        apellido:          servicio.tecnico.datos_usuario?.apellido    ?? null,
                        telefono:          servicio.tecnico.datos_usuario?.telefono    ?? null,
                    }
                    : null,
                transaccion: servicio.transaccion
                    ? {
                        id_transaccion:          servicio.transaccion.id_transaccion,
                        monto_total:             servicio.transaccion.monto_total,
                        monto_tecnico:           servicio.transaccion.monto_tecnico,
                        comision_plataforma:     servicio.transaccion.comision_plataforma,
                        metodo_cobro:            servicio.transaccion.metodo_cobro,
                        estado_pago:             servicio.transaccion.estado_pago,
                        fecha_pago:              servicio.transaccion.fecha_pago       ?? null,
                        comprobante_url:         servicio.transaccion.comprobante_url  ?? null,
                        medio_pago:              servicio.transaccion.medio_pago
                            ? { id_medioPago: servicio.transaccion.medio_pago.id_medioPago, descripcion: servicio.transaccion.medio_pago.descripcion }
                            : null,
                    }
                    : null,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};
