import jwt from "jsonwebtoken";
import dotenv from 'dotenv';

dotenv.config();

// 1. Middleware para verificar el token JWT
export const verifyToken = (req, res, next) => {

    //buscamos el token en el header dentro del request
    // el req es un objeto que tiene toda la información de la petición HTTP
    //formato estandar: Bearer <token> 

    const authHeader = req.headers['authorization'];
    
    //si no hay cabecera de autorización adios
    if (!authHeader) {
        return res.status(401).json({ message: 'No se proporcionó token de autenticación' });
    }
    //limpiar el token y obtener solo el valor
    const token = authHeader.split(' ')[1]; // quitamos la palabra 'Bearer '

    // si no hay token adios
    if (!token) {
        return res.status(401).json({ message: 'Formato de token invalido' });
    }

    //verificar el token
    try {
        // 3. Verificamos si el token es real y no ha expirado
        // Usa la misma clave secreta configurada en las variables de entorno
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. Si todo está bien, guardamos los datos del usuario en la petición
        // para que el controlador sepa quién es.
        req.usuario = decoded;

        // 5. Pasamos al siguiente middleware o controlador pase adelante
        next();

    } catch (error) {
        console.error('Error al verificar el token:', error);
        return res.status(401).json({ message: 'Token inválido o expirado' }); 
    }
}
// Nueva función: Recibe una lista de roles permitidos (ej: 'Administrador', 'Técnico')
export const permitirRoles = (...rolesPermitidos) =>{
    return (req, res, next) => {
        //req.usuario.rol viene del middleware verifyToken que se ejecuta antes y req.usuario se llena ahí

        if (!req.usuario || !req.usuario.rol) {
            return res.status(500).json({ message: 'Error: No se encontró el rol del usuario en la petición' });
        }

        // Verificar si el rol del usuario está en la lista de roles permitidos
        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ message: 'Acceso denegado: No tienes permiso para realizar esta acción' });
        }
        // Si el rol es permitido, continuar
        next();

    };
};