import express from 'express';
import {
    obtenerSubcategorias,
    obtenerSubcategoriaPorId,
    crearSubcategoria,
    actualizarSubcategoria,
    eliminarSubcategoria,
} from '../controllers/subcategoriaController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CrearSubcategoriaRequest:
 *       type: object
 *       required:
 *         - nombre
 *         - id_categoria
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           example: "Reparación de tuberías"
 *           description: "Nombre único dentro de la categoría. Solo letras, números, tildes, ñ y espacios."
 *         descripcion:
 *           type: string
 *           maxLength: 300
 *           example: "Detección y reparación de fugas en tuberías de agua fría y caliente"
 *           description: "Descripción opcional del servicio (máximo 300 caracteres)"
 *         id_categoria:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *           description: "ID de la categoría padre a la que pertenece esta subcategoría"
 *         activo:
 *           type: boolean
 *           default: true
 *           example: true
 *           description: "Estado activo/inactivo de la subcategoría. Por defecto true."
 *
 *     ActualizarSubcategoriaRequest:
 *       type: object
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           example: "Detección de fugas"
 *           description: "Nuevo nombre, único dentro de la categoría destino"
 *         descripcion:
 *           type: string
 *           maxLength: 300
 *           example: "Servicio especializado en detección de fugas con equipos de presión"
 *           description: "Nueva descripción (máximo 300 caracteres). Enviar null para borrarla."
 *         id_categoria:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *           description: "ID de la nueva categoría padre (mover la subcategoría)"
 *         activo:
 *           type: boolean
 *           example: false
 *           description: "Nuevo estado activo/inactivo"
 */

// ---------------------------------------------------------------------------
// GET /api/subcategorias — Público (clientes necesitan listar servicios)
// ---------------------------------------------------------------------------
router.get('/', obtenerSubcategorias);

// ---------------------------------------------------------------------------
// GET /api/subcategorias/:id — Público
// ---------------------------------------------------------------------------
router.get('/:id', obtenerSubcategoriaPorId);

// ---------------------------------------------------------------------------
// POST /api/subcategorias — Solo Administradores
// ---------------------------------------------------------------------------
router.post('/', verifyToken, permitirRoles('ADMINISTRADOR'), crearSubcategoria);

// ---------------------------------------------------------------------------
// PUT /api/subcategorias/:id — Solo Administradores
// ---------------------------------------------------------------------------
router.put('/:id', verifyToken, permitirRoles('ADMINISTRADOR'), actualizarSubcategoria);

// ---------------------------------------------------------------------------
// DELETE /api/subcategorias/:id — Solo Administradores
// ---------------------------------------------------------------------------
router.delete('/:id', verifyToken, permitirRoles('ADMINISTRADOR'), eliminarSubcategoria);

export default router;
