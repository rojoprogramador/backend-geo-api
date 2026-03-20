import express from 'express';
import { obtenerCiudades } from '../controllers/ciudadController.js';

const router = express.Router();

// GET /api/ciudades — Endpoint público, sin autenticación
router.get('/', obtenerCiudades);

export default router;
