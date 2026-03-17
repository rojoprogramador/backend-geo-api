import { Usuario, Rol, Tecnico } from '../models/index.js';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from 'dotenv';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, UnauthorizedError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';

dotenv.config();

// ---------------------------------------------------------------------------
// Helpers de validación reutilizados en este controlador
// ---------------------------------------------------------------------------

/**
 * Valida la fortaleza de la contraseña:
 * mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial.
 * @param {string} password
 * @returns {boolean}
 */
const esContrasenaFuerte = (password) => {
    if (!password || password.length < 8) return false;
    const tieneUpper  = /[A-Z]/.test(password);
    const tieneLower  = /[a-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    const tieneEsp    = /[^A-Za-z0-9]/.test(password);
    return tieneUpper && tieneLower && tieneNumero && tieneEsp;
};

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
        //    Si es técnico, incluir su perfil para obtener estado_validacion
        const usuario = await Usuario.findOne({
            where: { correo_electronico },
            include: [
                { model: Rol, attributes: ['descripcion'] },
                {
                    model: Tecnico,
                    as: 'perfil_tecnico',
                    attributes: ['estado_validacion', 'disponible_inmediato', 'radio_cobertura_km'],
                    required: false,
                },
            ],
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
        //    Si es técnico, incluir estado_validacion
        const responseUsuario = {
            nombre: usuario.nombre,
            rol: usuario.Rol.descripcion,
        };

        // Agregar campos del perfil técnico si es técnico
        if (usuario.Rol.descripcion === 'TECNICO' && usuario.perfil_tecnico) {
            responseUsuario.estado_validacion  = usuario.perfil_tecnico.estado_validacion;
            responseUsuario.disponible_inmediato = usuario.perfil_tecnico.disponible_inmediato;
            responseUsuario.radio_cobertura_km  = usuario.perfil_tecnico.radio_cobertura_km;
        }

        res.json({
            message: 'Autenticación exitosa',
            token: token,
            usuario: responseUsuario,
        });
    } catch (error) {
        console.error('Error durante el login:', error);
        res.status(500).json({ message: 'Error interno del servidor durante el login' });
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /auth/cambiar-contrasena:
 *   put:
 *     summary: Cambiar contraseña del usuario autenticado (HU-07 / HU-08)
 *     description: |
 *       Permite a cualquier usuario autenticado (Cliente o Técnico) actualizar su contraseña.
 *
 *       **Proceso interno:**
 *       1. Recupera el usuario de la base de datos usando el `id_usuario` del token JWT.
 *       2. Verifica que `contrasena_actual` coincida con el hash almacenado (bcrypt.compare).
 *       3. Valida que `nueva_contrasena` cumpla los requisitos de fortaleza.
 *       4. Verifica que `confirmar_nueva_contrasena` sea idéntica a `nueva_contrasena`.
 *       5. Verifica que `nueva_contrasena` sea diferente a `contrasena_actual`.
 *       6. Hashea la nueva contraseña con bcrypt (cost 10) y actualiza el registro.
 *
 *       **Requisitos de fortaleza para la nueva contraseña:**
 *       - Mínimo 8 caracteres
 *       - Al menos 1 letra mayúscula
 *       - Al menos 1 letra minúscula
 *       - Al menos 1 dígito numérico
 *       - Al menos 1 carácter especial (ej: !, @, #, $, %)
 *     tags: [Autenticación]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contrasena_actual
 *               - nueva_contrasena
 *               - confirmar_nueva_contrasena
 *             properties:
 *               contrasena_actual:
 *                 type: string
 *                 format: password
 *                 example: "MiClave123!"
 *                 description: "Contraseña actual del usuario (para verificación)"
 *               nueva_contrasena:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: "NuevaClave456@"
 *                 description: "Nueva contraseña — debe cumplir los requisitos de fortaleza"
 *               confirmar_nueva_contrasena:
 *                 type: string
 *                 format: password
 *                 example: "NuevaClave456@"
 *                 description: "Debe ser idéntica a nueva_contrasena"
 *           examples:
 *             cambio_exitoso:
 *               summary: Cambio de contraseña válido
 *               value:
 *                 contrasena_actual: "MiClave123!"
 *                 nueva_contrasena: "NuevaClave456@"
 *                 confirmar_nueva_contrasena: "NuevaClave456@"
 *             confirmacion_incorrecta:
 *               summary: Confirmación no coincide (error esperado)
 *               value:
 *                 contrasena_actual: "MiClave123!"
 *                 nueva_contrasena: "NuevaClave456@"
 *                 confirmar_nueva_contrasena: "OtraClave789#"
 *     responses:
 *       200:
 *         description: Contraseña actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Contraseña actualizada exitosamente"
 *       400:
 *         description: Error de validación en los campos enviados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               campos_faltantes:
 *                 summary: Campos requeridos ausentes
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "El campo contrasena_actual es requerido"
 *               contrasena_debil:
 *                 summary: Nueva contraseña sin fortaleza suficiente
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "La nueva contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial"
 *               confirmacion_no_coincide:
 *                 summary: Confirmación no coincide
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "La nueva contraseña y su confirmación no coinciden"
 *               igual_a_actual:
 *                 summary: Nueva contraseña igual a la actual
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "La nueva contraseña no puede ser igual a la contraseña actual"
 *       401:
 *         description: Contraseña actual incorrecta o token inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               contrasena_actual_incorrecta:
 *                 summary: Contraseña actual no coincide
 *                 value:
 *                   success: false
 *                   message: "La contraseña actual es incorrecta"
 *               sin_token:
 *                 summary: Token no proporcionado
 *                 value:
 *                   success: false
 *                   message: "No se proporcionó token de autenticación"
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const cambiarContrasena = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body
        //    Soportamos ambas variantes: con y sin tilde en "contraseña"
        // ----------------------------------------------------------------
        const contrasena_actual           = req.body.contrasena_actual
                                            ?? req.body['contrase\u00f1a_actual'];
        const nueva_contrasena            = req.body.nueva_contrasena
                                            ?? req.body['nueva_contrase\u00f1a'];
        const confirmar_nueva_contrasena  = req.body.confirmar_nueva_contrasena
                                            ?? req.body['confirmar_nueva_contrase\u00f1a'];

        // ----------------------------------------------------------------
        // 2. Validaciones de presencia
        // ----------------------------------------------------------------
        const camposFaltantes = [];
        if (!contrasena_actual)          camposFaltantes.push('El campo contrasena_actual es requerido');
        if (!nueva_contrasena)           camposFaltantes.push('El campo nueva_contrasena es requerido');
        if (!confirmar_nueva_contrasena) camposFaltantes.push('El campo confirmar_nueva_contrasena es requerido');

        if (camposFaltantes.length > 0) {
            throw new ValidationError('Error de validación', camposFaltantes);
        }

        // ----------------------------------------------------------------
        // 3. Validaciones de negocio (orden deliberado: fortaleza → igualdad
        //    entre nuevas → diferencia con actual)
        // ----------------------------------------------------------------
        const erroresNegocio = [];

        if (!esContrasenaFuerte(nueva_contrasena)) {
            erroresNegocio.push(
                'La nueva contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial'
            );
        }

        if (nueva_contrasena !== confirmar_nueva_contrasena) {
            erroresNegocio.push('La nueva contraseña y su confirmación no coinciden');
        }

        if (erroresNegocio.length > 0) {
            throw new ValidationError('Error de validación', erroresNegocio);
        }

        // ----------------------------------------------------------------
        // 4. Recuperar el usuario desde la BD
        //    El token JWT almacena id_usuario (confirmado en authController login)
        // ----------------------------------------------------------------
        const usuario = await Usuario.findByPk(req.usuario.id_usuario);

        if (!usuario) {
            // No debería ocurrir si el token es válido, pero se maneja por seguridad
            throw new UnauthorizedError('Usuario no encontrado. El token puede ser inválido');
        }

        // ----------------------------------------------------------------
        // 5. Verificar que la contraseña actual sea correcta
        //    La columna en BD se llama "contraseña" (con tilde) — ver migración
        // ----------------------------------------------------------------
        const contrasenaActualCorrecta = await bcrypt.compare(
            contrasena_actual,
            usuario['contraseña']
        );

        if (!contrasenaActualCorrecta) {
            throw new UnauthorizedError('La contraseña actual es incorrecta');
        }

        // ----------------------------------------------------------------
        // 6. Verificar que la nueva contraseña sea DIFERENTE a la actual
        //    Se hace DESPUÉS de validar la actual para evitar revelar
        //    información sobre el hash en caso de contraseña actual incorrecta
        // ----------------------------------------------------------------
        const nuevaIgualAActual = await bcrypt.compare(
            nueva_contrasena,
            usuario['contraseña']
        );

        if (nuevaIgualAActual) {
            throw new ValidationError('Error de validación', [
                'La nueva contraseña no puede ser igual a la contraseña actual',
            ]);
        }

        // ----------------------------------------------------------------
        // 7. Hashear la nueva contraseña y actualizar en BD
        // ----------------------------------------------------------------
        const nuevaContrasenaHash = await bcrypt.hash(nueva_contrasena, 10);

        await Usuario.update(
            { 'contraseña': nuevaContrasenaHash },
            { where: { id_usuario: req.usuario.id_usuario } }
        );

        logger.info(
            `cambiarContrasena: Contraseña actualizada para id_usuario ${req.usuario.id_usuario} — rol: ${req.usuario.rol}`
        );

        return res.status(200).json({
            success: true,
            message: 'Contraseña actualizada exitosamente',
        });

    } catch (error) {
        return handleError(res, error);
    }
};