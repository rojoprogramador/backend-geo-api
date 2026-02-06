import Usuario from "../models/Usuario.js";
import Rol from "../models/Rol.js";
import TipoDoc from "../models/TipoDoc.js";
import bcrypt from "bcrypt";

/**
 * @swagger
 * /usuarios:
 *   get:
 *     summary: Obtener todos los usuarios del sistema
 *     description: Lista completa de usuarios con sus roles y tipos de documento. **Solo Administradores**.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Usuario'
 *                   - type: object
 *                     properties:
 *                       Rol:
 *                         type: object
 *                         properties:
 *                           descripcion:
 *                             type: string
 *                             example: Administrador
 *                       TipoDoc:
 *                         type: object
 *                         properties:
 *                           descripcion:
 *                             type: string
 *                             example: Cédula de Ciudadanía
 *             example:
 *               - id_usuario: 1
 *                 nombre: Admin
 *                 apellido: Principal
 *                 correo_electronico: admin@geo-api.com
 *                 telefono: "3001234567"
 *                 Rol:
 *                   descripcion: Administrador
 *                 TipoDoc:
 *                   descripcion: Cédula de Ciudadanía
 *               - id_usuario: 2
 *                 nombre: Juan
 *                 apellido: Pérez
 *                 correo_electronico: juan@example.com
 *                 telefono: "3009876543"
 *                 Rol:
 *                   descripcion: Cliente
 *                 TipoDoc:
 *                   descripcion: Cédula de Ciudadanía
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const getUsuarios = async ( req, res ) => {
    try {
        const usuarios = await Usuario.findAll({
            include: [
                { model: Rol, attributes: ['descripcion'] },
                { model: TipoDoc, attributes: ['descripcion'] }
            ],
            attributes: { exclude: ['contraseña'] }
        });

        res.json(usuarios);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};

/**
 * @swagger
 * /usuarios:
 *   post:
 *     summary: Crear un nuevo usuario (Registro público)
 *     description: Endpoint público para registrar nuevos usuarios (Clientes o Técnicos). La contraseña se encripta automáticamente con bcrypt.
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Usuario'
 *           examples:
 *             cliente:
 *               summary: Registro de Cliente
 *               value:
 *                 nombre: María
 *                 apellido: González
 *                 fecha_nacimiento: "1995-03-20"
 *                 correo_electronico: maria.gonzalez@example.com
 *                 telefono: "3101234567"
 *                 contraseña: MiPassword123!
 *                 id_rol: 2
 *                 id_tipoDoc: 1
 *                 num_identificacion: "1098765432"
 *             tecnico:
 *               summary: Registro de Técnico
 *               value:
 *                 nombre: Carlos
 *                 apellido: Ramírez
 *                 fecha_nacimiento: "1988-07-15"
 *                 correo_electronico: carlos.ramirez@example.com
 *                 telefono: "3159876543"
 *                 contraseña: TecnicoPass123!
 *                 id_rol: 3
 *                 id_tipoDoc: 1
 *                 num_identificacion: "1087654321"
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario creado con éxito
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 5
 *                     nombre:
 *                       type: string
 *                       example: María
 *                     correo_electronico:
 *                       type: string
 *                       example: maria.gonzalez@example.com
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: El correo electrónico ya está registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: El correo electrónico ya está registrado
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const createUsuario = async ( req, res ) => {
    try {
        // Extraer datos del cuerpo de la solicitud (body) de la petición
        const {
            nombre, apellido, fecha_nacimiento, correo_electronico, 
            telefono, contraseña, id_rol, id_tipoDoc, num_identificacion
        } = req.body;
        // Encriptar la contraseña antes de guardarla
        const passwordHash = await bcrypt.hash(contraseña, 10); // 10 es el costo de procesamiento

        // Crear el nuevo usuario en la base de datos
        const nuevoUsuario = await Usuario.create({
            nombre,
            apellido,
            fecha_nacimiento,
            correo_electronico,
            telefono,
            contraseña: passwordHash,
            id_rol,
            id_tipoDoc,
            num_identificacion
        });

        // Responder con el usuario creado (sin la contraseña)
        res.status(201).json({
            message: 'Usuario creado con éxito',
            usuario: {
                id: nuevoUsuario.id_usuario,
                nombre: nuevoUsuario.nombre,
                correo_electronico: nuevoUsuario.correo_electronico
            }
        });

    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({ message: 'Error al crear usuario', error: error.message });
    }
};
