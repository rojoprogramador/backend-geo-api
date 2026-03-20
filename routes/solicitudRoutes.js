import { Router } from 'express';
import {
    crearSolicitudInmediata,
    crearSolicitudProgramada,
    obtenerMisSolicitudes,
    obtenerSolicitudPorId,
    obtenerSolicitudesTecnico,
    obtenerMotivosCancelacion,
    cancelarSolicitud,
} from '../controllers/solicitudController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// Swagger Component Schemas — Solicitudes
// ---------------------------------------------------------------------------

/**
 * @swagger
 * components:
 *   schemas:
 *     CrearSolicitudInmediataRequest:
 *       type: object
 *       required:
 *         - id_subcategoria
 *         - descripcion
 *         - latitud
 *         - longitud
 *       properties:
 *         id_subcategoria:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *           description: "ID de la subcategoría del servicio requerido"
 *         descripcion:
 *           type: string
 *           minLength: 10
 *           maxLength: 1000
 *           example: "Tubería rota en el baño, inundación activa."
 *           description: "Descripción detallada del problema (10-1000 caracteres)"
 *         latitud:
 *           type: number
 *           format: float
 *           minimum: -90
 *           maximum: 90
 *           example: 3.4516
 *           description: "Latitud de la ubicación del servicio (WGS84)"
 *         longitud:
 *           type: number
 *           format: float
 *           minimum: -180
 *           maximum: 180
 *           example: -76.5320
 *           description: "Longitud de la ubicación del servicio (WGS84)"
 *         prioridad:
 *           type: string
 *           enum: [BAJA, MEDIA, ALTA, URGENTE]
 *           default: MEDIA
 *           example: "URGENTE"
 *           description: "Nivel de prioridad de la solicitud (default MEDIA)"
 *         imagenes:
 *           type: string
 *           example: "https://storage.geo-api.com/solicitudes/foto1.jpg"
 *           description: "URL o ruta de imágenes adjuntas (opcional)"
 *
 *     CrearSolicitudProgramadaRequest:
 *       type: object
 *       required:
 *         - id_subcategoria
 *         - descripcion
 *         - latitud
 *         - longitud
 *         - fecha_programada
 *       properties:
 *         id_subcategoria:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *           description: "ID de la subcategoría del servicio requerido"
 *         descripcion:
 *           type: string
 *           minLength: 10
 *           maxLength: 1000
 *           example: "Cambio de chapa en puerta principal, llave perdida."
 *           description: "Descripción detallada del problema (10-1000 caracteres)"
 *         latitud:
 *           type: number
 *           format: float
 *           minimum: -90
 *           maximum: 90
 *           example: 3.4516
 *           description: "Latitud de la ubicación del servicio (WGS84)"
 *         longitud:
 *           type: number
 *           format: float
 *           minimum: -180
 *           maximum: 180
 *           example: -76.5320
 *           description: "Longitud de la ubicación del servicio (WGS84)"
 *         fecha_programada:
 *           type: string
 *           format: date-time
 *           example: "2026-02-14T09:00:00"
 *           description: "Fecha y hora del servicio programado. Debe ser al menos 24 horas en el futuro (ISO 8601)"
 *         prioridad:
 *           type: string
 *           enum: [BAJA, MEDIA, ALTA, URGENTE]
 *           default: MEDIA
 *           example: "MEDIA"
 *           description: "Nivel de prioridad (default MEDIA)"
 *         imagenes:
 *           type: string
 *           example: "https://storage.geo-api.com/solicitudes/foto2.jpg"
 *           description: "URL o ruta de imágenes adjuntas (opcional)"
 *
 *     SolicitudResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Solicitud inmediata creada. 3 técnicos notificados."
 *         data:
 *           type: object
 *           properties:
 *             id_solicitud:
 *               type: integer
 *               example: 15
 *             tipo_servicio:
 *               type: string
 *               example: "INMEDIATO"
 *             id_estado:
 *               type: integer
 *               example: 2
 *               description: "2 = BUSCANDO_TECNICOS, 1 = PENDIENTE (sin técnicos encontrados)"
 *             prioridad:
 *               type: string
 *               example: "URGENTE"
 *             id_subcategoria:
 *               type: integer
 *               example: 1
 *             fecha_solicitud:
 *               type: string
 *               format: date-time
 *               example: "2026-02-12T15:30:00.000Z"
 *             tecnicos_notificados:
 *               type: integer
 *               example: 3
 *               description: "Número de técnicos notificados vía TecnicoSolicitudQueue"
 *
 *     SolicitudProgramadaResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Solicitud programada creada. 4 técnicos notificados."
 *         data:
 *           type: object
 *           properties:
 *             id_solicitud:
 *               type: integer
 *               example: 17
 *             tipo_servicio:
 *               type: string
 *               example: "PROGRAMADO"
 *             id_estado:
 *               type: integer
 *               example: 2
 *             prioridad:
 *               type: string
 *               example: "MEDIA"
 *             id_subcategoria:
 *               type: integer
 *               example: 5
 *             fecha_solicitud:
 *               type: string
 *               format: date-time
 *               example: "2026-02-12T15:30:00.000Z"
 *             cita:
 *               type: object
 *               properties:
 *                 id_cita:
 *                   type: integer
 *                   example: 9
 *                 fecha_cita:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-02-14T09:00:00.000Z"
 *                 id_estado:
 *                   type: integer
 *                   example: 1
 *                   description: "1 = PENDIENTE (sin técnico asignado aún)"
 *             tecnicos_notificados:
 *               type: integer
 *               example: 4
 *
 *     SolicitudResumen:
 *       type: object
 *       properties:
 *         id_solicitud:
 *           type: integer
 *           example: 15
 *         descripcion:
 *           type: string
 *           example: "Tubería rota en el baño"
 *         prioridad:
 *           type: string
 *           enum: [BAJA, MEDIA, ALTA, URGENTE]
 *           example: "URGENTE"
 *         tipo_servicio:
 *           type: string
 *           enum: [INMEDIATO, PROGRAMADO]
 *           example: "INMEDIATO"
 *         fecha_solicitud:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T15:30:00.000Z"
 *         estado:
 *           type: object
 *           properties:
 *             id_estado:
 *               type: integer
 *               example: 2
 *             descripcion:
 *               type: string
 *               example: "BUSCANDO_TECNICOS"
 *         subcategoria:
 *           type: object
 *           properties:
 *             id_subcategoria:
 *               type: integer
 *               example: 1
 *             nombre:
 *               type: string
 *               example: "Reparación de tuberías"
 *             Categoria:
 *               type: object
 *               properties:
 *                 id_categoria:
 *                   type: integer
 *                   example: 1
 *                 nombre:
 *                   type: string
 *                   example: "Plomería"
 *
 *     SolicitudDetalle:
 *       type: object
 *       properties:
 *         id_solicitud:
 *           type: integer
 *           example: 15
 *         descripcion:
 *           type: string
 *           example: "Tubería rota en el baño, inundación activa."
 *         prioridad:
 *           type: string
 *           example: "URGENTE"
 *         tipo_servicio:
 *           type: string
 *           example: "INMEDIATO"
 *         num_rechazos:
 *           type: integer
 *           example: 0
 *         fecha_solicitud:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T15:30:00.000Z"
 *         estado:
 *           type: object
 *           properties:
 *             id_estado:
 *               type: integer
 *               example: 2
 *             descripcion:
 *               type: string
 *               example: "BUSCANDO_TECNICOS"
 *         subcategoria:
 *           type: object
 *           properties:
 *             id_subcategoria:
 *               type: integer
 *               example: 1
 *             nombre:
 *               type: string
 *               example: "Reparación de tuberías"
 *             Categoria:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "Plomería"
 *         tecnico:
 *           type: object
 *           nullable: true
 *           description: "Técnico asignado (null si aún no está asignado)"
 *           properties:
 *             id_tecnico:
 *               type: integer
 *               example: 3
 *             prom_calificacion:
 *               type: number
 *               example: 4.7
 *             datos_usuario:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "Andrés Felipe"
 *                 apellido:
 *                   type: string
 *                   example: "Martínez López"
 *                 telefono:
 *                   type: string
 *                   example: "3001234567"
 *         citas:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id_cita:
 *                 type: integer
 *                 example: 9
 *               fecha_cita:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-02-14T09:00:00.000Z"
 *               estado:
 *                 type: object
 *                 properties:
 *                   descripcion:
 *                     type: string
 *                     example: "PENDIENTE"
 *         tecnicos_notificados:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id_cola:
 *                 type: integer
 *                 example: 22
 *               id_tecnico:
 *                 type: integer
 *                 example: 3
 *               estado_respuesta:
 *                 type: string
 *                 enum: [NOTIFICADO, VISTO, COTIZADO, RECHAZADO, IGNORADO]
 *                 example: "NOTIFICADO"
 *               priority_score:
 *                 type: integer
 *                 example: 85
 *
 *     SolicitudParaTecnico:
 *       type: object
 *       properties:
 *         id_cola:
 *           type: integer
 *           example: 22
 *         priority_score:
 *           type: integer
 *           example: 85
 *           description: "Puntuación calculada por distancia y calificación del técnico"
 *         estado_respuesta:
 *           type: string
 *           enum: [NOTIFICADO, VISTO, COTIZADO, RECHAZADO, IGNORADO]
 *           example: "NOTIFICADO"
 *         fecha_notificacion:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T15:30:00.000Z"
 *         solicitud:
 *           type: object
 *           properties:
 *             id_solicitud:
 *               type: integer
 *               example: 15
 *             descripcion:
 *               type: string
 *               example: "Tubería rota en el baño, inundación activa."
 *             prioridad:
 *               type: string
 *               example: "URGENTE"
 *             tipo_servicio:
 *               type: string
 *               example: "INMEDIATO"
 *             fecha_solicitud:
 *               type: string
 *               format: date-time
 *               example: "2026-02-12T15:30:00.000Z"
 *             estado:
 *               type: object
 *               properties:
 *                 descripcion:
 *                   type: string
 *                   example: "BUSCANDO_TECNICOS"
 *             subcategoria:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "Reparación de tuberías"
 *                 Categoria:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "Plomería"
 *             cliente:
 *               type: object
 *               properties:
 *                 id_cliente:
 *                   type: integer
 *                   example: 8
 *                 datos_usuario:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "María Alejandra"
 *                     apellido:
 *                       type: string
 *                       example: "González Ospina"
 *
 *     MotivoCancelacion:
 *       type: object
 *       properties:
 *         id_motivo:
 *           type: integer
 *           example: 3
 *           description: "ID del motivo de cancelación"
 *         descripcion:
 *           type: string
 *           example: "Cambio de fecha"
 *           description: "Descripción del motivo"
 *         activo:
 *           type: boolean
 *           example: true
 *           description: "Indica si el motivo está activo y disponible para usar"
 *
 *     CancelarSolicitudRequest:
 *       type: object
 *       properties:
 *         id_motivo_cancelacion:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *           description: |
 *             ID del motivo de cancelación (opcional).
 *             Consultar los motivos disponibles en GET /api/solicitudes/motivos-cancelacion.
 *         motivo_adicional:
 *           type: string
 *           maxLength: 500
 *           example: "Debo salir de viaje inesperadamente"
 *           description: "Texto libre adicional para describir el motivo (opcional)"
 *
 *     CancelarSolicitudResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Solicitud cancelada exitosamente"
 *         data:
 *           type: object
 *           properties:
 *             id_solicitud:
 *               type: integer
 *               example: 15
 *             id_estado:
 *               type: integer
 *               example: 7
 *               description: "Siempre 7 (CANCELADA)"
 *             citas_canceladas:
 *               type: integer
 *               example: 1
 *               description: "Número de citas que fueron canceladas en cascada"
 *             tecnicos_ignorados:
 *               type: integer
 *               example: 3
 *               description: "Número de entradas en TecnicoSolicitudQueue marcadas como IGNORADO"
 *             motivo_adicional:
 *               type: string
 *               example: "Debo salir de viaje inesperadamente"
 *               description: "Texto libre del motivo (solo presente si se envió en el request)"
 */

// ---------------------------------------------------------------------------
// RUTAS — Orden: estáticas ANTES que dinámicas (:id)
// ---------------------------------------------------------------------------

// POST /api/solicitudes/inmediata — HU-09: Crear solicitud de servicio inmediato
router.post('/inmediata', verifyToken, permitirRoles('CLIENTE'), crearSolicitudInmediata);

// POST /api/solicitudes/programada — HU-10: Crear solicitud de servicio programado
router.post('/programada', verifyToken, permitirRoles('CLIENTE'), crearSolicitudProgramada);

// GET /api/solicitudes/mis-solicitudes — Listar solicitudes del cliente autenticado
router.get('/mis-solicitudes', verifyToken, permitirRoles('CLIENTE'), obtenerMisSolicitudes);

// GET /api/solicitudes/tecnico/pendientes — Solicitudes pendientes para el técnico
router.get('/tecnico/pendientes', verifyToken, permitirRoles('TECNICO'), obtenerSolicitudesTecnico);

// GET /api/solicitudes/motivos-cancelacion — HU-13: Listar motivos de cancelación activos
// IMPORTANTE: debe ir ANTES de /:id para que Express no lo interprete como id='motivos-cancelacion'
router.get('/motivos-cancelacion', verifyToken, obtenerMotivosCancelacion);

// GET /api/solicitudes/:id — Detalle de una solicitud (Cliente propietario, Técnico con acceso o Admin)
router.get('/:id', verifyToken, obtenerSolicitudPorId);

// PUT /api/solicitudes/:id/cancelar — HU-13: Cancelar una solicitud propia (solo Cliente)
router.put('/:id/cancelar', verifyToken, permitirRoles('CLIENTE'), cancelarSolicitud);

export default router;
