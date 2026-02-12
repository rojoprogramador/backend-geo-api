import express from 'express';
import {
    obtenerCategorias,
    obtenerCategoriaPorId,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
} from '../controllers/categoriaController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CrearCategoriaRequest:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           example: "Plomería"
 *           description: "Nombre único de la categoría. Solo letras, números, tildes, ñ y espacios."
 *         descripcion:
 *           type: string
 *           maxLength: 200
 *           example: "Servicios de instalación y reparación de tuberías, grifería y sistemas hidráulicos"
 *           description: "Descripción opcional de la categoría (máximo 200 caracteres)"
 *         activo:
 *           type: boolean
 *           default: true
 *           example: true
 *           description: "Estado activo/inactivo de la categoría. Por defecto true."
 *
 *     ActualizarCategoriaRequest:
 *       type: object
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *           example: "Fontanería"
 *           description: "Nuevo nombre único de la categoría"
 *         descripcion:
 *           type: string
 *           maxLength: 200
 *           example: "Servicios hidráulicos para viviendas y comercios"
 *           description: "Nueva descripción (máximo 200 caracteres). Enviar null para borrarla."
 *         activo:
 *           type: boolean
 *           example: false
 *           description: "Nuevo estado activo/inactivo"
 */

// ---------------------------------------------------------------------------
// GET /api/categorias — Público (clientes necesitan listar categorías)
// ---------------------------------------------------------------------------
router.get('/', obtenerCategorias);

// ---------------------------------------------------------------------------
// GET /api/categorias/:id — Público
// ---------------------------------------------------------------------------
router.get('/:id', obtenerCategoriaPorId);

// ---------------------------------------------------------------------------
// POST /api/categorias — Solo Administradores
// ---------------------------------------------------------------------------
router.post('/', verifyToken, permitirRoles('Administrador'), crearCategoria);

// ---------------------------------------------------------------------------
// PUT /api/categorias/:id — Solo Administradores
// ---------------------------------------------------------------------------
router.put('/:id', verifyToken, permitirRoles('Administrador'), actualizarCategoria);

// ---------------------------------------------------------------------------
// DELETE /api/categorias/:id — Solo Administradores
// ---------------------------------------------------------------------------
router.delete('/:id', verifyToken, permitirRoles('Administrador'), eliminarCategoria);

export default router;
