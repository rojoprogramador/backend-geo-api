import { Router } from 'express';
import {
    iniciarServicio,
    finalizarServicio,
    obtenerServiciosPorTecnico,
    obtenerServiciosPorCliente,
    obtenerServicioPorId,
} from '../controllers/servicioController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// Swagger Component Schemas — Servicios
// ---------------------------------------------------------------------------

/**
 * @swagger
 * components:
 *   schemas:
 *     IniciarServicioResponse:
 *       type: object
 *       properties:
 *         id_servicio:
 *           type: integer
 *           example: 8
 *         id_solicitud:
 *           type: integer
 *           example: 15
 *         id_cliente:
 *           type: integer
 *           example: 3
 *         id_tecnico:
 *           type: integer
 *           example: 7
 *         id_subcategoria:
 *           type: integer
 *           example: 2
 *         id_estado:
 *           type: integer
 *           example: 5
 *           description: "5 = EN_PROCESO"
 *         valor_total:
 *           type: number
 *           format: float
 *           example: 0
 *         fecha_servicio:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T10:30:00.000Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T10:30:00.000Z"
 *
 *     FinalizarServicioRequest:
 *       type: object
 *       required:
 *         - id_medioPago
 *       properties:
 *         id_medioPago:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *           description: "ID del medio de pago (1=EFECTIVO, 2=TARJETA_CREDITO, 3=TRANSFERENCIA, 4=SALDO_APP)"
 *         valor_total:
 *           type: number
 *           format: float
 *           minimum: 0.01
 *           nullable: true
 *           example: 180000
 *           description: "Valor total cobrado en COP. Opcional — si no se envía se usa el valor de la cotización aceptada."
 *         imagenes:
 *           type: string
 *           nullable: true
 *           example: "https://storage.geoapi.co/servicios/8/foto1.jpg,https://storage.geoapi.co/servicios/8/foto2.jpg"
 *           description: "URLs de evidencia fotográfica del trabajo realizado (separadas por coma)"
 *
 *     TransaccionResumen:
 *       type: object
 *       properties:
 *         id_transaccion:
 *           type: integer
 *           example: 5
 *         monto_total:
 *           type: number
 *           format: float
 *           example: 180000
 *           description: "Valor total del servicio en COP"
 *         comision_plataforma:
 *           type: number
 *           format: float
 *           example: 27000
 *           description: "Comisión del 15% cobrada por la plataforma"
 *         monto_tecnico:
 *           type: number
 *           format: float
 *           example: 153000
 *           description: "Monto neto que recibirá el técnico (85% del total)"
 *         id_medioPago:
 *           type: integer
 *           example: 1
 *         metodo_cobro:
 *           type: string
 *           enum: [PLATAFORMA, EFECTIVO, CRUCE_CUENTAS]
 *           example: "PLATAFORMA"
 *         estado_pago:
 *           type: string
 *           enum: [PENDIENTE, COMPLETADO, FALLIDO, REEMBOLSADO]
 *           example: "PENDIENTE"
 *
 *     ServicioResumen:
 *       type: object
 *       properties:
 *         id_servicio:
 *           type: integer
 *           example: 8
 *         id_solicitud:
 *           type: integer
 *           nullable: true
 *           example: 15
 *         valor_total:
 *           type: number
 *           format: float
 *           example: 180000
 *         fecha_servicio:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T14:00:00.000Z"
 *         imagenes:
 *           type: string
 *           nullable: true
 *           example: "https://storage.geoapi.co/servicios/8/foto1.jpg"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T10:30:00.000Z"
 *         solicitud_origen:
 *           type: object
 *           nullable: true
 *           properties:
 *             id_solicitud:
 *               type: integer
 *               example: 15
 *             descripcion:
 *               type: string
 *               nullable: true
 *               example: "Tubería rota en el baño principal"
 *             prioridad:
 *               type: string
 *               enum: [BAJA, MEDIA, ALTA, URGENTE]
 *               example: "ALTA"
 *             tipo_servicio:
 *               type: string
 *               enum: [INMEDIATO, PROGRAMADO]
 *               example: "INMEDIATO"
 *         subcategoria:
 *           type: object
 *           nullable: true
 *           properties:
 *             id_subcategoria:
 *               type: integer
 *               example: 2
 *             nombre:
 *               type: string
 *               example: "Reparación de tuberías"
 *         estado:
 *           type: object
 *           nullable: true
 *           properties:
 *             id_estado:
 *               type: integer
 *               example: 6
 *             descripcion:
 *               type: string
 *               example: "COMPLETADA"
 *         transaccion:
 *           type: object
 *           nullable: true
 *           properties:
 *             id_transaccion:
 *               type: integer
 *               example: 5
 *             monto_total:
 *               type: number
 *               example: 180000
 *             estado_pago:
 *               type: string
 *               example: "PENDIENTE"
 */

// ---------------------------------------------------------------------------
// RUTAS — IMPORTANTE: rutas estáticas ANTES que dinámicas (:id)
// ---------------------------------------------------------------------------

// PUT /api/servicios/iniciar/:id_solicitud — HU-16: Técnico inicia el servicio
router.put('/iniciar/:id_solicitud', verifyToken, permitirRoles('Tecnico'), iniciarServicio);

// GET /api/servicios/tecnico/mis-servicios — HU-16: Historial de servicios del técnico
router.get('/tecnico/mis-servicios', verifyToken, permitirRoles('Tecnico'), obtenerServiciosPorTecnico);

// GET /api/servicios/cliente/mis-servicios — HU-16: Historial de servicios del cliente
router.get('/cliente/mis-servicios', verifyToken, permitirRoles('Cliente'), obtenerServiciosPorCliente);

// PUT /api/servicios/:id/finalizar — HU-16: Técnico finaliza el servicio y registra pago
router.put('/:id/finalizar', verifyToken, permitirRoles('Tecnico'), finalizarServicio);

// GET /api/servicios/:id — HU-16: Ver detalle de un servicio (Cliente, Técnico o Admin)
router.get('/:id', verifyToken, obtenerServicioPorId);

export default router;
