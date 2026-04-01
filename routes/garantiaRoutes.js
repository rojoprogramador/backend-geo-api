import express from 'express';
import { 
    obtenerGarantiaPorServicio, 
    obtenerMisGarantiasCliente, 
    obtenerMisGarantiasTecnico 
} from '../controllers/garantiaController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Garantias
 *   description: Consultar garantías de servicios completados
 */

// Todas las rutas requieren token
router.use(verifyToken);

// GET /api/garantias/cliente — Cliente ve sus propias garantías
router.get('/cliente', permitirRoles('CLIENTE'), obtenerMisGarantiasCliente);

// GET /api/garantias/tecnico — Técnico ve sus garantías emitidas
router.get('/tecnico', permitirRoles('TECNICO'), obtenerMisGarantiasTecnico);

// GET /api/garantias/servicio/:id_servicio — Detalle de garantía por servicio
router.get('/servicio/:id_servicio', obtenerGarantiaPorServicio);

export default router;
