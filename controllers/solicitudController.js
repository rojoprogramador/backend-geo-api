import { QueryTypes, Op } from 'sequelize';
import {
    sequelize,
    Cliente,
    Tecnico,
    Solicitud,
    EstadoSolicitud,
    Subcategoria,
    Categoria,
    TecnicoSolicitudQueue,
    Cita,
    Usuario,
    MotivoCancelacion,
    Cotizacion,
    Servicio,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { obtenerCliente, obtenerTecnico } from '../utils/profileHelpers.js';
import { filtrarSinCooldown } from '../utils/cooldownManager.js';
import { getInmediataCutoffDate } from '../services/immediateRequestExpiryService.js';

// ---------------------------------------------------------------------------
// Constantes de estados de solicitud (sincronizadas con seeders)
// ---------------------------------------------------------------------------
const ESTADO_PENDIENTE          = 1; // Sin técnicos disponibles encontrados
const ESTADO_BUSCANDO_TECNICOS  = 2; // Técnicos notificados, esperando cotización
const ESTADO_COMPLETADA         = 6; // Servicio completado (no cancelable)
const ESTADO_CANCELADA          = 7; // Solicitud/cita cancelada

// ---------------------------------------------------------------------------
// Helper: calcula un priority_score entero basado en distancia y calificación.
// Menor distancia y mayor calificación = mayor score (candidato preferido).
// Escala: 0-100 puntos de calificación + penalización por kilómetro de distancia.
// ---------------------------------------------------------------------------
const calcularPriorityScore = (distanciaMetros, promCalificacion) => {
    const calificacionNorm  = (promCalificacion / 5) * 100;            // 0-100
    const penalizacionDist  = (distanciaMetros / 1000) * 2;            // 2 pts por km
    return Math.round(Math.max(0, calificacionNorm - penalizacionDist));
};

// ---------------------------------------------------------------------------
// Helper: notifica técnicos via WebSocket (best-effort, no lanza excepción)
// ---------------------------------------------------------------------------
const notificarTecnicosWS = async ({ nuevaSolicitud, cliente, id_subcategoria, subcategoria, descTrimmed, tipo_solicitud, prioridad, tecnicosEncontrados, extra = {} }) => {
    if (tecnicosEncontrados.length === 0) return;
    try {
        const { emitNuevaSolicitud } = await import('../sockets/services/socketEmitter.js');
        emitNuevaSolicitud({
            id_solicitud: nuevaSolicitud.id_solicitud,
            solicitudData: {
                id_solicitud:       nuevaSolicitud.id_solicitud,
                id_cliente:         cliente.id_cliente,
                id_subcategoria:    Number(id_subcategoria),
                subcategoria:       subcategoria.nombre,
                descripcion:        descTrimmed,
                tipo_solicitud,
                prioridad,
                direccion_servicio: null,
                ...extra,
            },
            tecnicos: tecnicosEncontrados.map((tec) => ({
                id_tecnico:       tec.id_tecnico,
                id_usuario:       tec.id_usuario,
                distancia_metros: Number.parseFloat(tec.distancia_metros),
                priority_score:   calcularPriorityScore(
                    Number.parseFloat(tec.distancia_metros),
                    Number.parseFloat(tec.prom_calificacion)
                ),
            })),
        });
    } catch (wsErr) {
        logger.warn(`notificarTecnicosWS: WebSocket emit falló (no-crítico): ${wsErr.message}`);
    }
};

// ---------------------------------------------------------------------------
// Helper: valida campos comunes de solicitud (inmediata y programada)
// ---------------------------------------------------------------------------
const validarCamposSolicitud = (latitud, longitud, id_subcategoria, descripcion, prioridad) => {
    const erroresFormato = [];
    const latNum = Number.parseFloat(latitud);
    const lngNum = Number.parseFloat(longitud);

    if (Number.isNaN(latNum) || latNum < -90 || latNum > 90)
        erroresFormato.push('La latitud debe ser un número entre -90 y 90');
    if (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180)
        erroresFormato.push('La longitud debe ser un número entre -180 y 180');
    if (!Number.isInteger(Number(id_subcategoria)) || Number(id_subcategoria) < 1)
        erroresFormato.push('El id_subcategoria debe ser un entero positivo');

    const descTrimmed = descripcion.trim();
    if (descTrimmed.length < 10 || descTrimmed.length > 1000)
        erroresFormato.push('La descripcion debe tener entre 10 y 1000 caracteres');

    const prioridadesValidas = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];
    if (!prioridadesValidas.includes(prioridad))
        erroresFormato.push(`La prioridad debe ser uno de: ${prioridadesValidas.join(', ')}`);

    return { erroresFormato, latNum, lngNum, descTrimmed };
};

// ---------------------------------------------------------------------------
// Helper: rollback + throw ValidationError si hay errores (elimina patrón repetido)
// ---------------------------------------------------------------------------
const throwIfValidationErrors = async (errors, transaction) => {
    if (errors.length === 0) return;
    await transaction.rollback();
    throw new ValidationError('Error de validación', errors);
};

// ---------------------------------------------------------------------------
// Helper: verifica que la subcategoría exista (con rollback si no)
// ---------------------------------------------------------------------------
const verificarSubcategoria = async (id_subcategoria, transaction) => {
    const subcategoria = await Subcategoria.findByPk(Number(id_subcategoria), { transaction });
    if (!subcategoria) {
        await transaction.rollback();
        throw new ValidationError('Error de validación', [
            `La subcategoría con id ${id_subcategoria} no existe`,
        ]);
    }
    return subcategoria;
};

// ---------------------------------------------------------------------------
// Helper: valida presencia de campos comunes de solicitud
// ---------------------------------------------------------------------------
const validarPresenciaCampos = ({ id_subcategoria, descripcion, latitud, longitud }, camposExtra = []) => {
    const camposFaltantes = [];
    if (id_subcategoria === undefined || id_subcategoria === null)
        camposFaltantes.push('El campo id_subcategoria es requerido');
    if (!descripcion)
        camposFaltantes.push('El campo descripcion es requerido');
    if (latitud === undefined || latitud === null)
        camposFaltantes.push('El campo latitud es requerido');
    if (longitud === undefined || longitud === null)
        camposFaltantes.push('El campo longitud es requerido');
    camposFaltantes.push(...camposExtra);
    return camposFaltantes;
};

// ---------------------------------------------------------------------------
// Helper: crea entradas en TecnicoSolicitudQueue para técnicos encontrados
// ---------------------------------------------------------------------------
const crearEntradasCola = async (tecnicosEncontrados, idSolicitud, transaction, contexto, { esInmediata = false } = {}) => {
    if (tecnicosEncontrados.length === 0) return;

    // Filtrar técnicos con cooldown activo (solo solicitudes inmediatas)
    let tecnicos = tecnicosEncontrados;
    if (esInmediata) {
        const idsSinCooldown = filtrarSinCooldown(tecnicos.map(t => t.id_tecnico));
        const filtrados = tecnicos.length - idsSinCooldown.length;
        if (filtrados > 0) {
            tecnicos = tecnicos.filter(t => idsSinCooldown.includes(t.id_tecnico));
            logger.info(`${contexto}: ${filtrados} técnico(s) filtrados por cooldown`);
        }
        if (tecnicos.length === 0) return;
    }

    const entradasCola = tecnicos.map((tecnico) => ({
        id_solicitud:     idSolicitud,
        id_tecnico:       tecnico.id_tecnico,
        estado_respuesta: 'NOTIFICADO',
        priority_score:   calcularPriorityScore(
            Number.parseFloat(tecnico.distancia_metros),
            Number.parseFloat(tecnico.prom_calificacion)
        ),
    }));

    await TecnicoSolicitudQueue.bulkCreate(entradasCola, { transaction });

    logger.info(contexto + ': ' + tecnicos.length + ' técnicos encolados para solicitud ' + idSolicitud);
};

// ---------------------------------------------------------------------------
// Helper: construye el objeto de datos para Solicitud.create (inmediata y programada)
// ---------------------------------------------------------------------------
const buildSolicitudData = ({ descTrimmed, imagenes, lngNum, latNum, direccionServicio, cliente, id_subcategoria, idEstadoInicial, prioridad, tipo_servicio }) => ({
    descripcion:         descTrimmed,
    imagenes:            imagenes || null,
    ubicacion_solicitud: {
        type:        'Point',
        coordinates: [lngNum, latNum],
    },
    direccion_servicio:  direccionServicio,
    id_cliente:          cliente.id_cliente,
    id_subcategoria:     Number(id_subcategoria),
    id_estado:           idEstadoInicial,
    prioridad,
    tipo_servicio,
});

// ---------------------------------------------------------------------------
// Helper: construye el objeto data de la respuesta 201 para solicitudes creadas
// ---------------------------------------------------------------------------
const buildCrearResponse = ({ nuevaSolicitud, tipo_servicio, idEstadoInicial, direccionServicio, tecnicosEncontrados, radio_usado_km, extra = {} }) => ({
    id_solicitud:        nuevaSolicitud.id_solicitud,
    tipo_servicio,
    id_estado:           idEstadoInicial,
    prioridad:           nuevaSolicitud.prioridad,
    id_subcategoria:     nuevaSolicitud.id_subcategoria,
    fecha_solicitud:     nuevaSolicitud.fecha_solicitud,
    direccion_servicio:  direccionServicio,
    ...extra,
    tecnicos_notificados: tecnicosEncontrados.length,
    ...(radio_usado_km ? { radio_busqueda_km: radio_usado_km } : {}),
});

// ---------------------------------------------------------------------------
// Radios de búsqueda expandidos (km) cuando no se encuentran técnicos
// dentro de su propio radio_cobertura_km. Se prueban en orden ascendente.
// ---------------------------------------------------------------------------
const RADIOS_EXPANSION_KM = [15, 30, 50];

// ---------------------------------------------------------------------------
// Helper: busca técnicos cercanos combinando dos modos de cobertura:
//
// MODO RADIO (tipo_cobertura = 'RADIO' o NULL — backward compatible):
//   1) Busca dentro del radio_cobertura_km propio de cada técnico.
//   2) Si no encuentra, expande progresivamente a 15→30→50 km.
//
// MODO CIUDAD (tipo_cobertura = 'CIUDAD'):
//   1) Determina qué ciudades contienen el punto de la solicitud
//      (Ciudad.ubicacion_centro + radio_ciudad_km).
//   2) Busca técnicos registrados en esas ciudades via CiudadTecnico.
//
// Combina ambos resultados, elimina duplicados y ordena por distancia.
// ---------------------------------------------------------------------------
const buscarTecnicosCercanos = async ({ latNum, lngNum, id_subcategoria, filtroInmediato, transaction }) => {
    const filtroInmediatoSQL = filtroInmediato
        ? `AND t.disponible_inmediato = true
           AND NOT EXISTS (
               SELECT 1 FROM "Servicio" sv
               WHERE sv.id_tecnico = t.id_tecnico
                 AND sv.id_estado = 5
           )`
        : '';

    const baseReplacements = {
        longitud:        lngNum,
        latitud:         latNum,
        id_subcategoria: Number(id_subcategoria),
    };

    // ── PASO 1: Técnicos modo RADIO ──
    const condicionesRadio = `
        t.estado_validacion = 'ACTIVO'
        AND t.ubicacion_base IS NOT NULL
        AND (t.tipo_cobertura = 'RADIO' OR t.tipo_cobertura IS NULL)
        AND e.id_subcategoria = :id_subcategoria
        ${filtroInmediatoSQL}`;

    const buildQueryRadio = (radioCondicion) => `
        SELECT t.id_tecnico,
               t.id_usuario,
               t.prom_calificacion,
               t.radio_cobertura_km,
               ST_Distance(
                   t.ubicacion_base::geography,
                   ST_SetSRID(ST_MakePoint(:longitud, :latitud), 4326)::geography
               ) AS distancia_metros
        FROM "Tecnico" t
        INNER JOIN "Especialidad" e ON t.id_tecnico = e.id_tecnico
        WHERE ${condicionesRadio}
          AND ${radioCondicion}
        ORDER BY distancia_metros ASC, t.prom_calificacion DESC
        LIMIT 10`;

    // 1a) Buscar dentro del radio propio de cada técnico
    let tecnicosRadio = await sequelize.query(
        buildQueryRadio(`ST_DWithin(
            t.ubicacion_base::geography,
            ST_SetSRID(ST_MakePoint(:longitud, :latitud), 4326)::geography,
            t.radio_cobertura_km * 1000
        )`),
        { replacements: baseReplacements, type: QueryTypes.SELECT, transaction }
    );

    let radioUsado = null;

    // 1b) Expansión progresiva si no encuentra
    if (tecnicosRadio.length === 0) {
        for (const radioKm of RADIOS_EXPANSION_KM) {
            tecnicosRadio = await sequelize.query(
                buildQueryRadio(`ST_DWithin(
                    t.ubicacion_base::geography,
                    ST_SetSRID(ST_MakePoint(:longitud, :latitud), 4326)::geography,
                    :radio_metros
                )`),
                {
                    replacements: { ...baseReplacements, radio_metros: radioKm * 1000 },
                    type: QueryTypes.SELECT,
                    transaction,
                }
            );

            if (tecnicosRadio.length > 0) {
                radioUsado = radioKm;
                logger.info(
                    `buscarTecnicosCercanos: ${tecnicosRadio.length} técnicos RADIO ` +
                    `encontrados con radio expandido de ${radioKm}km`
                );
                break;
            }
        }
    }

    // ── PASO 2: Técnicos modo CIUDAD ──
    const tecnicosCiudad = await sequelize.query(`
        SELECT DISTINCT ON (t.id_tecnico)
               t.id_tecnico,
               t.id_usuario,
               t.prom_calificacion,
               t.radio_cobertura_km,
               ST_Distance(
                   c.ubicacion_centro::geography,
                   ST_SetSRID(ST_MakePoint(:longitud, :latitud), 4326)::geography
               ) AS distancia_metros
        FROM "Tecnico" t
        INNER JOIN "CiudadTecnico" ct ON t.id_tecnico = ct.id_tecnico
        INNER JOIN "Ciudad" c ON ct.id_ciudad = c.id_ciudad
        INNER JOIN "Especialidad" e ON t.id_tecnico = e.id_tecnico
        WHERE t.tipo_cobertura = 'CIUDAD'
          AND t.estado_validacion = 'ACTIVO'
          AND c.ubicacion_centro IS NOT NULL
          AND e.id_subcategoria = :id_subcategoria
          AND ST_DWithin(
              c.ubicacion_centro::geography,
              ST_SetSRID(ST_MakePoint(:longitud, :latitud), 4326)::geography,
              c.radio_ciudad_km * 1000
          )
          ${filtroInmediatoSQL}
        ORDER BY t.id_tecnico, distancia_metros ASC
        LIMIT 10`,
        { replacements: baseReplacements, type: QueryTypes.SELECT, transaction }
    );

    if (tecnicosCiudad.length > 0) {
        logger.info(`buscarTecnicosCercanos: ${tecnicosCiudad.length} técnicos CIUDAD encontrados`);
    }

    // ── PASO 3: Combinar, deduplicar, ordenar ──
    const vistos = new Set();
    const combinados = [];
    for (const t of [...tecnicosRadio, ...tecnicosCiudad]) {
        if (vistos.has(t.id_tecnico)) continue;
        vistos.add(t.id_tecnico);
        combinados.push(t);
    }

    combinados.sort((a, b) => {
        const distDiff = Number(a.distancia_metros) - Number(b.distancia_metros);
        if (distDiff !== 0) return distDiff;
        return Number(b.prom_calificacion) - Number(a.prom_calificacion);
    });

    const tecnicos = combinados.slice(0, 10);

    if (tecnicos.length === 0) {
        logger.info(
            `buscarTecnicosCercanos: Sin técnicos (RADIO ni CIUDAD) ` +
            `incluso con radio máximo de ${RADIOS_EXPANSION_KM.at(-1)}km`
        );
    }

    return { tecnicos, radio_usado_km: radioUsado };
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /solicitudes/inmediata:
 *   post:
 *     summary: Crear solicitud de servicio inmediato (HU-09)
 *     description: |
 *       Crea una solicitud de servicio INMEDIATO para el cliente autenticado.
 *
 *       **Proceso interno:**
 *       1. Valida todos los campos de entrada (coordenadas, subcategoría, descripción).
 *       2. Verifica que la subcategoría exista y esté activa.
 *       3. Busca técnicos ACTIVOS cercanos mediante PostGIS ST_DWithin que tengan
 *          la subcategoría como especialidad y estén disponibles para servicio inmediato.
 *       4. Si se encuentran técnicos: crea la solicitud con estado `BUSCANDO_TECNICOS` (2)
 *          y crea entradas en TecnicoSolicitudQueue con priority_score calculado.
 *       5. Si NO se encuentran técnicos: crea la solicitud con estado `PENDIENTE` (1).
 *       6. Todo se ejecuta en una transacción atómica.
 *
 *       **Reglas de validación:**
 *       - `latitud`: número entre -90 y 90.
 *       - `longitud`: número entre -180 y 180.
 *       - `id_subcategoria`: entero positivo, debe existir en la base de datos.
 *       - `descripcion`: texto entre 10 y 1000 caracteres.
 *       - `prioridad`: opcional, uno de BAJA | MEDIA | ALTA | URGENTE (default MEDIA).
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearSolicitudInmediataRequest'
 *           examples:
 *             plomeria_cali:
 *               summary: Solicitud de plomería urgente en Cali
 *               value:
 *                 id_subcategoria: 1
 *                 descripcion: "Tubería rota en el baño, inundación activa. Necesito atención urgente."
 *                 latitud: 3.4516
 *                 longitud: -76.5320
 *                 prioridad: "URGENTE"
 *             electricidad_media:
 *               summary: Solicitud de electricidad con prioridad media
 *               value:
 *                 id_subcategoria: 3
 *                 descripcion: "Cortocircuito en cocina, sin luz en ese sector de la casa."
 *                 latitud: 3.4610
 *                 longitud: -76.5200
 *                 prioridad: "ALTA"
 *     responses:
 *       201:
 *         description: Solicitud creada exitosamente con técnicos notificados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudResponse'
 *             examples:
 *               con_tecnicos:
 *                 summary: Técnicos encontrados y notificados
 *                 value:
 *                   success: true
 *                   message: "Solicitud inmediata creada. 3 técnicos notificados."
 *                   data:
 *                     id_solicitud: 15
 *                     tipo_servicio: "INMEDIATO"
 *                     id_estado: 2
 *                     tecnicos_notificados: 3
 *               sin_tecnicos:
 *                 summary: Sin técnicos disponibles cercanos
 *                 value:
 *                   success: true
 *                   message: "Solicitud creada. No se encontraron técnicos disponibles en este momento. La solicitud quedó en estado PENDIENTE."
 *                   data:
 *                     id_solicitud: 16
 *                     tipo_servicio: "INMEDIATO"
 *                     id_estado: 1
 *                     tecnicos_notificados: 0
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearSolicitudInmediata = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body
        // ----------------------------------------------------------------
        const {
            id_subcategoria,
            descripcion,
            latitud,
            longitud,
            direccion,
            prioridad = 'MEDIA',
            imagenes,
        } = req.body;

        // ----------------------------------------------------------------
        // 2. Validaciones de presencia
        // ----------------------------------------------------------------
        const camposFaltantes = validarPresenciaCampos({ id_subcategoria, descripcion, latitud, longitud });
        await throwIfValidationErrors(camposFaltantes, t);

        // ----------------------------------------------------------------
        // 3. Validaciones de formato
        // ----------------------------------------------------------------
        const { erroresFormato, latNum, lngNum, descTrimmed } = validarCamposSolicitud(
            latitud, longitud, id_subcategoria, descripcion, prioridad
        );
        await throwIfValidationErrors(erroresFormato, t);

        // ----------------------------------------------------------------
        // 4. Verificar que la subcategoría exista
        // ----------------------------------------------------------------
        const subcategoria = await verificarSubcategoria(id_subcategoria, t);

        // ----------------------------------------------------------------
        // 5. Obtener el id_cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 6. Buscar técnicos cercanos con expansión progresiva de radio
        // ----------------------------------------------------------------
        const { tecnicos: tecnicosEncontrados, radio_usado_km } = await buscarTecnicosCercanos({
            latNum, lngNum, id_subcategoria, filtroInmediato: true, transaction: t,
        });

        // ----------------------------------------------------------------
        // 7. Determinar estado inicial según disponibilidad de técnicos
        // ----------------------------------------------------------------
        const idEstadoInicial = tecnicosEncontrados.length > 0
            ? ESTADO_BUSCANDO_TECNICOS
            : ESTADO_PENDIENTE;

        const direccionServicio = direccion?.trim() || null;

        // ----------------------------------------------------------------
        // 8. Crear la Solicitud con ubicación PostGIS
        // ----------------------------------------------------------------
        const nuevaSolicitud = await Solicitud.create(
            buildSolicitudData({
                descTrimmed, imagenes, lngNum, latNum, direccionServicio,
                cliente, id_subcategoria, idEstadoInicial, prioridad,
                tipo_servicio: 'INMEDIATO',
            }),
            { transaction: t }
        );

        logger.info(
            `crearSolicitudInmediata: Solicitud ${nuevaSolicitud.id_solicitud} creada ` +
            `para cliente ${cliente.id_cliente} — estado ${idEstadoInicial}` +
            (radio_usado_km ? ` (radio expandido: ${radio_usado_km}km)` : '')
        );

        // ----------------------------------------------------------------
        // 9. Crear entradas en la cola para cada técnico encontrado
        // ----------------------------------------------------------------
        await crearEntradasCola(tecnicosEncontrados, nuevaSolicitud.id_solicitud, t, 'crearSolicitudInmediata', { esInmediata: true });

        await t.commit();

        // ── WebSocket: notificar técnicos cercanos en tiempo real (best-effort) ──
        await notificarTecnicosWS({
            nuevaSolicitud, cliente, id_subcategoria, subcategoria,
            descTrimmed, tipo_solicitud: 'INMEDIATA', prioridad, tecnicosEncontrados,
            extra: { direccion_servicio: direccionServicio },
        });

        const mensajeRespuesta = tecnicosEncontrados.length > 0
            ? `Solicitud inmediata creada. ${tecnicosEncontrados.length} técnicos notificados.`
            : 'Solicitud creada. No se encontraron técnicos disponibles en este momento. La solicitud quedó en estado PENDIENTE.';

        return res.status(201).json({
            success: true,
            message: mensajeRespuesta,
            data: buildCrearResponse({
                nuevaSolicitud, tipo_servicio: 'INMEDIATO', idEstadoInicial,
                direccionServicio, tecnicosEncontrados, radio_usado_km,
                extra: { fecha_programada: null },
            }),
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
 * /solicitudes/programada:
 *   post:
 *     summary: Crear solicitud de servicio programado (HU-10)
 *     description: |
 *       Crea una solicitud de servicio PROGRAMADO para el cliente autenticado.
 *
 *       **Proceso interno:**
 *       1. Valida todos los campos de entrada, incluyendo `fecha_programada`.
 *       2. `fecha_programada` debe estar al menos 24 horas en el futuro.
 *       3. Busca técnicos ACTIVOS cercanos con la especialidad requerida
 *          (sin filtro de disponible_inmediato ya que el servicio es programado).
 *       4. Crea la Solicitud con estado `BUSCANDO_TECNICOS` (2) o `PENDIENTE` (1).
 *       5. Crea una Cita vinculada a la solicitud con fecha_cita = fecha_programada.
 *       6. Crea entradas en TecnicoSolicitudQueue para los técnicos encontrados.
 *       7. Todo en una transacción atómica.
 *
 *       **Reglas de validación adicionales (respecto a servicio inmediato):**
 *       - `fecha_programada`: ISO 8601 (YYYY-MM-DDTHH:mm:ss), mínimo 24 horas en el futuro.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CrearSolicitudProgramadaRequest'
 *           examples:
 *             cerrajeria_manana:
 *               summary: Servicio de cerrajería programado para mañana
 *               value:
 *                 id_subcategoria: 5
 *                 descripcion: "Cambio de chapa en puerta principal, llave perdida."
 *                 latitud: 3.4516
 *                 longitud: -76.5320
 *                 fecha_programada: "2026-02-14T09:00:00"
 *                 prioridad: "MEDIA"
 *             electricidad_semana:
 *               summary: Instalación eléctrica programada para la próxima semana
 *               value:
 *                 id_subcategoria: 3
 *                 descripcion: "Instalación de tomacorrientes adicionales en oficina, 4 puntos nuevos."
 *                 latitud: 3.4610
 *                 longitud: -76.5200
 *                 fecha_programada: "2026-02-19T14:30:00"
 *                 prioridad: "BAJA"
 *     responses:
 *       201:
 *         description: Solicitud programada y cita creadas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SolicitudProgramadaResponse'
 *             example:
 *               success: true
 *               message: "Solicitud programada creada. 4 técnicos notificados."
 *               data:
 *                 id_solicitud: 17
 *                 tipo_servicio: "PROGRAMADO"
 *                 id_estado: 2
 *                 cita:
 *                   id_cita: 9
 *                   fecha_cita: "2026-02-14T09:00:00.000Z"
 *                   id_estado: 1
 *                 tecnicos_notificados: 4
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearSolicitudProgramada = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body
        // ----------------------------------------------------------------
        const {
            id_subcategoria,
            descripcion,
            latitud,
            longitud,
            direccion,
            fecha_programada,
            prioridad = 'MEDIA',
            imagenes,
        } = req.body;

        // ----------------------------------------------------------------
        // 2. Validaciones de presencia
        // ----------------------------------------------------------------
        const camposExtra = fecha_programada ? [] : ['El campo fecha_programada es requerido'];
        const camposFaltantes = validarPresenciaCampos({ id_subcategoria, descripcion, latitud, longitud }, camposExtra);
        await throwIfValidationErrors(camposFaltantes, t);

        // ----------------------------------------------------------------
        // 3. Validaciones de formato
        // ----------------------------------------------------------------
        const { erroresFormato, latNum, lngNum, descTrimmed } = validarCamposSolicitud(
            latitud, longitud, id_subcategoria, descripcion, prioridad
        );

        // Validar fecha_programada: parseable y al menos 24 horas en el futuro
        const fechaProgramadaDate = new Date(fecha_programada);
        if (Number.isNaN(fechaProgramadaDate.getTime())) {
            erroresFormato.push('La fecha_programada no tiene un formato de fecha válido (use ISO 8601: YYYY-MM-DDTHH:mm:ss)');
        } else {
            const ahora            = new Date();
            const veinticuatroHoras = 24 * 60 * 60 * 1000; // ms
            if (fechaProgramadaDate.getTime() - ahora.getTime() < veinticuatroHoras) {
                erroresFormato.push('La fecha_programada debe ser al menos 24 horas en el futuro');
            }
        }

        await throwIfValidationErrors(erroresFormato, t);

        // ----------------------------------------------------------------
        // 4. Verificar que la subcategoría exista
        // ----------------------------------------------------------------
        const subcategoria = await verificarSubcategoria(id_subcategoria, t);

        // ----------------------------------------------------------------
        // 5. Obtener el id_cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 6. Buscar técnicos cercanos con expansión progresiva de radio
        //    SIN filtro de disponible_inmediato (servicio programado)
        // ----------------------------------------------------------------
        const { tecnicos: tecnicosEncontrados, radio_usado_km } = await buscarTecnicosCercanos({
            latNum, lngNum, id_subcategoria, filtroInmediato: false, transaction: t,
        });

        // ----------------------------------------------------------------
        // 7. Determinar estado inicial según disponibilidad de técnicos
        // ----------------------------------------------------------------
        const idEstadoInicial = tecnicosEncontrados.length > 0
            ? ESTADO_BUSCANDO_TECNICOS
            : ESTADO_PENDIENTE;

        const direccionServicio = direccion?.trim() || null;

        // ----------------------------------------------------------------
        // 8. Crear la Solicitud
        // ----------------------------------------------------------------
        const nuevaSolicitud = await Solicitud.create(
            buildSolicitudData({
                descTrimmed, imagenes, lngNum, latNum, direccionServicio,
                cliente, id_subcategoria, idEstadoInicial, prioridad,
                tipo_servicio: 'PROGRAMADO',
            }),
            { transaction: t }
        );

        logger.info(
            `crearSolicitudProgramada: Solicitud ${nuevaSolicitud.id_solicitud} creada ` +
            `para cliente ${cliente.id_cliente} — estado ${idEstadoInicial}` +
            (radio_usado_km ? ` (radio expandido: ${radio_usado_km}km)` : '')
        );

        // ----------------------------------------------------------------
        // 9. Crear la Cita vinculada a la solicitud
        // ----------------------------------------------------------------
        const nuevaCita = await Cita.create(
            {
                id_solicitud:   nuevaSolicitud.id_solicitud,
                fecha_cita:     fechaProgramadaDate,
                ubicacion_cita: {
                    type:        'Point',
                    coordinates: [lngNum, latNum],
                },
                id_estado: ESTADO_PENDIENTE,
            },
            { transaction: t }
        );

        logger.info(
            `crearSolicitudProgramada: Cita ${nuevaCita.id_cita} creada ` +
            `para solicitud ${nuevaSolicitud.id_solicitud} — fecha: ${fechaProgramadaDate.toISOString()}`
        );

        // ----------------------------------------------------------------
        // 10. Crear entradas en la cola para cada técnico encontrado
        // ----------------------------------------------------------------
        await crearEntradasCola(tecnicosEncontrados, nuevaSolicitud.id_solicitud, t, 'crearSolicitudProgramada');

        await t.commit();

        // ── WebSocket: notificar técnicos cercanos en tiempo real (best-effort) ──
        await notificarTecnicosWS({
            nuevaSolicitud, cliente, id_subcategoria, subcategoria,
            descTrimmed, tipo_solicitud: 'PROGRAMADA', prioridad, tecnicosEncontrados,
            extra: {
                fecha_programada: fechaProgramadaDate.toISOString(),
                direccion_servicio: direccionServicio,
            },
        });

        const mensajeRespuesta = tecnicosEncontrados.length > 0
            ? `Solicitud programada creada. ${tecnicosEncontrados.length} técnicos notificados.`
            : 'Solicitud creada. No se encontraron técnicos disponibles para esa fecha. La solicitud quedó en estado PENDIENTE.';

        return res.status(201).json({
            success: true,
            message: mensajeRespuesta,
            data: buildCrearResponse({
                nuevaSolicitud, tipo_servicio: 'PROGRAMADO', idEstadoInicial,
                direccionServicio, tecnicosEncontrados, radio_usado_km,
                extra: {
                    fecha_programada: fechaProgramadaDate.toISOString(),
                    cita: { id_cita: nuevaCita.id_cita, fecha_cita: nuevaCita.fecha_cita, id_estado: nuevaCita.id_estado },
                },
            }),
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
 * /solicitudes/mis-solicitudes:
 *   get:
 *     summary: Listar mis solicitudes (Cliente autenticado)
 *     description: |
 *       Retorna la lista paginada de solicitudes creadas por el cliente autenticado.
 *
 *       **Filtros disponibles (query params):**
 *       - `tipo_servicio`: `INMEDIATO` | `PROGRAMADO` (opcional)
 *       - `page`: número de página (default 1)
 *       - `limit`: resultados por página (default 10, máximo 50)
 *
 *       Las solicitudes se ordenan por `fecha_solicitud` descendente (más reciente primero).
 *       Incluye: estado de la solicitud, subcategoría con su categoría padre.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo_servicio
 *         schema:
 *           type: string
 *           enum: [INMEDIATO, PROGRAMADO]
 *         description: Filtrar por tipo de servicio (opcional)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Cantidad de resultados por página (máximo 50)
 *     responses:
 *       200:
 *         description: Lista de solicitudes obtenida exitosamente
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
 *                   example: "Solicitudes obtenidas exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 8
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total_paginas:
 *                       type: integer
 *                       example: 1
 *                     solicitudes:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SolicitudResumen'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerMisSolicitudes = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Parsear parámetros de paginación y filtrado
        // ----------------------------------------------------------------
        const page         = Math.max(1, Number.parseInt(req.query.page)  || 1);
        const limit        = Math.min(50, Math.max(1, Number.parseInt(req.query.limit) || 10));
        const offset       = (page - 1) * limit;
        const tipoServicio = req.query.tipo_servicio;

        // Validar tipo_servicio si se envió
        if (tipoServicio && !['INMEDIATO', 'PROGRAMADO'].includes(tipoServicio)) {
            throw new ValidationError('Error de validación', [
                'El tipo_servicio debe ser INMEDIATO o PROGRAMADO',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Obtener el id_cliente del usuario autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario);

        // ----------------------------------------------------------------
        // 3. Construir el filtro where
        // ----------------------------------------------------------------
        const whereClause = { id_cliente: cliente.id_cliente };
        if (tipoServicio) {
            whereClause.tipo_servicio = tipoServicio;
        }

        // ----------------------------------------------------------------
        // 4. Consultar con paginación e includes
        // ----------------------------------------------------------------
        const { count, rows: solicitudes } = await Solicitud.findAndCountAll({
            where:   whereClause,
            include: [
                {
                    model: EstadoSolicitud,
                    as:    'estado',
                    attributes: ['id_estado', 'descripcion'],
                },
                {
                    model: Subcategoria,
                    as:    'subcategoria',
                    attributes: ['id_subcategoria', 'nombre'],
                    include: [
                        {
                            model:      Categoria,
                            attributes: ['id_categoria', 'nombre'],
                        },
                    ],
                },
                {
                    model: Cotizacion,
                    as:    'cotizaciones',
                    where: { estado: 'ACEPTADA' },
                    required: false,
                    attributes: ['id_cotizacion', 'valor_cotizacion', 'id_tecnico', 'estado'],
                    include: [{
                        model: Tecnico,
                        as:    'tecnico',
                        attributes: ['id_tecnico', 'url_foto', 'prom_calificacion'],
                        include: [{
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido', 'telefono'],
                        }],
                    }],
                },
                {
                    model: Servicio,
                    as:    'servicios_generados',
                    required: false,
                    attributes: ['id_servicio', 'id_estado', 'valor_total'],
                    include: [{
                        model: EstadoSolicitud,
                        as:    'estado',
                        attributes: ['id_estado', 'descripcion'],
                    }],
                },
                {
                    model: Cita,
                    as:    'citas',
                    required: false,
                    attributes: ['id_cita', 'fecha_cita', 'id_estado'],
                },
            ],
            order:  [['fecha_solicitud', 'DESC']],
            limit,
            offset,
            // Excluir el campo GEOMETRY de la respuesta JSON para evitar GeoJSON verboso
            attributes: {
                exclude: ['ubicacion_solicitud'],
            },
        });

        logger.info(
            `obtenerMisSolicitudes: Cliente ${cliente.id_cliente} consultó sus solicitudes — ` +
            `página ${page}, total ${count}`
        );

        return res.status(200).json({
            success: true,
            message: 'Solicitudes obtenidas exitosamente',
            data: {
                total:         count,
                page,
                limit,
                total_paginas: Math.ceil(count / limit),
                solicitudes,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /solicitudes/{id}:
 *   get:
 *     summary: Obtener detalle de una solicitud por ID
 *     description: |
 *       Retorna los detalles completos de una solicitud específica.
 *
 *       **Control de acceso:**
 *       - Un **Cliente** solo puede ver sus propias solicitudes.
 *       - Un **Técnico** puede ver solicitudes en las que tenga una entrada en la cola
 *         (TecnicoSolicitudQueue) o que tenga asignadas (id_tecnico).
 *       - Un **Administrador** puede ver cualquier solicitud.
 *
 *       Incluye: estado, subcategoría con categoría, técnico asignado (si existe),
 *       citas vinculadas, técnicos notificados en cola.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID de la solicitud
 *         example: 15
 *     responses:
 *       200:
 *         description: Detalle de la solicitud obtenido exitosamente
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
 *                   example: "Solicitud obtenida exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/SolicitudDetalle'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerSolicitudPorId = async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id);

        if (!id || id < 1) {
            throw new ValidationError('Error de validación', [
                'El id de la solicitud debe ser un entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 1. Buscar la solicitud con todos sus includes
        // ----------------------------------------------------------------
        const solicitud = await Solicitud.findByPk(id, {
            attributes: {
                exclude: ['ubicacion_solicitud'],
                include: [
                    [sequelize.fn('ST_Y', sequelize.col('Solicitud.ubicacion_solicitud')), 'latitud'],
                    [sequelize.fn('ST_X', sequelize.col('Solicitud.ubicacion_solicitud')), 'longitud'],
                ],
            },
            include: [
                {
                    model: EstadoSolicitud,
                    as:    'estado',
                    attributes: ['id_estado', 'descripcion'],
                },
                {
                    model: Subcategoria,
                    as:    'subcategoria',
                    attributes: ['id_subcategoria', 'nombre'],
                    include: [
                        {
                            model:      Categoria,
                            attributes: ['id_categoria', 'nombre'],
                        },
                    ],
                },
                {
                    model: Tecnico,
                    as:    'tecnico',
                    attributes: ['id_tecnico', 'url_foto', 'prom_calificacion', 'radio_cobertura_km'],
                    required: false,
                    include: [
                        {
                            model: Usuario,
                            as:    'datos_usuario',
                            attributes: ['nombre', 'apellido', 'telefono'],
                        },
                    ],
                },
                {
                    model: Cita,
                    as:    'citas',
                    attributes: { exclude: ['ubicacion_cita'] },
                    required: false,
                    include: [
                        {
                            model: EstadoSolicitud,
                            as:    'estado',
                            attributes: ['descripcion'],
                        },
                    ],
                },
                {
                    model: TecnicoSolicitudQueue,
                    as:    'tecnicos_notificados',
                    attributes: ['id_cola', 'id_tecnico', 'estado_respuesta', 'priority_score', 'fecha_notificacion'],
                    required: false,
                },
            ],
        });

        if (!solicitud) {
            throw new NotFoundError(`No se encontró la solicitud con id ${id}`);
        }

        // ----------------------------------------------------------------
        // 2. Control de acceso por rol
        // ----------------------------------------------------------------
        const { rol, id_usuario } = req.usuario;

        if (rol === 'CLIENTE') {
            // Verificar que la solicitud pertenece a este cliente
            const cliente = await Cliente.findOne({ where: { id_usuario } });
            if (!cliente || solicitud.id_cliente !== cliente.id_cliente) {
                throw new ForbiddenError('No tienes permiso para ver esta solicitud');
            }
        } else if (rol === 'TECNICO') {
            // Verificar que el técnico tiene acceso (asignado o en cola)
            const tecnico = await Tecnico.findOne({ where: { id_usuario } });
            if (!tecnico) {
                throw new ForbiddenError('No se encontró el perfil de técnico');
            }

            const tieneAcceso =
                solicitud.id_tecnico === tecnico.id_tecnico ||
                solicitud.tecnicos_notificados.some(
                    (entrada) => entrada.id_tecnico === tecnico.id_tecnico
                );

            if (!tieneAcceso) {
                throw new ForbiddenError('No tienes permiso para ver esta solicitud');
            }
        }
        // Administrador puede ver cualquier solicitud sin restricciones

        logger.info(
            `obtenerSolicitudPorId: Solicitud ${id} consultada por ` +
            `id_usuario ${id_usuario} (${rol})`
        );

        // ----------------------------------------------------------------
        // 3. Construir respuesta con campos esperados por el frontend
        //    fecha_programada se deriva de la primera cita asociada
        // ----------------------------------------------------------------
        const solicitudJSON = solicitud.toJSON();
        const primeraCita = solicitud.citas?.[0] ?? null;
        solicitudJSON.fecha_programada = primeraCita?.fecha_cita ?? null;

        return res.status(200).json({
            success: true,
            message: 'Solicitud obtenida exitosamente',
            data: solicitudJSON,
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /solicitudes/tecnico/pendientes:
 *   get:
 *     summary: Listar solicitudes pendientes para el técnico autenticado
 *     description: |
 *       Retorna las solicitudes donde el técnico autenticado tiene una entrada
 *       en TecnicoSolicitudQueue con `estado_respuesta` igual a `NOTIFICADO` o `VISTO`.
 *
 *       Estas son las solicitudes que el técnico puede aceptar (enviando cotización)
 *       o rechazar. Se incluyen los datos básicos de la solicitud, subcategoría
 *       y datos públicos del cliente.
 *
 *       Ordenadas por `priority_score` descendente (mayor prioridad primero).
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Cantidad de resultados por página
 *     responses:
 *       200:
 *         description: Solicitudes pendientes obtenidas exitosamente
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
 *                   example: "Solicitudes pendientes obtenidas exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 3
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total_paginas:
 *                       type: integer
 *                       example: 1
 *                     solicitudes:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SolicitudParaTecnico'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerSolicitudesTecnico = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Parsear parámetros de paginación
        // ----------------------------------------------------------------
        const page   = Math.max(1, Number.parseInt(req.query.page)  || 1);
        const limit  = Math.min(50, Math.max(1, Number.parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        // ----------------------------------------------------------------
        // 2. Obtener el id_tecnico del usuario autenticado
        // ----------------------------------------------------------------
        const tecnico = await obtenerTecnico(req.usuario.id_usuario);
        const cutoffInmediata = getInmediataCutoffDate();

        // ----------------------------------------------------------------
        // 3. Buscar entradas en la cola con estado NOTIFICADO o VISTO
        //    e incluir la solicitud completa con sus relaciones
        // ----------------------------------------------------------------
        const { count, rows: entradasCola } = await TecnicoSolicitudQueue.findAndCountAll({
            where: {
                id_tecnico:       tecnico.id_tecnico,
                estado_respuesta: ['NOTIFICADO', 'VISTO'],
            },
            include: [
                {
                    model: Solicitud,
                    as:    'solicitud',
                    where: {
                        [Op.or]: [
                            { tipo_servicio: 'PROGRAMADO' },
                            {
                                tipo_servicio: 'INMEDIATO',
                                fecha_solicitud: { [Op.gte]: cutoffInmediata },
                            },
                        ],
                    },
                    attributes: {
                        exclude: ['ubicacion_solicitud'],
                    },
                    include: [
                        {
                            model: EstadoSolicitud,
                            as:    'estado',
                            attributes: ['id_estado', 'descripcion'],
                        },
                        {
                            model: Subcategoria,
                            as:    'subcategoria',
                            attributes: ['id_subcategoria', 'nombre'],
                            include: [
                                {
                                    model:      Categoria,
                                    attributes: ['id_categoria', 'nombre'],
                                },
                            ],
                        },
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
                    ],
                },
            ],
            order:  [['priority_score', 'DESC']],
            limit,
            offset,
        });

        logger.info(
            `obtenerSolicitudesTecnico: Técnico ${tecnico.id_tecnico} consultó solicitudes pendientes — ` +
            `total ${count}, página ${page}`
        );

        // Transformar la respuesta para devolver las solicitudes con el priority_score adjunto
        const solicitudes = entradasCola.map((entrada) => ({
            id_cola:          entrada.id_cola,
            priority_score:   entrada.priority_score,
            estado_respuesta: entrada.estado_respuesta,
            fecha_notificacion: entrada.fecha_notificacion,
            solicitud:        entrada.solicitud,
        }));

        return res.status(200).json({
            success: true,
            message: 'Solicitudes pendientes obtenidas exitosamente',
            data: {
                total:         count,
                page,
                limit,
                total_paginas: Math.ceil(count / limit),
                solicitudes,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /solicitudes/motivos-cancelacion:
 *   get:
 *     summary: Listar motivos de cancelación activos (HU-13)
 *     description: |
 *       Retorna todos los motivos de cancelación activos disponibles en el sistema.
 *
 *       **Valores semilla:**
 *       - Cliente no disponible
 *       - Técnico no pudo asistir
 *       - Cambio de fecha
 *       - Emergencia
 *       - Otro
 *
 *       Endpoint útil para poblar un selector en el formulario de cancelación.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Motivos de cancelación obtenidos exitosamente
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
 *                   example: "Motivos de cancelación obtenidos exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MotivoCancelacion'
 *             example:
 *               success: true
 *               message: "Motivos de cancelación obtenidos exitosamente"
 *               data:
 *                 - id_motivo: 1
 *                   descripcion: "Cliente no disponible"
 *                   activo: true
 *                 - id_motivo: 2
 *                   descripcion: "Técnico no pudo asistir"
 *                   activo: true
 *                 - id_motivo: 3
 *                   descripcion: "Cambio de fecha"
 *                   activo: true
 *                 - id_motivo: 4
 *                   descripcion: "Emergencia"
 *                   activo: true
 *                 - id_motivo: 5
 *                   descripcion: "Otro"
 *                   activo: true
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerMotivosCancelacion = async (_req, res) => {
    try {
        const motivos = await MotivoCancelacion.findAll({
            where: { activo: true },
            attributes: ['id_motivo', 'descripcion', 'activo'],
            order: [['id_motivo', 'ASC']],
        });

        logger.info(`obtenerMotivosCancelacion: ${motivos.length} motivos activos retornados`);

        return res.status(200).json({
            success: true,
            message: 'Motivos de cancelación obtenidos exitosamente',
            data: motivos,
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /solicitudes/{id}/cancelar:
 *   put:
 *     summary: Cancelar una solicitud propia (HU-13)
 *     description: |
 *       Permite al cliente autenticado cancelar una de sus solicitudes.
 *
 *       **Estados cancelables:** PENDIENTE (1), BUSCANDO_TECNICOS (2), COTIZANDO (3), ASIGNADA (4).
 *
 *       **Estados NO cancelables:** EN_PROCESO (5), COMPLETADA (6), CANCELADA (7).
 *
 *       **Proceso interno (transacción atómica):**
 *       1. Verifica que la solicitud exista y pertenezca al cliente autenticado.
 *       2. Valida que el estado actual sea cancelable.
 *       3. Actualiza `id_estado = 7` (CANCELADA) en la solicitud.
 *       4. Cancela todas las Citas asociadas que no estén en COMPLETADA (6) o CANCELADA (7),
 *          asignando `id_estado = 7` e `id_motivo_cancelacion` si fue proporcionado.
 *       5. Marca todas las entradas en TecnicoSolicitudQueue que no estén en
 *          RECHAZADO, IGNORADO o COTIZADO como `estado_respuesta = 'IGNORADO'`.
 *       6. Si la solicitud estaba ASIGNADA (4) con técnico, registra un log de auditoría.
 *
 *       **Nota:** El campo `id_motivo_cancelacion` corresponde a un registro de
 *       `MotivoCancelacion`. Se puede consultar el listado en `GET /motivos-cancelacion`.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID de la solicitud a cancelar
 *         example: 15
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CancelarSolicitudRequest'
 *           examples:
 *             con_motivo:
 *               summary: Cancelación con motivo seleccionado
 *               value:
 *                 id_motivo_cancelacion: 3
 *                 motivo_adicional: "Debo salir de viaje inesperadamente"
 *             sin_motivo:
 *               summary: Cancelación sin motivo adicional
 *               value:
 *                 id_motivo_cancelacion: 5
 *             solo_texto:
 *               summary: Cancelación solo con texto libre
 *               value:
 *                 motivo_adicional: "Ya resolví el problema por mi cuenta"
 *     responses:
 *       200:
 *         description: Solicitud cancelada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CancelarSolicitudResponse'
 *             example:
 *               success: true
 *               message: "Solicitud cancelada exitosamente"
 *               data:
 *                 id_solicitud: 15
 *                 id_estado: 7
 *                 citas_canceladas: 1
 *                 tecnicos_ignorados: 3
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
export const cancelarSolicitud = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Validar el parámetro de ruta
        // ----------------------------------------------------------------
        const id = Number.parseInt(req.params.id);

        if (!id || id < 1) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El id de la solicitud debe ser un entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Extraer body (ambos campos son opcionales)
        // ----------------------------------------------------------------
        const { id_motivo_cancelacion, motivo_adicional } = req.body || {};

        // ----------------------------------------------------------------
        // 3. Obtener el cliente autenticado
        // ----------------------------------------------------------------
        const cliente = await obtenerCliente(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 4. Buscar la solicitud con sus citas y cola de técnicos
        // ----------------------------------------------------------------
        const solicitud = await Solicitud.findByPk(id, {
            include: [
                {
                    model: Cita,
                    as:    'citas',
                    attributes: ['id_cita', 'id_estado'],
                    required: false,
                },
                {
                    model: TecnicoSolicitudQueue,
                    as:    'tecnicos_notificados',
                    attributes: ['id_cola', 'estado_respuesta'],
                    required: false,
                },
            ],
            transaction: t,
        });

        if (!solicitud) {
            await t.rollback();
            throw new NotFoundError(`No se encontró la solicitud con id ${id}`);
        }

        // ----------------------------------------------------------------
        // 5. Verificar que la solicitud pertenece al cliente autenticado
        // ----------------------------------------------------------------
        if (solicitud.id_cliente !== cliente.id_cliente) {
            await t.rollback();
            throw new ForbiddenError('No tienes permiso para cancelar esta solicitud');
        }

        // ----------------------------------------------------------------
        // 6. Verificar que el estado actual es cancelable
        //    EN_PROCESO (5), COMPLETADA (6) y CANCELADA (7) no se pueden cancelar
        // ----------------------------------------------------------------
        const estadosNoCancelables = [5, ESTADO_COMPLETADA, ESTADO_CANCELADA];

        if (estadosNoCancelables.includes(solicitud.id_estado)) {
            await t.rollback();

            const MAPA_ESTADOS_NO_CANCELABLES = { 5: 'EN_PROCESO', [ESTADO_COMPLETADA]: 'COMPLETADA', [ESTADO_CANCELADA]: 'CANCELADA' };
            const descripcionEstado = MAPA_ESTADOS_NO_CANCELABLES[solicitud.id_estado];

            throw new ValidationError('La solicitud no se puede cancelar', [
                `La solicitud está en estado ${descripcionEstado} y no puede ser cancelada`,
            ]);
        }

        // ----------------------------------------------------------------
        // 7. Registrar si estaba ASIGNADA con técnico (para log de auditoría)
        // ----------------------------------------------------------------
        const estabaAsignada = solicitud.id_estado === 4 && solicitud.id_tecnico !== null;

        // ----------------------------------------------------------------
        // 8. Cancelar la solicitud
        // ----------------------------------------------------------------
        await solicitud.update({ id_estado: ESTADO_CANCELADA }, { transaction: t });

        // ----------------------------------------------------------------
        // 9. Cancelar las citas asociadas que no estén COMPLETADA o CANCELADA
        // ----------------------------------------------------------------
        const citasCancelables = (solicitud.citas || []).filter(
            (cita) => cita.id_estado !== ESTADO_COMPLETADA && cita.id_estado !== ESTADO_CANCELADA
        );

        if (citasCancelables.length > 0) {
            const actualizacionCita = { id_estado: ESTADO_CANCELADA };

            // Solo asignar id_motivo_cancelacion si se proporcionó un valor válido
            if (id_motivo_cancelacion !== undefined && id_motivo_cancelacion !== null) {
                actualizacionCita.id_motivo_cancelacion = Number(id_motivo_cancelacion);
            }

            const idsCitasCancelables = citasCancelables.map((c) => c.id_cita);

            await Cita.update(actualizacionCita, {
                where: { id_cita: idsCitasCancelables },
                transaction: t,
            });
        }

        // ----------------------------------------------------------------
        // 10. Marcar como IGNORADO las entradas de la cola que aún estén activas
        //     (excluir RECHAZADO, IGNORADO y COTIZADO — ya tienen estado final)
        // ----------------------------------------------------------------
        const entradaActualizadas = await TecnicoSolicitudQueue.update(
            { estado_respuesta: 'IGNORADO' },
            {
                where: {
                    id_solicitud:     solicitud.id_solicitud,
                    estado_respuesta: { [Op.notIn]: ['RECHAZADO', 'IGNORADO', 'COTIZADO'] },
                },
                transaction: t,
            }
        );

        // entradaActualizadas[0] contiene el número de filas afectadas
        const tecnicosIgnorados = entradaActualizadas[0];

        await t.commit();

        // ── WebSocket: notificar cancelación en tiempo real (best-effort) ──
        try {
            const { emitSolicitudCancelada } = await import('../sockets/services/socketEmitter.js');
            emitSolicitudCancelada({ id_solicitud: id });
        } catch (wsErr) {
            logger.warn(`cancelarSolicitud: WebSocket emit falló (no-crítico): ${wsErr.message}`);
        }

        // ----------------------------------------------------------------
        // 11. Log de auditoría
        // ----------------------------------------------------------------
        logger.info(
            `cancelarSolicitud: Solicitud ${id} cancelada por cliente ${cliente.id_cliente} — ` +
            `citas_canceladas: ${citasCancelables.length}, tecnicos_ignorados: ${tecnicosIgnorados}`
        );

        if (estabaAsignada) {
            logger.warn(
                `cancelarSolicitud: Solicitud ${id} estaba ASIGNADA al técnico ${solicitud.id_tecnico} ` +
                `antes de ser cancelada por el cliente ${cliente.id_cliente}`
            );
        }

        return res.status(200).json({
            success: true,
            message: 'Solicitud cancelada exitosamente',
            data: {
                id_solicitud:       solicitud.id_solicitud,
                id_estado:          ESTADO_CANCELADA,
                citas_canceladas:   citasCancelables.length,
                tecnicos_ignorados: tecnicosIgnorados,
                ...(motivo_adicional ? { motivo_adicional } : {}),
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};
