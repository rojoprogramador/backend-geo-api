import Usuario from "../models/Usuario.js";
import Rol from "../models/Rol.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';

dotenv.config();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión en el sistema
 *     description: Autentica un usuario mediante correo electrónico y contraseña, retornando un token JWT válido por 24 horas
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             admin:
 *               summary: Login como Administrador
 *               value:
 *                 correo_electronico: admin@geo-api.com
 *                 contraseña: Admin123!
 *             cliente:
 *               summary: Login como Cliente
 *               value:
 *                 correo_electronico: cliente@example.com
 *                 contraseña: Cliente123!
 *             tecnico:
 *               summary: Login como Técnico
 *               value:
 *                 correo_electronico: tecnico@example.com
 *                 contraseña: Tecnico123!
 *     responses:
 *       200:
 *         description: Autenticación exitosa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciales inválidas (usuario no encontrado o contraseña incorrecta)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               usuario_no_encontrado:
 *                 summary: Usuario no existe
 *                 value:
 *                   success: false
 *                   message: Credenciales inválidas, usuario no encontrado
 *               contraseña_incorrecta:
 *                 summary: Contraseña incorrecta
 *                 value:
 *                   success: false
 *                   message: Credenciales inválidas, contraseña incorrecta
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const login = async ( req, res ) => {

    try {
        // 1. Obtener credenciales del cliente
        const {correo_electronico, contraseña} = req.body;

        // 2. Verificar si el usuario existe en la base de datos por su correo electrónico
        const usuario = await Usuario.findOne({
            where: { correo_electronico },
            include:[ { model: Rol, attributes: ['descripcion'] } ],
        });

        if (!usuario) {
            return  res.status(401).json({ message: 'Credenciales inválidas, usuario no encontrado' });
        }
        // 3. Comparar la contraseña proporcionada con la almacenada
        const isPasswordValid = await bcrypt.compare(contraseña, usuario.contraseña);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciales inválidas, contraseña incorrecta' });
        }
        // 4. Generar un token JWT si las credenciales son válidas
        // el token guardará el id y el rol del usuario dentro de su payload
        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                rol: usuario.Rol.descripcion
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            }
        );

        // 5. Responder al cliente con el token
        res.json({
            message: 'Autenticación exitosa',
            token: token,
            usuario: {
                nombre: usuario.nombre,
                rol: usuario.Rol.descripcion
            }
        });
    } catch (error) {
        console.error('Error durante el login:', error);
        res.status(500).json({ message: 'Error interno del servidor durante el login' });
    }
};