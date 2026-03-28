import express from 'express';
import {
    registrarPushToken,
    obtenerMisNotificaciones,
    marcarComoLeida,
    marcarTodasLeidas,
} from '../controllers/notificacionController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/notificaciones/push-token — Registrar token de Expo
router.post('/push-token', verifyToken, registrarPushToken);

// GET  /api/notificaciones — Listar notificaciones del usuario
router.get('/', verifyToken, obtenerMisNotificaciones);

// PUT  /api/notificaciones/leer-todas — Marcar todas como leídas (estática ANTES de /:id)
router.put('/leer-todas', verifyToken, marcarTodasLeidas);

// PUT  /api/notificaciones/:id/leer — Marcar una como leída
router.put('/:id/leer', verifyToken, marcarComoLeida);

export default router;
