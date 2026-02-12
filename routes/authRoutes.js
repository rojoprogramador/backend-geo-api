import express from 'express';
import { login, cambiarContrasena } from '../controllers/authController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/auth/login — Endpoint público, sin autenticación
router.post('/login', login);

// PUT /api/auth/cambiar-contrasena — Requiere autenticación (cualquier rol)
router.put('/cambiar-contrasena', verifyToken, cambiarContrasena);

export default router;