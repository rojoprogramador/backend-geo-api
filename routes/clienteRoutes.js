import express from 'express';
import { registrarCliente, obtenerPerfilCliente, actualizarPerfilCliente } from '../controllers/clienteController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     RegistroClienteRequest:
 *       type: object
 *       required:
 *         - nombre
 *         - apellido
 *         - correo_electronico
 *         - telefono
 *         - contraseña
 *         - confirmar_contraseña
 *         - num_identificacion
 *         - id_tipoDoc
 *         - fecha_nacimiento
 *         - acepta_terminos
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           example: "María Alejandra"
 *           description: "Solo letras y espacios (incluyendo tildes y ñ)"
 *         apellido:
 *           type: string
 *           minLength: 2
 *           maxLength: 100
 *           example: "González Ospina"
 *           description: "Solo letras y espacios (incluyendo tildes y ñ)"
 *         correo_electronico:
 *           type: string
 *           format: email
 *           example: "maria.gonzalez@example.com"
 *           description: "Correo electrónico único en el sistema"
 *         telefono:
 *           type: string
 *           pattern: "^3[0-9]{9}$"
 *           example: "3101234567"
 *           description: "Número celular colombiano: exactamente 10 dígitos comenzando con 3"
 *         contraseña:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: "MiClave123!"
 *           description: "Mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial"
 *         confirmar_contraseña:
 *           type: string
 *           format: password
 *           example: "MiClave123!"
 *           description: "Debe coincidir exactamente con el campo contraseña"
 *         num_identificacion:
 *           type: string
 *           pattern: "^[0-9]{6,12}$"
 *           example: "1098765432"
 *           description: "Número de documento: solo dígitos, entre 6 y 12 caracteres"
 *         id_tipoDoc:
 *           type: integer
 *           enum: [1, 2, 3]
 *           example: 1
 *           description: "1 = Cédula de Ciudadanía (CC), 2 = Cédula de Extranjería (CE), 3 = Pasaporte"
 *         fecha_nacimiento:
 *           type: string
 *           format: date
 *           example: "1995-03-20"
 *           description: "Fecha de nacimiento en formato ISO 8601 (YYYY-MM-DD)"
 *         acepta_terminos:
 *           type: boolean
 *           example: true
 *           description: "Debe ser true para completar el registro. El usuario acepta los términos y condiciones."
 *         id_ciudad:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *           description: "ID de la ciudad de residencia del cliente (opcional)"
 *
 *     RegistroClienteResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "¡Bienvenido a Geo-API! Tu cuenta de cliente ha sido creada exitosamente."
 *         data:
 *           type: object
 *           properties:
 *             id_usuario:
 *               type: integer
 *               example: 12
 *               description: "ID interno del registro en la tabla Usuario"
 *             id_cliente:
 *               type: integer
 *               example: 8
 *               description: "ID interno del registro en la tabla Cliente"
 *             nombre:
 *               type: string
 *               example: "María Alejandra"
 *             apellido:
 *               type: string
 *               example: "González Ospina"
 *             correo_electronico:
 *               type: string
 *               format: email
 *               example: "maria.gonzalez@example.com"
 *             telefono:
 *               type: string
 *               example: "3101234567"
 *             rol:
 *               type: string
 *               example: "Cliente"
 *               description: "Rol asignado automáticamente"
 */

// POST /api/clientes/registro — Endpoint público, sin autenticación
router.post('/registro', registrarCliente);

/**
 * @swagger
 * components:
 *   schemas:
 *     ActualizarPerfilClienteRequest:
 *       type: object
 *       properties:
 *         telefono:
 *           type: string
 *           pattern: "^3[0-9]{9}$"
 *           example: "3209876543"
 *           description: "Número celular colombiano: 10 dígitos comenzando con 3"
 *         correo_electronico:
 *           type: string
 *           format: email
 *           example: "nueva.direccion@example.com"
 *           description: "Nuevo correo electrónico, debe ser único en el sistema"
 *
 *     ActualizarPerfilTecnicoRequest:
 *       type: object
 *       properties:
 *         telefono:
 *           type: string
 *           pattern: "^3[0-9]{9}$"
 *           example: "3001112233"
 *           description: "Número celular colombiano: 10 dígitos comenzando con 3"
 *         correo_electronico:
 *           type: string
 *           format: email
 *           example: "andres.nuevo@example.com"
 *           description: "Nuevo correo electrónico, debe ser único en el sistema"
 *         id_ciudad:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *           description: "ID de la nueva ciudad base del técnico"
 *
 *     CambiarContrasenaRequest:
 *       type: object
 *       required:
 *         - contrasena_actual
 *         - nueva_contrasena
 *         - confirmar_nueva_contrasena
 *       properties:
 *         contrasena_actual:
 *           type: string
 *           format: password
 *           example: "MiClave123!"
 *           description: "Contraseña actual del usuario (para verificación)"
 *         nueva_contrasena:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: "NuevaClave456@"
 *           description: "Nueva contraseña — debe cumplir requisitos de fortaleza"
 *         confirmar_nueva_contrasena:
 *           type: string
 *           format: password
 *           example: "NuevaClave456@"
 *           description: "Debe ser idéntica a nueva_contrasena"
 */

// GET  /api/clientes/perfil — Requiere autenticación como Cliente
router.get('/perfil', verifyToken, obtenerPerfilCliente);

// PUT  /api/clientes/perfil — Requiere autenticación como Cliente
router.put('/perfil', verifyToken, actualizarPerfilCliente);

export default router;
