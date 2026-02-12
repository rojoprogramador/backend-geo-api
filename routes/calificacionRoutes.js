import { Router } from 'express';
import {
    crearCalificacion,
    obtenerCalificacionesTecnico,
    obtenerMiCalificacionComoTecnico,
    obtenerCalificacionServicio,
} from '../controllers/calificacionController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = Router();

// ---------------------------------------------------------------------------
// Swagger Component Schemas — Calificaciones
// ---------------------------------------------------------------------------

/**
 * @swagger
 * components:
 *   schemas:
 *     CrearCalificacionRequest:
 *       type: object
 *       required:
 *         - id_servicio
 *         - puntuacion
 *       properties:
 *         id_servicio:
 *           type: integer
 *           minimum: 1
 *           example: 12
 *           description: "ID del servicio completado que se desea calificar"
 *         puntuacion:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           example: 5
 *           description: "Puntuación del 1 al 5 (1=Muy malo, 5=Excelente)"
 *         comentario:
 *           type: string
 *           minLength: 5
 *           maxLength: 1000
 *           nullable: true
 *           example: "Excelente trabajo, muy puntual y profesional. Dejó todo limpio."
 *           description: "Comentario opcional sobre el servicio recibido (5-1000 caracteres)"
 *
 *     CalificacionCreada:
 *       type: object
 *       properties:
 *         calificacion:
 *           type: object
 *           properties:
 *             id_calificacion:
 *               type: integer
 *               example: 8
 *             id_servicio:
 *               type: integer
 *               example: 12
 *             id_cliente:
 *               type: integer
 *               example: 5
 *             id_tecnico:
 *               type: integer
 *               example: 3
 *             puntuacion:
 *               type: integer
 *               example: 5
 *             comentario:
 *               type: string
 *               nullable: true
 *               example: "Excelente trabajo, muy puntual y profesional."
 *             fecha_calificacion:
 *               type: string
 *               format: date-time
 *               example: "2026-02-12T18:30:00.000Z"
 *             createdAt:
 *               type: string
 *               format: date-time
 *               example: "2026-02-12T18:30:00.000Z"
 *             cliente:
 *               type: object
 *               properties:
 *                 id_cliente:
 *                   type: integer
 *                   example: 5
 *                 datos_usuario:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "María Camila"
 *                     apellido:
 *                       type: string
 *                       example: "González Herrera"
 *             tecnico:
 *               type: object
 *               properties:
 *                 id_tecnico:
 *                   type: integer
 *                   example: 3
 *                 prom_calificacion:
 *                   type: number
 *                   format: float
 *                   example: 4.75
 *                   description: "Promedio recalculado después de esta calificación"
 *                 datos_usuario:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "Andrés Felipe"
 *                     apellido:
 *                       type: string
 *                       example: "Martínez López"
 *             servicio:
 *               type: object
 *               properties:
 *                 id_servicio:
 *                   type: integer
 *                   example: 12
 *                 valor_total:
 *                   type: number
 *                   format: float
 *                   example: 180000
 *                 fecha_servicio:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-02-12T14:00:00.000Z"
 *                 subcategoria:
 *                   type: object
 *                   properties:
 *                     id_subcategoria:
 *                       type: integer
 *                       example: 4
 *                     nombre:
 *                       type: string
 *                       example: "Reparación de tuberías"
 *         nuevo_promedio_tecnico:
 *           type: number
 *           format: float
 *           example: 4.75
 *           description: "Nuevo promedio de calificación del técnico tras esta calificación"
 *         total_calificaciones:
 *           type: integer
 *           example: 12
 *           description: "Total de calificaciones recibidas por el técnico"
 *
 *     CalificacionDetalle:
 *       type: object
 *       properties:
 *         id_calificacion:
 *           type: integer
 *           example: 8
 *         id_servicio:
 *           type: integer
 *           example: 12
 *         puntuacion:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           example: 5
 *         comentario:
 *           type: string
 *           nullable: true
 *           example: "Excelente trabajo, muy puntual y profesional."
 *         fecha_calificacion:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T18:30:00.000Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-02-12T18:30:00.000Z"
 *         cliente:
 *           type: object
 *           properties:
 *             id_cliente:
 *               type: integer
 *               example: 5
 *             datos_usuario:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "María Camila"
 *                 apellido:
 *                   type: string
 *                   example: "González Herrera"
 *         tecnico:
 *           type: object
 *           properties:
 *             id_tecnico:
 *               type: integer
 *               example: 3
 *             prom_calificacion:
 *               type: number
 *               format: float
 *               example: 4.75
 *             datos_usuario:
 *               type: object
 *               properties:
 *                 nombre:
 *                   type: string
 *                   example: "Andrés Felipe"
 *                 apellido:
 *                   type: string
 *                   example: "Martínez López"
 *
 *     CalificacionesTecnicoResponse:
 *       type: object
 *       properties:
 *         tecnico:
 *           type: object
 *           properties:
 *             id_tecnico:
 *               type: integer
 *               example: 3
 *             nombre:
 *               type: string
 *               example: "Andrés Felipe"
 *             apellido:
 *               type: string
 *               example: "Martínez López"
 *             prom_calificacion:
 *               type: number
 *               format: float
 *               example: 4.75
 *               description: "Promedio almacenado en el perfil del técnico"
 *         total_calificaciones:
 *           type: integer
 *           example: 15
 *         pagina_actual:
 *           type: integer
 *           example: 1
 *         total_paginas:
 *           type: integer
 *           example: 2
 *         por_pagina:
 *           type: integer
 *           example: 10
 *         calificaciones:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id_calificacion:
 *                 type: integer
 *                 example: 8
 *               puntuacion:
 *                 type: integer
 *                 example: 5
 *               comentario:
 *                 type: string
 *                 nullable: true
 *                 example: "Excelente trabajo, muy puntual y profesional."
 *               fecha_calificacion:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-02-12T18:30:00.000Z"
 *               cliente:
 *                 type: object
 *                 properties:
 *                   id_cliente:
 *                     type: integer
 *                     example: 5
 *                   datos_usuario:
 *                     type: object
 *                     properties:
 *                       nombre:
 *                         type: string
 *                         example: "María Camila"
 *                       apellido:
 *                         type: string
 *                         example: "González Herrera"
 *               servicio:
 *                 type: object
 *                 properties:
 *                   id_servicio:
 *                     type: integer
 *                     example: 12
 *                   valor_total:
 *                     type: number
 *                     example: 180000
 *                   fecha_servicio:
 *                     type: string
 *                     format: date-time
 *                     example: "2026-02-12T14:00:00.000Z"
 *                   subcategoria:
 *                     type: object
 *                     properties:
 *                       id_subcategoria:
 *                         type: integer
 *                         example: 4
 *                       nombre:
 *                         type: string
 *                         example: "Reparación de tuberías"
 *
 *     PromedioTecnicoResponse:
 *       type: object
 *       properties:
 *         id_tecnico:
 *           type: integer
 *           example: 3
 *         prom_calificacion:
 *           type: number
 *           format: float
 *           example: 4.75
 *           description: "Promedio calculado desde la base de datos (0.00 si no hay calificaciones)"
 *         total_calificaciones:
 *           type: integer
 *           example: 12
 *           description: "Total de calificaciones recibidas"
 *         desglose_por_estrellas:
 *           type: object
 *           description: "Conteo de calificaciones por cada nivel de estrellas"
 *           properties:
 *             1:
 *               type: integer
 *               example: 0
 *               description: "Cantidad de calificaciones de 1 estrella"
 *             2:
 *               type: integer
 *               example: 1
 *               description: "Cantidad de calificaciones de 2 estrellas"
 *             3:
 *               type: integer
 *               example: 2
 *               description: "Cantidad de calificaciones de 3 estrellas"
 *             4:
 *               type: integer
 *               example: 4
 *               description: "Cantidad de calificaciones de 4 estrellas"
 *             5:
 *               type: integer
 *               example: 5
 *               description: "Cantidad de calificaciones de 5 estrellas"
 */

// ---------------------------------------------------------------------------
// RUTAS — Orden: estáticas ANTES que dinámicas (:param)
// IMPORTANTE: /tecnico/mi-promedio DEBE ir antes que /tecnico/:id_tecnico
// ---------------------------------------------------------------------------

// POST /api/calificaciones — HU-17: Cliente califica un servicio completado
router.post('/', verifyToken, permitirRoles('Cliente'), crearCalificacion);

// GET /api/calificaciones/tecnico/mi-promedio — Técnico ve sus propias estadísticas
// NOTA: Esta ruta estática DEBE estar ANTES de /tecnico/:id_tecnico para evitar
//       que Express interprete "mi-promedio" como un valor de :id_tecnico.
router.get('/tecnico/mi-promedio', verifyToken, permitirRoles('Tecnico'), obtenerMiCalificacionComoTecnico);

// GET /api/calificaciones/tecnico/:id_tecnico — HU-18: Ver calificaciones de un técnico (paginado)
router.get('/tecnico/:id_tecnico', verifyToken, obtenerCalificacionesTecnico);

// GET /api/calificaciones/servicio/:id_servicio — Ver calificación de un servicio específico
router.get('/servicio/:id_servicio', verifyToken, obtenerCalificacionServicio);

export default router;
