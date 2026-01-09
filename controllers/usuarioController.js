import Usuario from "../models/Usuario.js";
import Rol from "../models/Rol.js";
import TipoDoc from "../models/TipoDoc.js";
import bcrypt from "bcrypt";

// Funcion para obtener todos los usuarios
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

// Post: Funcion para crear un nuevo usuario
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
