import express from 'express';
import { getUsuarios, createUsuario } from '../controllers/usuarioController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Cuando alguien entre a la raíz de esta ruta (GET /), ejecuta getUsuarios
// Ruta para obtener todos los usuarios
//PROTEGEMOS ESTA RUTA CON EL MIDDLEWARE verifyToken
// Se lee: "Verifica token Y LUEGO verifica que sea Administrador"
router.get('/', verifyToken, permitirRoles('Administrador'), getUsuarios);

// Ruta para crear un nuevo usuario (POST /)
// La creación de usuarios la dejamos pública OSEA SIN verifyToken por ahora (para poder registrarse
router.post('/', createUsuario);

export default router;