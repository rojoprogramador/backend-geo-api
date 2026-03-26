import { Op } from 'sequelize';
import {
    sequelize,
    Cotizacion,
    Solicitud,
    Tecnico,
    TecnicoSolicitudQueue,
    EstadoSolicitud,
    Usuario,
    Cliente,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { obtenerCliente, obtenerTecnico } from '../utils/profileHelpers.js';
import { setCooldown } from '../utils/cooldownManager.js';

// ---------------------------------------------------------------------------
// Constantes de estados de solicitud (sincronizadas con seeders)
// ---------------------------------------------------------------------------
const ESTADO_PENDIENTE          = 1; // Sin técnicos disponibles encontrados
const ESTADO_BUSCANDO_TECNICOS  = 2; // Técnicos notificados, esperando cotización
const ESTADO_COTIZANDO          = 3; // Al menos una cotización recibida
const ESTADO_ASIGNADA           = 4; // Cliente aceptó una cotización, técnico asignado

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /cotizaciones:
 *   post:
 *     summary: Enviar cotización para una solicitud (HU-11)
 *     description: |
 *       Permite a un técnico autenticado enviar una cotización para una solicitud
 *       de servicio que tiene asignada en su cola (TecnicoSolicitudQueue).
 *
 *       **Proceso interno:**
 *       1. Valida todos los campos de entrada.
 *       2. Verifica que la solicitud exista y esté en estado BUSCANDO_TECNICOS (2) o COTIZANDO (3).
 *       3. Verifica que el técnico tenga una entrada en TecnicoSolicitudQueue para esta
 *          solicitud con estado_respuesta IN ('NOTIFICADO', 'VISTO').
 *       4. Verifica que el técnico no haya enviado ya una cotización para esta solicitud.
 *       5. Crea la cotización dentro de una transacción:
 *          - Actualiza la entrada de la cola a estado_respuesta='COTIZADO'.
 *          - Si la solicitud estaba en BUSCANDO_TECNICOS (2), la actualiza a COTIZANDO (3).
 *       6. Retorna la cotización creada.
 *
 *       **Reglas de validación:**
 *       - `id_solicitud`: entero positivo, requerido.
 *       - `valor_cotizacion`: número positivo mayor a 0, requerido.
 *       - `descripcion`: texto entre 10 y 2000 caracteres (opcional).
 *       - `tiempo_estimado`: texto entre 1 y 100 caracteres (opcional).
 *       - `dias_garantia`: entero entre 0 y 365 (opcional, default 0).
 *       - `incluye_materiales`: booleano (opcional, default false).
 *     tags: [Cotizaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearCotizacionRequest'
 *           examples:
 *             plomeria_cali:
 *               summary: Cotización de plomería con materiales incluidos
 *               value:
 *                 id_solicitud: 15
 *                 valor_cotizacion: 180000
 *                 descripcion: "Reparación de tubería rota, incluye sellante epoxi y codo de 1/2 pulgada."
 *                 tiempo_estimado: "2-3 horas"
 *                 incluye_materiales: true
 *                 dias_garantia: 30
 *             electricidad_basica:
 *               summary: Cotización eléctrica sin materiales
 *               value:
 *                 id_solicitud: 16
 *                 valor_cotizacion: 95000
 *                 descripcion: "Revisión y reparación de cortocircuito en cocina, mano de obra solamente."
 *                 tiempo_estimado: "1-2 horas"
 *                 incluye_materiales: false
 *                 dias_garantia: 15
 *             cerrajeria_urgente:
 *               summary: Cotización de cerrajería urgente
 *               value:
 *                 id_solicitud: 17
 *                 valor_cotizacion: 120000
 *                 descripcion: "Cambio de chapa de seguridad, instalación inmediata."
 *                 tiempo_estimado: "1 hora"
 *                 incluye_materiales: true
 *                 dias_garantia: 90
 *     responses:
 *       201:
 *         description: Cotización enviada exitosamente
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
 *                   example: "Cotización enviada exitosamente. El cliente podrá revisarla pronto."
 *                 data:
 *                   $ref: '#/components/schemas/CotizacionDetalle'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: El técnico ya tiene una cotización para esta solicitud o la solicitud no admite nuevas cotizaciones
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               ya_cotizo:
 *                 summary: El técnico ya envió una cotización
 *                 value:
 *                   success: false
 *                   message: "Ya enviaste una cotización para esta solicitud"
 *               estado_invalido:
 *                 summary: La solicitud no acepta nuevas cotizaciones
 *                 value:
 *                   success: false
 *                   message: "La solicitud no está en un estado que admita nuevas cotizaciones"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearCotizacion = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body
        // ----------------------------------------------------------------
        const {
            id_solicitud,
            valor_cotizacion,
            descripcion,
            tiempo_estimado,
            incluye_materiales = false,
            dias_garantia = 0,
        } = req.body;

        // ----------------------------------------------------------------
        // 2. Validaciones de presencia (fase 1)
        // ----------------------------------------------------------------
        const camposFaltantes = [];

        if (id_solicitud === undefined || id_solicitud === null)
            camposFaltantes.push('El campo id_solicitud es requerido');
        if (valor_cotizacion === undefined || valor_cotizacion === null)
            camposFaltantes.push('El campo valor_cotizacion es requerido');

        if (camposFaltantes.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', camposFaltantes);
        }

        // ----------------------------------------------------------------
        // 3. Validaciones de formato (fase 2)
        // ----------------------------------------------------------------
        const erroresFormato = [];

        if (!Number.isInteger(Number(id_solicitud)) || Number(id_solicitud) < 1)
            erroresFormato.push('El id_solicitud debe ser un entero positivo');

        const valorNum = Number.parseFloat(valor_cotizacion);
        if (Number.isNaN(valorNum) || valorNum <= 0)
            erroresFormato.push('El valor_cotizacion debe ser un número mayor a 0');

        if (descripcion !== undefined && descripcion !== null) {
            const descTrimmed = String(descripcion).trim();
            if (descTrimmed.length < 10 || descTrimmed.length > 2000)
                erroresFormato.push('La descripcion debe tener entre 10 y 2000 caracteres');
        }

        if (tiempo_estimado !== undefined && tiempo_estimado !== null) {
            const tiempoTrimmed = String(tiempo_estimado).trim();
            if (tiempoTrimmed.length < 1 || tiempoTrimmed.length > 100)
                erroresFormato.push('El tiempo_estimado debe tener entre 1 y 100 caracteres');
        }

        const diasNum = Number.parseInt(dias_garantia);
        if (Number.isNaN(diasNum) || diasNum < 0 || diasNum > 365)
            erroresFormato.push('El dias_garantia debe ser un entero entre 0 y 365');

        if (erroresFormato.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', erroresFormato);
        }

        // ----------------------------------------------------------------
        // 4. Obtener el perfil de Tecnico del usuario autenticado
        // ----------------------------------------------------------------
        const tecnico = await obtenerTecnico(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 5. Verificar que la solicitud existe y está en un estado válido
        // ----------------------------------------------------------------
        const solicitud = await Solicitud.findByPk(Number(id_solicitud), {
            transaction: t,
        });

        if (!solicitud) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la solicitud con id ${id_solicitud}`);
        }

        // Solo se aceptan cotizaciones para solicitudes en BUSCANDO_TECNICOS o COTIZANDO
        if (
            solicitud.id_estado !== ESTADO_BUSCANDO_TECNICOS &&
            solicitud.id_estado !== ESTADO_COTIZANDO
        ) {
            await t.rollback();
            throw new ConflictError(
                'La solicitud no está en un estado que admita nuevas cotizaciones. ' +
                'Solo se permiten cotizaciones cuando el estado es BUSCANDO_TECNICOS o COTIZANDO'
            );
        }

        // ----------------------------------------------------------------
        // 6. Verificar que el técnico tiene entrada en la cola con estado
        //    NOTIFICADO o VISTO (fue notificado pero aún no cotizó)
        // ----------------------------------------------------------------
        const entradaCola = await TecnicoSolicitudQueue.findOne({
            where: {
                id_solicitud: Number(id_solicitud),
                id_tecnico:   tecnico.id_tecnico,
                estado_respuesta: { [Op.in]: ['NOTIFICADO', 'VISTO'] },
            },
            transaction: t,
        });

        if (!entradaCola) {
            await t.rollback();
            throw new ForbiddenError(
                'No tienes autorización para cotizar esta solicitud. ' +
                'Debes estar notificado para la solicitud y no haber cotizado previamente'
            );
        }

        // ----------------------------------------------------------------
        // 7. Verificar que el técnico no haya enviado ya una cotización
        //    (doble verificación: la cola ya lo filtra, pero blindamos la BD)
        // ----------------------------------------------------------------
        const cotizacionExistente = await Cotizacion.findOne({
            where: {
                id_solicitud: Number(id_solicitud),
                id_tecnico:   tecnico.id_tecnico,
            },
            transaction: t,
        });

        if (cotizacionExistente) {
            await t.rollback();
            throw new ConflictError('Ya enviaste una cotización para esta solicitud');
        }

        // ----------------------------------------------------------------
        // 8. Crear la cotización dentro de la transacción
        // ----------------------------------------------------------------
        const nuevaCotizacion = await Cotizacion.create(
            {
                id_solicitud:     Number(id_solicitud),
                id_tecnico:       tecnico.id_tecnico,
                valor_cotizacion: valorNum,
                descripcion:      descripcion ? String(descripcion).trim() : null,
                tiempo_estimado:  tiempo_estimado ? String(tiempo_estimado).trim() : null,
                incluye_materiales: Boolean(incluye_materiales),
                dias_garantia:    diasNum,
                estado:           'PENDIENTE',
            },
            { transaction: t }
        );

        logger.info(
            `crearCotizacion: Cotización ${nuevaCotizacion.id_cotizacion} creada ` +
            `por técnico ${tecnico.id_tecnico} para solicitud ${id_solicitud} — ` +
            `valor: $${valorNum.toLocaleString('es-CO')} COP`
        );

        // ----------------------------------------------------------------
        // 9. Actualizar la entrada de la cola a COTIZADO
        // ----------------------------------------------------------------
        await TecnicoSolicitudQueue.update(
            {
                estado_respuesta: 'COTIZADO',
                fecha_respuesta:  new Date(),
            },
            {
                where: {
                    id_cola: entradaCola.id_cola,
                },
                transaction: t,
            }
        );

        // ----------------------------------------------------------------
        // 10. Si la solicitud estaba en BUSCANDO_TECNICOS (2), pasarla a
        //     COTIZANDO (3) porque ya existe al menos una cotización
        // ----------------------------------------------------------------
        if (solicitud.id_estado === ESTADO_BUSCANDO_TECNICOS) {
            await Solicitud.update(
                { id_estado: ESTADO_COTIZANDO },
                {
                    where: { id_solicitud: Number(id_solicitud) },
                    transaction: t,
                }
            );

            logger.info(
                `crearCotizacion: Solicitud ${id_solicitud} actualizada de ` +
                `BUSCANDO_TECNICOS (2) a COTIZANDO (3)`
            );
        }

        await t.commit();

        // ── Cooldown: evitar saturación en solicitudes inmediatas ──
        if (solicitud.tipo_servicio === 'INMEDIATO') {
            setCooldown(tecnico.id_tecnico);
            logger.info(`crearCotizacion: cooldown 90s activado para técnico ${tecnico.id_tecnico}`);
        }

        // ── WebSocket: notificar al cliente en tiempo real (best-effort) ──
        try {
            const { emitNuevaCotizacion } = await import('../sockets/services/socketEmitter.js');
            const { addCotizacion: addCotizacionBatch } = await import('../sockets/services/cotizacionBatcher.js');

            const clienteOwner = await Cliente.findByPk(solicitud.id_cliente, { attributes: ['id_usuario'] });
            const idClienteUsuario = clienteOwner?.id_usuario;

            if (idClienteUsuario) {
                emitNuevaCotizacion({
                    id_solicitud: Number(id_solicitud),
                    id_cliente_usuario: idClienteUsuario,
                    cotizacionData: {
                        id_cotizacion:       nuevaCotizacion.id_cotizacion,
                        id_solicitud:        Number(id_solicitud),
                        id_tecnico:          tecnico.id_tecnico,
                        valor_cotizacion:    valorNum,
                        descripcion_trabajo: descripcion ? String(descripcion).trim() : null,
                        tiempo_estimado:     tiempo_estimado ? String(tiempo_estimado).trim() : null,
                        estado:              'PENDIENTE',
                    },
                });
                addCotizacionBatch(Number(id_solicitud), idClienteUsuario);
            }
        } catch (wsErr) {
            logger.warn(`crearCotizacion: WebSocket emit falló (no-crítico): ${wsErr.message}`);
        }

        // Cargar la cotización con el técnico para la respuesta
        const cotizacionConTecnico = await Cotizacion.findByPk(nuevaCotizacion.id_cotizacion, {
            include: [
                {
                    model: Tecnico,
                    as:    'tecnico',
                    attributes: ['id_tecnico', 'prom_calificacion'],
                    include: [
                        {
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
            ],
        });

        return res.status(201).json({
            success: true,
            message: 'Cotización enviada exitosamente. El cliente podrá revisarla pronto.',
            data: cotizacionConTecnico,
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
 * /cotizaciones/solicitud/{id_solicitud}:
 *   get:
 *     summary: Obtener y comparar cotizaciones de una solicitud (HU-12)
 *     description: |
 *       Permite al cliente autenticado ver todas las cotizaciones recibidas para
 *       una de sus solicitudes, ordenadas de menor a mayor precio para facilitar
 *       la comparación.
 *
 *       **Control de acceso:**
 *       - Solo el cliente propietario de la solicitud puede ver sus cotizaciones.
 *
 *       **Datos incluidos por cotización:**
 *       - Datos del técnico: nombre, apellido, teléfono, promedio de calificación.
 *       - Valor, descripción, tiempo estimado, días de garantía, incluye materiales.
 *       - Estado de cada cotización (PENDIENTE / ACEPTADA / RECHAZADA).
 *
 *       Las cotizaciones se ordenan por `valor_cotizacion` ASC (menor precio primero).
 *     tags: [Cotizaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id_solicitud
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID de la solicitud cuyos cotizaciones se desean consultar
 *         example: 15
 *     responses:
 *       200:
 *         description: Cotizaciones obtenidas exitosamente
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
 *                   example: "3 cotización(es) encontrada(s) para la solicitud 15"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_solicitud:
 *                       type: integer
 *                       example: 15
 *                     total_cotizaciones:
 *                       type: integer
 *                       example: 3
 *                     cotizaciones:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CotizacionConTecnico'
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
export const obtenerCotizacionesSolicitud = async (req, res) => {
    try {
        const idSolicitud = Number.parseInt(req.params.id_solicitud);

        if (!idSolicitud || idSolicitud < 1) {
            throw new ValidationError('Error de validación', [
                'El id_solicitud debe ser un entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 1. Obtener el id_cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario);

        // ----------------------------------------------------------------
        // 2. Verificar que la solicitud existe y pertenece a este cliente
        // ----------------------------------------------------------------
        const solicitud = await Solicitud.findByPk(idSolicitud, {
            attributes: ['id_solicitud', 'id_cliente', 'id_estado', 'descripcion', 'tipo_servicio', 'prioridad'],
        });

        if (!solicitud) {
            throw new NotFoundError(`No se encontró la solicitud con id ${idSolicitud}`);
        }

        if (solicitud.id_cliente !== cliente.id_cliente) {
            throw new ForbiddenError('No tienes permiso para ver las cotizaciones de esta solicitud');
        }

        // ----------------------------------------------------------------
        // 3. Obtener cotizaciones ordenadas por valor ASC (menor precio primero)
        //    Incluye datos del técnico para comparación
        // ----------------------------------------------------------------
        const cotizaciones = await Cotizacion.findAll({
            where: { id_solicitud: idSolicitud },
            include: [
                {
                    model: Tecnico,
                    as:    'tecnico',
                    attributes: ['id_tecnico', 'url_foto', 'prom_calificacion', 'radio_cobertura_km'],
                    include: [
                        {
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
            ],
            order: [['valor_cotizacion', 'ASC']],
        });

        logger.info(
            `obtenerCotizacionesSolicitud: Cliente ${cliente.id_cliente} consultó ` +
            `${cotizaciones.length} cotización(es) para solicitud ${idSolicitud}`
        );

        return res.status(200).json({
            success: true,
            message: `${cotizaciones.length} cotización(es) encontrada(s) para la solicitud ${idSolicitud}`,
            data: {
                id_solicitud:       idSolicitud,
                total_cotizaciones: cotizaciones.length,
                cotizaciones,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /cotizaciones/{id}/aceptar:
 *   put:
 *     summary: Aceptar una cotización (HU-12)
 *     description: |
 *       Permite al cliente autenticado aceptar una cotización específica.
 *
 *       **Proceso interno (transacción atómica):**
 *       1. Verifica que la cotización exista y esté en estado PENDIENTE.
 *       2. Verifica que la solicitud asociada pertenezca al cliente autenticado.
 *       3. Verifica que la solicitud esté en estado COTIZANDO (3).
 *       4. Dentro de la transacción:
 *          - Actualiza la cotización seleccionada a estado='ACEPTADA'.
 *          - Actualiza TODAS las demás cotizaciones de la misma solicitud a estado='RECHAZADA'.
 *          - Asigna el técnico a la solicitud (id_tecnico = cotizacion.id_tecnico).
 *          - Actualiza la solicitud a id_estado=4 (ASIGNADA).
 *       5. Retorna la cotización aceptada con los datos del técnico asignado.
 *
 *       **Efectos colaterales:**
 *       - El técnico queda oficialmente asignado a la solicitud.
 *       - Las demás cotizaciones de otros técnicos quedan marcadas como RECHAZADA.
 *     tags: [Cotizaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID de la cotización a aceptar
 *         example: 7
 *     responses:
 *       200:
 *         description: Cotización aceptada exitosamente, técnico asignado
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
 *                   example: "Cotización aceptada. El técnico Andrés Martínez ha sido asignado a tu solicitud."
 *                 data:
 *                   $ref: '#/components/schemas/CotizacionAceptadaResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: La cotización o solicitud no está en el estado correcto para aceptar
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               cotizacion_no_pendiente:
 *                 summary: La cotización ya fue procesada
 *                 value:
 *                   success: false
 *                   message: "Solo se puede aceptar una cotización en estado PENDIENTE"
 *               solicitud_no_cotizando:
 *                 summary: La solicitud no está en estado COTIZANDO
 *                 value:
 *                   success: false
 *                   message: "La solicitud no está en estado COTIZANDO. No se puede aceptar la cotización"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const aceptarCotizacion = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const idCotizacion = Number.parseInt(req.params.id);

        if (!idCotizacion || idCotizacion < 1) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El id de la cotización debe ser un entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 1. Obtener el id_cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 2. Buscar la cotización con su solicitud para verificar propiedad
        // ----------------------------------------------------------------
        const cotizacion = await Cotizacion.findByPk(idCotizacion, {
            include: [
                {
                    model: Solicitud,
                    as:    'solicitud',
                    attributes: ['id_solicitud', 'id_cliente', 'id_estado'],
                },
            ],
            transaction: t,
        });

        if (!cotizacion) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la cotización con id ${idCotizacion}`);
        }

        // ----------------------------------------------------------------
        // 3. Verificar que la cotización esté en estado PENDIENTE
        // ----------------------------------------------------------------
        if (cotizacion.estado !== 'PENDIENTE') {
            await t.rollback();
            throw new ConflictError('Solo se puede aceptar una cotización en estado PENDIENTE');
        }

        // ----------------------------------------------------------------
        // 4. Verificar que la solicitud pertenece al cliente autenticado
        // ----------------------------------------------------------------
        if (cotizacion.solicitud.id_cliente !== cliente.id_cliente) {
            await t.rollback();
            throw new ForbiddenError('No tienes permiso para aceptar esta cotización');
        }

        // ----------------------------------------------------------------
        // 5. Verificar que la solicitud esté en estado COTIZANDO (3)
        // ----------------------------------------------------------------
        if (cotizacion.solicitud.id_estado !== ESTADO_COTIZANDO) {
            await t.rollback();
            throw new ConflictError(
                'La solicitud no está en estado COTIZANDO. No se puede aceptar la cotización'
            );
        }

        const idSolicitud = cotizacion.id_solicitud;
        const idTecnico   = cotizacion.id_tecnico;

        // ----------------------------------------------------------------
        // 6. Actualizar la cotización seleccionada a ACEPTADA
        // ----------------------------------------------------------------
        await Cotizacion.update(
            { estado: 'ACEPTADA' },
            {
                where:       { id_cotizacion: idCotizacion },
                transaction: t,
            }
        );

        // ----------------------------------------------------------------
        // 7. Rechazar TODAS las demás cotizaciones PENDIENTES de la misma solicitud
        // ----------------------------------------------------------------
        await Cotizacion.update(
            { estado: 'RECHAZADA' },
            {
                where: {
                    id_solicitud:  idSolicitud,
                    id_cotizacion: { [Op.ne]: idCotizacion },
                    estado:        'PENDIENTE',
                },
                transaction: t,
            }
        );

        // ----------------------------------------------------------------
        // 8. Asignar el técnico y actualizar el estado de la solicitud a ASIGNADA (4)
        // ----------------------------------------------------------------
        await Solicitud.update(
            {
                id_tecnico: idTecnico,
                id_estado:  ESTADO_ASIGNADA,
            },
            {
                where:       { id_solicitud: idSolicitud },
                transaction: t,
            }
        );

        logger.info(
            `aceptarCotizacion: Cliente ${cliente.id_cliente} aceptó cotización ` +
            `${idCotizacion} — técnico ${idTecnico} asignado a solicitud ${idSolicitud}`
        );

        await t.commit();

        // ── WebSocket: notificar técnico ganador y rechazados (best-effort) ──
        try {
            const { emitCotizacionAceptada } = await import('../sockets/services/socketEmitter.js');
            const { cancelBatch } = await import('../sockets/services/cotizacionBatcher.js');

            const tecnicoGanador = await Tecnico.findByPk(idTecnico, { attributes: ['id_usuario'] });
            const cotizacionesRechazadas = await Cotizacion.findAll({
                where: { id_solicitud: idSolicitud, estado: 'RECHAZADA' },
                attributes: ['id_tecnico'],
            });
            const idsRechazados = await Promise.all(
                cotizacionesRechazadas.map(async (c) => {
                    const tec = await Tecnico.findByPk(c.id_tecnico, { attributes: ['id_usuario'] });
                    return tec?.id_usuario;
                })
            );

            emitCotizacionAceptada({
                id_solicitud: idSolicitud,
                id_tecnico_ganador_usuario: tecnicoGanador?.id_usuario,
                tecnicosRechazados: idsRechazados.filter(Boolean),
                cotizacionData: {
                    id_cotizacion:       idCotizacion,
                    id_solicitud:        idSolicitud,
                    id_tecnico:          idTecnico,
                    valor_cotizacion:    Number.parseFloat(cotizacion.valor_cotizacion),
                    descripcion_trabajo: cotizacion.descripcion || null,
                    tiempo_estimado:     cotizacion.tiempo_estimado || null,
                    estado:              'ACEPTADA',
                },
            });
            cancelBatch(idSolicitud);
        } catch (wsErr) {
            logger.warn(`aceptarCotizacion: WebSocket emit falló (no-crítico): ${wsErr.message}`);
        }

        // Cargar la cotización actualizada con datos del técnico para la respuesta
        const cotizacionAceptada = await Cotizacion.findByPk(idCotizacion, {
            include: [
                {
                    model: Tecnico,
                    as:    'tecnico',
                    attributes: ['id_tecnico', 'prom_calificacion'],
                    include: [
                        {
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
                {
                    model: Solicitud,
                    as:    'solicitud',
                    attributes: ['id_solicitud', 'id_estado'],
                    include: [
                        {
                            model: EstadoSolicitud,
                            as:    'estado',
                            attributes: ['id_estado', 'descripcion'],
                        },
                    ],
                },
            ],
        });

        const nombreTecnico =
            cotizacionAceptada.tecnico?.datos_usuario?.nombre ?? 'el técnico';

        return res.status(200).json({
            success: true,
            message: `Cotización aceptada. ${nombreTecnico} ha sido asignado a tu solicitud.`,
            data: cotizacionAceptada,
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
 * /cotizaciones/{id}/rechazar:
 *   put:
 *     summary: Rechazar una cotización individual
 *     description: |
 *       Permite al cliente autenticado rechazar una cotización específica que
 *       aún está en estado PENDIENTE, sin cerrar la solicitud.
 *
 *       **Proceso interno:**
 *       1. Verifica que la cotización exista y esté en estado PENDIENTE.
 *       2. Verifica que la solicitud asociada pertenezca al cliente autenticado.
 *       3. Actualiza la cotización a estado='RECHAZADA'.
 *       4. Si tras el rechazo TODAS las cotizaciones de la solicitud están en
 *          estado RECHAZADA y la solicitud está en COTIZANDO (3), la revierte a
 *          BUSCANDO_TECNICOS (2) para que nuevos técnicos puedan cotizar.
 *       5. Retorna confirmación del rechazo.
 *
 *       **Cuándo usar este endpoint:**
 *       - Cuando el cliente quiere rechazar una cotización específica pero
 *         mantener las otras activas para seguir comparando.
 *       - Para rechazar la única cotización disponible y reabrir la búsqueda.
 *     tags: [Cotizaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID de la cotización a rechazar
 *         example: 8
 *     responses:
 *       200:
 *         description: Cotización rechazada exitosamente
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
 *                   example: "Cotización rechazada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_cotizacion:
 *                       type: integer
 *                       example: 8
 *                     estado:
 *                       type: string
 *                       example: "RECHAZADA"
 *                     solicitud_revertida:
 *                       type: boolean
 *                       example: false
 *                       description: "true si la solicitud fue revertida a BUSCANDO_TECNICOS por no quedar cotizaciones pendientes"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: La cotización no está en estado PENDIENTE
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Solo se puede rechazar una cotización en estado PENDIENTE"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const rechazarCotizacion = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const idCotizacion = Number.parseInt(req.params.id);

        if (!idCotizacion || idCotizacion < 1) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El id de la cotización debe ser un entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 1. Obtener el id_cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 2. Buscar la cotización con su solicitud
        // ----------------------------------------------------------------
        const cotizacion = await Cotizacion.findByPk(idCotizacion, {
            include: [
                {
                    model: Solicitud,
                    as:    'solicitud',
                    attributes: ['id_solicitud', 'id_cliente', 'id_estado'],
                },
            ],
            transaction: t,
        });

        if (!cotizacion) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la cotización con id ${idCotizacion}`);
        }

        // ----------------------------------------------------------------
        // 3. Verificar que la cotización esté en estado PENDIENTE
        // ----------------------------------------------------------------
        if (cotizacion.estado !== 'PENDIENTE') {
            await t.rollback();
            throw new ConflictError('Solo se puede rechazar una cotización en estado PENDIENTE');
        }

        // ----------------------------------------------------------------
        // 4. Verificar que la solicitud pertenece al cliente autenticado
        // ----------------------------------------------------------------
        if (cotizacion.solicitud.id_cliente !== cliente.id_cliente) {
            await t.rollback();
            throw new ForbiddenError('No tienes permiso para rechazar esta cotización');
        }

        const idSolicitud = cotizacion.id_solicitud;

        // ----------------------------------------------------------------
        // 5. Actualizar la cotización a RECHAZADA
        // ----------------------------------------------------------------
        await Cotizacion.update(
            { estado: 'RECHAZADA' },
            {
                where:       { id_cotizacion: idCotizacion },
                transaction: t,
            }
        );

        logger.info(
            `rechazarCotizacion: Cliente ${cliente.id_cliente} rechazó cotización ` +
            `${idCotizacion} para solicitud ${idSolicitud}`
        );

        // ----------------------------------------------------------------
        // 6. Verificar si quedaron cotizaciones PENDIENTES para la solicitud.
        //    Si NO quedan pendientes y la solicitud está en COTIZANDO (3),
        //    revertirla a BUSCANDO_TECNICOS (2) para reabrir la búsqueda.
        // ----------------------------------------------------------------
        let solicitudRevertida = false;

        if (cotizacion.solicitud.id_estado === ESTADO_COTIZANDO) {
            const cotizacionesPendientes = await Cotizacion.count({
                where: {
                    id_solicitud: idSolicitud,
                    estado:       'PENDIENTE',
                },
                transaction: t,
            });

            if (cotizacionesPendientes === 0) {
                await Solicitud.update(
                    { id_estado: ESTADO_BUSCANDO_TECNICOS },
                    {
                        where:       { id_solicitud: idSolicitud },
                        transaction: t,
                    }
                );
                solicitudRevertida = true;

                logger.info(
                    `rechazarCotizacion: Solicitud ${idSolicitud} revertida a ` +
                    `BUSCANDO_TECNICOS (2) — sin cotizaciones pendientes`
                );
            }
        }

        await t.commit();

        // ── WebSocket: notificar al técnico que su cotización fue rechazada (best-effort) ──
        try {
            const { emitCotizacionRechazada } = await import('../sockets/services/socketEmitter.js');
            const tecnicoRechazado = await Tecnico.findByPk(cotizacion.id_tecnico, { attributes: ['id_usuario'] });
            if (tecnicoRechazado?.id_usuario) {
                emitCotizacionRechazada({
                    id_solicitud:       idSolicitud,
                    id_cotizacion:      idCotizacion,
                    id_tecnico_usuario: tecnicoRechazado.id_usuario,
                });
            }
        } catch (wsErr) {
            logger.warn(`rechazarCotizacion: WebSocket emit falló (no-crítico): ${wsErr.message}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Cotización rechazada exitosamente',
            data: {
                id_cotizacion:       idCotizacion,
                estado:              'RECHAZADA',
                solicitud_revertida: solicitudRevertida,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};
