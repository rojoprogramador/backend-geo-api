import bcrypt from 'bcrypt';
import { sequelize, Usuario, Cliente, Rol, TipoDoc } from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, ConflictError, NotFoundError, ForbiddenError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Expresiones regulares de validación (HU-01)
// ---------------------------------------------------------------------------
const REGEX_NOMBRE    = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]{5,100}$/;
const REGEX_DOCUMENTO = /^\d{6,12}$/;
const REGEX_CORREO    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO  = /^3\d{9}$/;          // 10 dígitos que empiezan con 3
const REGEX_FECHA     = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida la fortaleza de la contraseña:
 * mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial.
 * @param {string} password
 * @returns {boolean}
 */
const esContrasenaFuerte = (password) => {
    if (!password || password.length < 8) return false;
    const tieneUpper   = /[A-Z]/.test(password);
    const tieneLower   = /[a-z]/.test(password);
    const tieneNumero  = /[0-9]/.test(password);
    const tieneEsp     = /[^A-Za-z0-9]/.test(password);
    return tieneUpper && tieneLower && tieneNumero && tieneEsp;
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /clientes/registro:
 *   post:
 *     summary: Registrar un nuevo cliente en la plataforma
 *     description: |
 *       Endpoint **público** (sin autenticación) para registrar un nuevo usuario
 *       con rol Cliente.
 *
 *       **Proceso interno:**
 *       1. Valida todos los campos de entrada.
 *       2. Verifica que el correo y el número de documento no estén ya registrados.
 *       3. Localiza el rol `Cliente` en la base de datos.
 *       4. Hashea la contraseña con bcrypt (cost 10).
 *       5. Crea `Usuario` y `Cliente` en una transacción atómica.
 *       6. Retorna los datos públicos del nuevo cliente (sin contraseña).
 *
 *       **Reglas de validación:**
 *       - `nombre`: letras y espacios (incluyendo tildes/ñ), entre 5 y 100 caracteres.
 *       - `apellido`: letras y espacios (incluyendo tildes/ñ), entre 5 y 100 caracteres.
 *       - `num_identificacion`: solo dígitos, entre 6 y 12 dígitos.
 *       - `correo_electronico`: formato de email válido, único en el sistema.
 *       - `telefono`: exactamente 10 dígitos comenzando con `3` (ej: `3001234567`).
 *       - `contraseña`: mínimo 8 caracteres, al menos 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial.
 *       - `confirmar_contraseña`: debe coincidir exactamente con `contraseña`.
 *       - `acepta_terminos`: debe ser `true`.
 *       - `id_tipoDoc`: ID del tipo de documento (1=CC, 2=CE, 3=Pasaporte).
 *       - `fecha_nacimiento`: formato ISO `YYYY-MM-DD`.
 *     tags: [Clientes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegistroClienteRequest'
 *           examples:
 *             cliente_cali:
 *               summary: Cliente de Cali con cédula
 *               value:
 *                 nombre: María Alejandra
 *                 apellido: González Ospina
 *                 correo_electronico: maria.gonzalez@example.com
 *                 telefono: "3101234567"
 *                 contraseña: "MiClave123!"
 *                 confirmar_contraseña: "MiClave123!"
 *                 num_identificacion: "1098765432"
 *                 id_tipoDoc: 1
 *                 fecha_nacimiento: "1995-03-20"
 *                 acepta_terminos: true
 *             cliente_medellin_ce:
 *               summary: Cliente con cédula de extranjería
 *               value:
 *                 nombre: Carlos Eduardo
 *                 apellido: Ramírez Torres
 *                 correo_electronico: carlos.ramirez@example.com
 *                 telefono: "3209876543"
 *                 contraseña: "Segur0Pass!"
 *                 confirmar_contraseña: "Segur0Pass!"
 *                 num_identificacion: "987654"
 *                 id_tipoDoc: 2
 *                 fecha_nacimiento: "1988-07-15"
 *                 acepta_terminos: true
 *     responses:
 *       201:
 *         description: Cliente registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegistroClienteResponse'
 *             example:
 *               success: true
 *               message: "Cliente registrado exitosamente. ¡Bienvenido a Geo-API!"
 *               data:
 *                 id_usuario: 12
 *                 id_cliente: 8
 *                 nombre: María Alejandra
 *                 apellido: González Ospina
 *                 correo_electronico: maria.gonzalez@example.com
 *                 telefono: "3101234567"
 *                 rol: Cliente
 *       400:
 *         description: Error de validación en los campos enviados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               contrasena_debil:
 *                 summary: Contraseña sin fortaleza suficiente
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "La contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial"
 *               contrasenas_no_coinciden:
 *                 summary: Las contraseñas no coinciden
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "La contraseña y su confirmación no coinciden"
 *               terminos_no_aceptados:
 *                 summary: Términos y condiciones no aceptados
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "Debe aceptar los términos y condiciones para registrarse"
 *               campos_faltantes:
 *                 summary: Campos requeridos ausentes
 *                 value:
 *                   success: false
 *                   message: "Error de validación"
 *                   errors:
 *                     - "El campo nombre es requerido"
 *                     - "El campo correo_electronico es requerido"
 *       409:
 *         description: Conflicto — el correo o número de documento ya están registrados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               correo_duplicado:
 *                 summary: Correo ya registrado
 *                 value:
 *                   success: false
 *                   message: "El correo electrónico ya está registrado en el sistema"
 *               documento_duplicado:
 *                 summary: Número de documento ya registrado
 *                 value:
 *                   success: false
 *                   message: "El número de identificación ya está registrado en el sistema"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const registrarCliente = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body
        // ----------------------------------------------------------------
        const {
            nombre,
            apellido,
            correo_electronico,
            telefono,
            contraseña,
            confirmar_contraseña,
            num_identificacion,
            id_tipoDoc,
            fecha_nacimiento,
            acepta_terminos,
        } = req.body;

        // ----------------------------------------------------------------
        // 2. Validaciones de campos requeridos (presencia)
        // ----------------------------------------------------------------
        const camposFaltantes = [];
        if (!nombre)              camposFaltantes.push('El campo nombre es requerido');
        if (!apellido)            camposFaltantes.push('El campo apellido es requerido');
        if (!correo_electronico)  camposFaltantes.push('El campo correo_electronico es requerido');
        if (!telefono)            camposFaltantes.push('El campo telefono es requerido');
        if (!contraseña)          camposFaltantes.push('El campo contraseña es requerido');
        if (!confirmar_contraseña)camposFaltantes.push('El campo confirmar_contraseña es requerido');
        if (!num_identificacion)  camposFaltantes.push('El campo num_identificacion es requerido');
        if (!id_tipoDoc)          camposFaltantes.push('El campo id_tipoDoc es requerido');
        if (!fecha_nacimiento)    camposFaltantes.push('El campo fecha_nacimiento es requerido');

        if (camposFaltantes.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', camposFaltantes);
        }

        // ----------------------------------------------------------------
        // 3. Validaciones de formato y reglas de negocio
        // ----------------------------------------------------------------
        const erroresFormato = [];

        if (!REGEX_NOMBRE.test(nombre.trim())) {
            erroresFormato.push('El nombre solo puede contener letras y espacios, entre 5 y 100 caracteres');
        }

        if (!REGEX_NOMBRE.test(apellido.trim())) {
            erroresFormato.push('El apellido solo puede contener letras y espacios, entre 5 y 100 caracteres');
        }

        if (!REGEX_CORREO.test(correo_electronico)) {
            erroresFormato.push('El correo electrónico no tiene un formato válido');
        }

        if (!REGEX_TELEFONO.test(telefono)) {
            erroresFormato.push('El teléfono debe tener exactamente 10 dígitos y comenzar con 3 (ej: 3001234567)');
        }

        if (!REGEX_DOCUMENTO.test(String(num_identificacion))) {
            erroresFormato.push('El número de identificación debe contener entre 6 y 12 dígitos');
        }

        if (!REGEX_FECHA.test(fecha_nacimiento)) {
            erroresFormato.push('La fecha de nacimiento debe tener el formato YYYY-MM-DD');
        }

        if (!esContrasenaFuerte(contraseña)) {
            erroresFormato.push(
                'La contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial'
            );
        }

        if (contraseña !== confirmar_contraseña) {
            erroresFormato.push('La contraseña y su confirmación no coinciden');
        }

        if (acepta_terminos !== true) {
            erroresFormato.push('Debe aceptar los términos y condiciones para registrarse');
        }

        if (erroresFormato.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', erroresFormato);
        }

        // ----------------------------------------------------------------
        // 4. Verificar que el tipo de documento exista
        // ----------------------------------------------------------------
        const tipoDocExistente = await TipoDoc.findByPk(id_tipoDoc, { transaction: t });
        if (!tipoDocExistente) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                `El tipo de documento con id ${id_tipoDoc} no existe`
            ]);
        }

        // ----------------------------------------------------------------
        // 5. Verificar unicidad de correo y documento ANTES de insertar
        //    para devolver mensajes de error específicos al usuario
        // ----------------------------------------------------------------
        const correoExistente = await Usuario.findOne({
            where: { correo_electronico },
            transaction: t,
        });
        if (correoExistente) {
            await t.rollback();
            throw new ConflictError('El correo electrónico ya está registrado en el sistema');
        }

        const documentoExistente = await Usuario.findOne({
            where: { num_identificacion: String(num_identificacion) },
            transaction: t,
        });
        if (documentoExistente) {
            await t.rollback();
            throw new ConflictError('El número de identificación ya está registrado en el sistema');
        }

        // ----------------------------------------------------------------
        // 6. Obtener el id del rol 'Cliente' desde la tabla Rol
        //    El campo se llama 'descripcion' en nuestra base de datos
        // ----------------------------------------------------------------
        const rolCliente = await Rol.findOne({
            where: { descripcion: 'Cliente' },
            transaction: t,
        });

        if (!rolCliente) {
            // Esto no debería ocurrir en producción si los seeders están aplicados,
            // pero es un error de configuración del servidor, no del cliente.
            await t.rollback();
            logger.error('registrarCliente: El rol "Cliente" no existe en la tabla Rol');
            throw new Error('Configuración de roles incorrecta en el servidor');
        }

        // ----------------------------------------------------------------
        // 7. Hashear la contraseña (cost 10, igual que createUsuario)
        // ----------------------------------------------------------------
        const contraseñaHash = await bcrypt.hash(contraseña, 10);

        // ----------------------------------------------------------------
        // 8. Crear el Usuario dentro de la transacción
        // ----------------------------------------------------------------
        const nuevoUsuario = await Usuario.create(
            {
                nombre:           nombre.trim(),
                apellido:         apellido.trim(),
                correo_electronico,
                telefono,
                contraseña:       contraseñaHash,
                num_identificacion: String(num_identificacion),
                id_rol:           rolCliente.id_rol,
                id_tipoDoc,
                fecha_nacimiento,
            },
            { transaction: t }
        );

        logger.info(`registrarCliente: Usuario creado con id ${nuevoUsuario.id_usuario} — correo: ${correo_electronico}`);

        // ----------------------------------------------------------------
        // 9. Crear el perfil Cliente vinculado al Usuario
        // ----------------------------------------------------------------
        const nuevoCliente = await Cliente.create(
            { id_usuario: nuevoUsuario.id_usuario },
            { transaction: t }
        );

        logger.info(`registrarCliente: Perfil Cliente creado con id ${nuevoCliente.id_cliente} para usuario ${nuevoUsuario.id_usuario}`);

        // ----------------------------------------------------------------
        // 10. Confirmar la transacción
        // ----------------------------------------------------------------
        await t.commit();

        return res.status(201).json({
            success: true,
            message: '¡Bienvenido a Geo-API! Tu cuenta de cliente ha sido creada exitosamente.',
            data: {
                id_usuario:          nuevoUsuario.id_usuario,
                id_cliente:          nuevoCliente.id_cliente,
                nombre:              nuevoUsuario.nombre,
                apellido:            nuevoUsuario.apellido,
                correo_electronico:  nuevoUsuario.correo_electronico,
                telefono:            nuevoUsuario.telefono,
                rol:                 rolCliente.descripcion,
            },
        });

    } catch (error) {
        // Solo hacer rollback si la transacción aún no fue revertida ni confirmada
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /clientes/perfil:
 *   get:
 *     summary: Obtener perfil del cliente autenticado (HU-05)
 *     description: |
 *       Retorna los datos completos del perfil del cliente que realiza la petición.
 *       El cliente se identifica a través del token JWT.
 *
 *       **Datos retornados:**
 *       - Datos del Usuario: nombre, apellido, correo_electronico, telefono, num_identificacion, fecha_nacimiento
 *       - Datos del perfil Cliente: id_cliente
 *       - Tipo de documento: descripcion
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del cliente obtenido exitosamente
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
 *                   example: "Perfil obtenido exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_cliente:
 *                       type: integer
 *                       example: 8
 *                     id_usuario:
 *                       type: integer
 *                       example: 12
 *                     nombre:
 *                       type: string
 *                       example: "María Alejandra"
 *                     apellido:
 *                       type: string
 *                       example: "González Ospina"
 *                     correo_electronico:
 *                       type: string
 *                       format: email
 *                       example: "maria.gonzalez@example.com"
 *                     telefono:
 *                       type: string
 *                       example: "3101234567"
 *                     num_identificacion:
 *                       type: string
 *                       example: "1098765432"
 *                     fecha_nacimiento:
 *                       type: string
 *                       format: date
 *                       example: "1995-03-20"
 *                     tipo_documento:
 *                       type: string
 *                       example: "CC"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerPerfilCliente = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Verificar que el usuario autenticado tiene rol Cliente
        // ----------------------------------------------------------------
        if (req.usuario.rol !== 'Cliente') {
            throw new ForbiddenError('Esta ruta es exclusiva para clientes');
        }

        // ----------------------------------------------------------------
        // 2. Buscar el registro Cliente vinculado al id_usuario del token
        // ----------------------------------------------------------------
        const cliente = await Cliente.findOne({
            where: { id_usuario: req.usuario.id_usuario },
            include: [
                {
                    model: Usuario,
                    as: 'datos_usuario',
                    attributes: [
                        'id_usuario',
                        'nombre',
                        'apellido',
                        'correo_electronico',
                        'telefono',
                        'num_identificacion',
                        'fecha_nacimiento',
                    ],
                    include: [
                        {
                            model: TipoDoc,
                            attributes: ['descripcion'],
                        },
                    ],
                },
            ],
        });

        if (!cliente) {
            throw new NotFoundError('No se encontró el perfil de cliente asociado a este usuario');
        }

        logger.info(`obtenerPerfilCliente: Perfil consultado para id_usuario ${req.usuario.id_usuario}`);

        const usuario = cliente.datos_usuario;

        return res.status(200).json({
            success: true,
            message: 'Perfil obtenido exitosamente',
            data: {
                id_cliente:          cliente.id_cliente,
                id_usuario:          usuario.id_usuario,
                nombre:              usuario.nombre,
                apellido:            usuario.apellido,
                correo_electronico:  usuario.correo_electronico,
                telefono:            usuario.telefono,
                num_identificacion:  usuario.num_identificacion,
                fecha_nacimiento:    usuario.fecha_nacimiento,
                tipo_documento:      usuario.TipoDoc?.descripcion ?? null,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /clientes/perfil:
 *   put:
 *     summary: Actualizar perfil del cliente autenticado (HU-05)
 *     description: |
 *       Permite al cliente autenticado actualizar sus datos editables.
 *
 *       **Campos editables:**
 *       - `telefono`: número celular colombiano (10 dígitos comenzando con 3)
 *       - `correo_electronico`: debe ser un email válido y no estar en uso por otro usuario
 *
 *       **Campos de solo lectura (no se pueden cambiar):**
 *       - `nombre`, `apellido`, `num_identificacion`, `fecha_nacimiento`, `id_tipoDoc`
 *
 *       **Reglas de negocio:**
 *       - Al menos uno de los dos campos debe estar presente en el body.
 *       - Si se envía `correo_electronico`, se verifica que no esté registrado en otro usuario.
 *       - La operación se realiza dentro de una transacción Sequelize.
 *     tags: [Clientes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               telefono:
 *                 type: string
 *                 pattern: "^3[0-9]{9}$"
 *                 example: "3209876543"
 *                 description: "Número celular colombiano: 10 dígitos comenzando con 3"
 *               correo_electronico:
 *                 type: string
 *                 format: email
 *                 example: "nueva.direccion@example.com"
 *                 description: "Nuevo correo electrónico, debe ser único en el sistema"
 *           examples:
 *             solo_telefono:
 *               summary: Actualizar solo teléfono
 *               value:
 *                 telefono: "3209876543"
 *             solo_correo:
 *               summary: Actualizar solo correo
 *               value:
 *                 correo_electronico: "nueva.direccion@example.com"
 *             ambos_campos:
 *               summary: Actualizar teléfono y correo
 *               value:
 *                 telefono: "3001112233"
 *                 correo_electronico: "maria.nueva@example.com"
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
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
 *                   example: "Perfil actualizado exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_usuario:
 *                       type: integer
 *                       example: 12
 *                     correo_electronico:
 *                       type: string
 *                       example: "nueva.direccion@example.com"
 *                     telefono:
 *                       type: string
 *                       example: "3209876543"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: El nuevo correo electrónico ya está en uso por otro usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "El correo electrónico ya está registrado en el sistema"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const actualizarPerfilCliente = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Verificar rol
        // ----------------------------------------------------------------
        if (req.usuario.rol !== 'Cliente') {
            await t.rollback();
            throw new ForbiddenError('Esta ruta es exclusiva para clientes');
        }

        // ----------------------------------------------------------------
        // 2. Extraer únicamente los campos editables del body
        //    (nombre, apellido, num_identificacion son de solo lectura)
        // ----------------------------------------------------------------
        const { telefono, correo_electronico } = req.body;

        // ----------------------------------------------------------------
        // 3. Verificar que al menos un campo editable fue enviado
        // ----------------------------------------------------------------
        if (!telefono && !correo_electronico) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'Debe enviar al menos un campo para actualizar: telefono o correo_electronico',
            ]);
        }

        // ----------------------------------------------------------------
        // 4. Validar formato de los campos presentes
        // ----------------------------------------------------------------
        const erroresFormato = [];

        if (telefono !== undefined && !REGEX_TELEFONO.test(telefono)) {
            erroresFormato.push(
                'El teléfono debe tener exactamente 10 dígitos y comenzar con 3 (ej: 3001234567)'
            );
        }

        if (correo_electronico !== undefined && !REGEX_CORREO.test(correo_electronico)) {
            erroresFormato.push('El correo electrónico no tiene un formato válido');
        }

        if (erroresFormato.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', erroresFormato);
        }

        // ----------------------------------------------------------------
        // 5. Verificar que el Cliente existe
        // ----------------------------------------------------------------
        const cliente = await Cliente.findOne({
            where: { id_usuario: req.usuario.id_usuario },
            transaction: t,
        });

        if (!cliente) {
            await t.rollback();
            throw new NotFoundError('No se encontró el perfil de cliente asociado a este usuario');
        }

        // ----------------------------------------------------------------
        // 6. Si se está cambiando el correo, verificar que no esté en uso
        //    por un usuario diferente al actual
        // ----------------------------------------------------------------
        if (correo_electronico) {
            const correoDuplicado = await Usuario.findOne({
                where: { correo_electronico },
                transaction: t,
            });

            if (correoDuplicado && correoDuplicado.id_usuario !== req.usuario.id_usuario) {
                await t.rollback();
                throw new ConflictError('El correo electrónico ya está registrado en el sistema');
            }
        }

        // ----------------------------------------------------------------
        // 7. Construir objeto de actualización solo con campos presentes
        // ----------------------------------------------------------------
        const camposActualizar = {};
        if (telefono)            camposActualizar.telefono           = telefono;
        if (correo_electronico)  camposActualizar.correo_electronico = correo_electronico;

        // ----------------------------------------------------------------
        // 8. Actualizar el Usuario dentro de la transacción
        // ----------------------------------------------------------------
        await Usuario.update(camposActualizar, {
            where: { id_usuario: req.usuario.id_usuario },
            transaction: t,
        });

        await t.commit();

        // Recuperar datos actualizados para la respuesta
        const usuarioActualizado = await Usuario.findByPk(req.usuario.id_usuario, {
            attributes: ['id_usuario', 'correo_electronico', 'telefono'],
        });

        logger.info(
            `actualizarPerfilCliente: Perfil actualizado para id_usuario ${req.usuario.id_usuario} — campos: ${Object.keys(camposActualizar).join(', ')}`
        );

        return res.status(200).json({
            success: true,
            message: 'Perfil actualizado exitosamente',
            data: {
                id_usuario:         usuarioActualizado.id_usuario,
                correo_electronico: usuarioActualizado.correo_electronico,
                telefono:           usuarioActualizado.telefono,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};
