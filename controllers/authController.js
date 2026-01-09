import Usuario from "../models/Usuario.js";
import Rol from "../models/Rol.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';

dotenv.config();

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