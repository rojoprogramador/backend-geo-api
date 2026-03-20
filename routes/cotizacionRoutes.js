import { Router } from 'express';
import {
    crearCotizacion,
    obtenerCotizacionesSolicitud,
    aceptarCotizacion,
    rechazarCotizacion,
} from '../controllers/cotizacionController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// Swagger Component Schemas — Cotizaciones
// ---------------------------------------------------------------------------

/**
 * @swagger
 * components:
 *   schemas:
 *     CrearCotizacionRequest:
 *       type: object
 *       required:
 *         - id_solicitud
 *         - valor_cotizacion
 *       properties:
 *         id_solicitud:
 *           type: integer
 *           minimum: 1
 *           example: 15
 *           description: "ID de la solicitud a la cual se envía la cotización"
 *         valor_cotizacion:
 *           type: number
 *           format: float
 *           minimum: 0.01
 *           example: 180000
 *           description: "Valor de la cotización en pesos colombianos (COP), debe ser mayor a 0"
 *         descripcion:
 *           type: string
 *           minLength: 10
 *           maxLength: 2000
 *           example: "Reparación de tubería rota, incluye sellante epoxi y codo de 1/2 pulgada."
 *           description: "Descripción detallada del trabajo a realizar (10-2000 caracteres, opcional)"
 *         tiempo_estimado:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           example: "2-3 horas"
 *           description: "Tiempo estimado para completar el trabajo (1-100 caracteres, opcional)"
 *         incluye_materiales:
 *           type: boolean
 *           default: false
 *           example: true
 *           description: "Indica si el precio incluye materiales o es solo mano de obra (default false)"
 *         dias_garantia:
 *           type: integer
 *           minimum: 0
 *           maximum: 365
 *           default: 0
 *           example: 30
 *           description: "Días de garantía ofrecidos para el trabajo (0-365, default 0)"
 *
 *     CotizacionDetalle:
 *       type: object
 *       properties:
 *         id_cotizacion:
 *           type: integer
 *           example: 7
 *         id_solicitud:
 *           type: integer
 *           example: 15
 *         id_tecnico:
 *           type: integer
 *           example: 3
 *         valor_cotizacion:
 *           type: number
 *           format: float
 *           example: 180000
 *           description: "Valor en COP"
 *         descripcion:
 *           type: string
 *           nullable: true
 *           example: "Reparación de tubería rota, incluye sellante epoxi y codo de 1/2 pulgada."
 *         tiempo_estimado:
 *           type: string
 *           nullable: true
 *           example: "2-3 horas"
 *         incluye_materiales:
 *           type: boolean
 *           example: true
 *         dias_garantia:
 *           type: integer
 *           example: 30
 *         estado:
 *           type: string
 *           enum: [PENDIENTE, ACEPTADA, RECHAZADA]
 *           example: "PENDIENTE"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T16:45:00.000Z"
 *         tecnico:
 *           type: object
 *           properties:
 *             id_tecnico:
 *               type: integer
 *               example: 3
 *             prom_calificacion:
 *               type: number
 *               format: float
 *               example: 4.7
 *               description: "Promedio de calificaciones del técnico (1.0 - 5.0)"
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
 *
 *     CotizacionConTecnico:
 *       type: object
 *       properties:
 *         id_cotizacion:
 *           type: integer
 *           example: 7
 *         valor_cotizacion:
 *           type: number
 *           format: float
 *           example: 180000
 *           description: "Valor en COP — cotizaciones ordenadas de menor a mayor por este campo"
 *         descripcion:
 *           type: string
 *           nullable: true
 *           example: "Reparación de tubería rota, incluye sellante epoxi."
 *         tiempo_estimado:
 *           type: string
 *           nullable: true
 *           example: "2-3 horas"
 *         incluye_materiales:
 *           type: boolean
 *           example: true
 *         dias_garantia:
 *           type: integer
 *           example: 30
 *         estado:
 *           type: string
 *           enum: [PENDIENTE, ACEPTADA, RECHAZADA]
 *           example: "PENDIENTE"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T16:45:00.000Z"
 *         tecnico:
 *           type: object
 *           description: "Datos del técnico para facilitar la comparación"
 *           properties:
 *             id_tecnico:
 *               type: integer
 *               example: 3
 *             prom_calificacion:
 *               type: number
 *               format: float
 *               example: 4.7
 *               description: "Promedio de calificaciones del técnico (1.0 - 5.0)"
 *             radio_cobertura_km:
 *               type: number
 *               example: 10
 *               description: "Radio de cobertura del técnico en kilómetros"
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
 *
 *     CotizacionAceptadaResponse:
 *       type: object
 *       properties:
 *         id_cotizacion:
 *           type: integer
 *           example: 7
 *         id_solicitud:
 *           type: integer
 *           example: 15
 *         id_tecnico:
 *           type: integer
 *           example: 3
 *         valor_cotizacion:
 *           type: number
 *           format: float
 *           example: 180000
 *         descripcion:
 *           type: string
 *           nullable: true
 *           example: "Reparación de tubería rota, incluye sellante epoxi."
 *         tiempo_estimado:
 *           type: string
 *           nullable: true
 *           example: "2-3 horas"
 *         incluye_materiales:
 *           type: boolean
 *           example: true
 *         dias_garantia:
 *           type: integer
 *           example: 30
 *         estado:
 *           type: string
 *           example: "ACEPTADA"
 *         tecnico:
 *           type: object
 *           description: "Datos del técnico asignado"
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
 *         solicitud:
 *           type: object
 *           description: "Estado actualizado de la solicitud"
 *           properties:
 *             id_solicitud:
 *               type: integer
 *               example: 15
 *             id_estado:
 *               type: integer
 *               example: 4
 *             estado:
 *               type: object
 *               properties:
 *                 id_estado:
 *                   type: integer
 *                   example: 4
 *                 descripcion:
 *                   type: string
 *                   example: "ASIGNADA"
 */

// ---------------------------------------------------------------------------
// RUTAS — Orden: estáticas ANTES que dinámicas (:id)
// ---------------------------------------------------------------------------

// POST /api/cotizaciones — HU-11: Técnico envía cotización
router.post('/', verifyToken, permitirRoles('TECNICO'), crearCotizacion);

// GET /api/cotizaciones/solicitud/:id_solicitud — HU-12: Cliente ve y compara cotizaciones
router.get('/solicitud/:id_solicitud', verifyToken, permitirRoles('CLIENTE'), obtenerCotizacionesSolicitud);

// PUT /api/cotizaciones/:id/aceptar — HU-12: Cliente acepta una cotización
router.put('/:id/aceptar', verifyToken, permitirRoles('CLIENTE'), aceptarCotizacion);

// PUT /api/cotizaciones/:id/rechazar — Cliente rechaza una cotización individual
router.put('/:id/rechazar', verifyToken, permitirRoles('CLIENTE'), rechazarCotizacion);

export default router;
