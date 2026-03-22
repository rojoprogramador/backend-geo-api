import express from 'express';
import {
    registrarTecnico,
    obtenerPerfilTecnico,
    actualizarPerfilTecnico,
    obtenerTecnicosPendientes,
    obtenerTodosTecnicos,
    obtenerDetalleTecnico,
    aprobarTecnico,
    rechazarTecnico,
    uploadFotoPerfil,
} from '../controllers/tecnicoController.js';
import {
    agregarEspecialidad,
    obtenerMisEspecialidades,
    eliminarEspecialidad,
} from '../controllers/especialidadController.js';
import {
    agregarCiudadOperacion,
    obtenerMisCiudades,
    eliminarCiudadOperacion,
} from '../controllers/ciudadTecnicoController.js';
import { verifyToken, permitirRoles } from '../middleware/authMiddleware.js';
import { uploadFoto } from '../config/multerConfig.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     RegistroTecnicoRequest:
 *       type: object
 *       required:
 *         - nombre
 *         - apellido
 *         - correo_electronico
 *         - telefono
 *         - contrasena
 *         - confirmar_contrasena
 *         - num_identificacion
 *         - id_tipoDoc
 *         - fecha_nacimiento
 *         - acepta_terminos
 *         - id_ciudad
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 5
 *           maxLength: 100
 *           example: "Andres Felipe"
 *           description: "Solo letras y espacios (incluyendo tildes), entre 5 y 100 caracteres"
 *         apellido:
 *           type: string
 *           minLength: 5
 *           maxLength: 100
 *           example: "Martinez Herrera"
 *           description: "Solo letras y espacios (incluyendo tildes), entre 5 y 100 caracteres"
 *         correo_electronico:
 *           type: string
 *           format: email
 *           example: "andres.martinez@example.com"
 *           description: "Correo electronico unico en el sistema"
 *         telefono:
 *           type: string
 *           pattern: "^3[0-9]{9}$"
 *           example: "3156789012"
 *           description: "Numero celular colombiano: exactamente 10 digitos comenzando con 3"
 *         contrasena:
 *           type: string
 *           format: password
 *           minLength: 8
 *           example: "Tecnico123!"
 *           description: "Minimo 8 caracteres, 1 mayuscula, 1 minuscula, 1 numero y 1 caracter especial"
 *         confirmar_contrasena:
 *           type: string
 *           format: password
 *           example: "Tecnico123!"
 *           description: "Debe coincidir exactamente con el campo contrasena"
 *         num_identificacion:
 *           type: string
 *           pattern: "^[0-9]{6,12}$"
 *           example: "1061234567"
 *           description: "Numero de documento: solo digitos, entre 6 y 12 caracteres, unico en el sistema"
 *         id_tipoDoc:
 *           type: integer
 *           enum: [1, 2, 3]
 *           example: 1
 *           description: "1 = Cedula de Ciudadania (CC), 2 = Cedula de Extranjeria (CE), 3 = Pasaporte"
 *         fecha_nacimiento:
 *           type: string
 *           format: date
 *           example: "1990-06-15"
 *           description: "Fecha de nacimiento en formato ISO 8601 (YYYY-MM-DD)"
 *         acepta_terminos:
 *           type: boolean
 *           example: true
 *           description: "Debe ser true para completar el registro"
 *         id_ciudad:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *           description: "ID de la ciudad base del tecnico (debe existir en la tabla Ciudad)"
 *
 *     RegistroTecnicoResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Tu solicitud de registro ha sido recibida y esta pendiente de revision. Un administrador la revisara en un plazo de 24 a 48 horas."
 *         data:
 *           type: object
 *           properties:
 *             id_usuario:
 *               type: integer
 *               example: 15
 *               description: "ID interno del registro en la tabla Usuario"
 *             id_tecnico:
 *               type: integer
 *               example: 7
 *               description: "ID interno del registro en la tabla Tecnico"
 *             nombre:
 *               type: string
 *               example: "Andres Felipe"
 *             apellido:
 *               type: string
 *               example: "Martinez Herrera"
 *             correo_electronico:
 *               type: string
 *               format: email
 *               example: "andres.martinez@example.com"
 *             telefono:
 *               type: string
 *               example: "3156789012"
 *             ciudad:
 *               type: string
 *               example: "Cali"
 *               description: "Nombre de la ciudad base seleccionada"
 *             estado_validacion:
 *               type: string
 *               enum: [PENDIENTE_VALIDACION, ACTIVO, SUSPENDIDO, RECHAZADO]
 *               example: "PENDIENTE_VALIDACION"
 *               description: "Siempre PENDIENTE_VALIDACION en el momento del registro"
 *             rol:
 *               type: string
 *               example: "Tecnico"
 *               description: "Rol asignado automaticamente"
 */

// POST /api/tecnicos/registro — Endpoint publico, sin autenticacion
router.post('/registro', registrarTecnico);

// GET  /api/tecnicos/perfil — Requiere autenticacion como Tecnico
router.get('/perfil', verifyToken, obtenerPerfilTecnico);

// PUT  /api/tecnicos/perfil — Requiere autenticacion como Tecnico
router.put('/perfil', verifyToken, actualizarPerfilTecnico);

// -----------------------------------------------------------------------
// RUTAS DE ADMINISTRACIÓN — HU-24 y HU-25
// IMPORTANTE: las rutas estáticas (/pendientes, /admin/todos) DEBEN declararse ANTES
// que las rutas con parámetro dinámico (/:id) para que Express no
// interprete la cadena "pendientes" o "admin" como un valor de :id.
// -----------------------------------------------------------------------

// GET  /api/tecnicos/pendientes — Lista técnicos con PENDIENTE_VALIDACION (Admin)
router.get('/pendientes', verifyToken, permitirRoles('ADMIN'), obtenerTecnicosPendientes);

// GET  /api/tecnicos/admin/todos — Lista TODOS los técnicos con paginación y filtro (Admin)
router.get('/admin/todos', verifyToken, permitirRoles('ADMIN'), obtenerTodosTecnicos);

// GET  /api/tecnicos/:id — Perfil completo de un técnico para revisión (Admin)
router.get('/:id', verifyToken, permitirRoles('ADMIN'), obtenerDetalleTecnico);

// PUT  /api/tecnicos/:id/aprobar — Aprobar técnico (Admin)
router.put('/:id/aprobar', verifyToken, permitirRoles('ADMIN'), aprobarTecnico);

// PUT  /api/tecnicos/:id/rechazar — Rechazar técnico (Admin)
router.put('/:id/rechazar', verifyToken, permitirRoles('ADMIN'), rechazarTecnico);

// -----------------------------------------------------------------------
// RUTAS DE ESPECIALIDADES — Gestión de servicios del técnico
// -----------------------------------------------------------------------

// POST /api/tecnicos/especialidades — Agregar especialidad al perfil
router.post('/especialidades', verifyToken, permitirRoles('TECNICO'), agregarEspecialidad);

// GET  /api/tecnicos/especialidades — Listar especialidades del técnico
router.get('/especialidades', verifyToken, permitirRoles('TECNICO'), obtenerMisEspecialidades);

// DELETE /api/tecnicos/especialidades/:id — Eliminar especialidad
router.delete('/especialidades/:id', verifyToken, permitirRoles('TECNICO'), eliminarEspecialidad);

// -----------------------------------------------------------------------
// RUTA DE FOTO DE PERFIL — Upload de imagen
// -----------------------------------------------------------------------

// POST /api/tecnicos/foto — Subir foto de perfil (multipart/form-data)
router.post('/foto', verifyToken, uploadFoto.single('foto'), uploadFotoPerfil);

// -----------------------------------------------------------------------
// RUTAS DE CIUDADES DE OPERACIÓN — Zonas donde presta servicios
// -----------------------------------------------------------------------

// POST /api/tecnicos/ciudades — Agregar ciudad de operación
router.post('/ciudades', verifyToken, agregarCiudadOperacion);

// GET  /api/tecnicos/ciudades — Listar ciudades de operación
router.get('/ciudades', verifyToken, obtenerMisCiudades);

// DELETE /api/tecnicos/ciudades/:id — Eliminar ciudad de operación
router.delete('/ciudades/:id', verifyToken, eliminarCiudadOperacion);

export default router;
