import bcrypt from 'bcrypt';
import {
    sequelize,
    Usuario,
    Tecnico,
    Rol,
    TipoDoc,
    Ciudad,
    CertificadoTecnico,
    Categoria,
    Subcategoria,
    Especialidad,
} from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, ConflictError, NotFoundError, ForbiddenError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';
import { REGEX_NOMBRE, REGEX_DOCUMENTO, REGEX_CORREO, REGEX_TELEFONO, REGEX_FECHA, esContrasenaFuerte } from '../utils/validators.js';
import { obtenerTecnico as buscarPerfilTecnico } from '../utils/profileHelpers.js';

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/registro:
 *   post:
 *     summary: Registrar un nuevo tecnico en la plataforma
 *     description: |
 *       Endpoint **publico** (sin autenticacion) para registrar un nuevo usuario
 *       con rol Tecnico.
 *
 *       **Flujo de negocio:**
 *       1. El tecnico se registra con sus datos personales basicos.
 *       2. La cuenta queda en estado `PENDIENTE_VALIDACION`.
 *       3. Un administrador revisa y aprueba/rechaza la solicitud (HU-24/25).
 *       4. Una vez aprobado, el tecnico puede agregar especialidades, certificados, etc.
 *
 *       **Proceso interno:**
 *       1. Valida todos los campos de entrada.
 *       2. Verifica que el correo y el numero de documento no esten ya registrados.
 *       3. Verifica que la ciudad exista en la base de datos.
 *       4. Localiza el rol `Tecnico` en la base de datos.
 *       5. Hashea la contrasena con bcrypt (cost 10).
 *       6. En una **transaccion atomica** crea: `Usuario` -> `Tecnico`.
 *       7. Retorna un mensaje indicando que la cuenta queda pendiente de revision (24-48 h).
 *
 *       **Nota:** Las especialidades y certificados se registran despues de la aprobacion.
 *     tags: [Tecnicos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegistroTecnicoRequest'
 *           examples:
 *             tecnico_cali:
 *               summary: Tecnico en Cali con CC
 *               value:
 *                 nombre: Andres Felipe
 *                 apellido: Martinez Herrera
 *                 correo_electronico: andres.martinez@example.com
 *                 telefono: "3156789012"
 *                 contrasena: "Tecnico123!"
 *                 confirmar_contrasena: "Tecnico123!"
 *                 num_identificacion: "1061234567"
 *                 id_tipoDoc: 1
 *                 fecha_nacimiento: "1990-06-15"
 *                 acepta_terminos: true
 *                 id_ciudad: 1
 *             tecnico_medellin:
 *               summary: Tecnico en Medellin con CE
 *               value:
 *                 nombre: Luis Carlos
 *                 apellido: Ospina Vargas
 *                 correo_electronico: luis.ospina@example.com
 *                 telefono: "3012345678"
 *                 contrasena: "Electr1co!"
 *                 confirmar_contrasena: "Electr1co!"
 *                 num_identificacion: "654321"
 *                 id_tipoDoc: 2
 *                 fecha_nacimiento: "1985-11-30"
 *                 acepta_terminos: true
 *                 id_ciudad: 2
 *     responses:
 *       201:
 *         description: Tecnico registrado, cuenta pendiente de revision por el administrador
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegistroTecnicoResponse'
 *       400:
 *         description: Error de validacion en los campos enviados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Recurso referenciado no encontrado (ciudad, tipo de documento)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Conflicto — el correo o numero de documento ya estan registrados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const registrarTecnico = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Extraer campos del body (solo datos personales, sin especialidades)
        // ----------------------------------------------------------------
        const {
            nombre,
            apellido,
            correo_electronico,
            telefono,
            contrasena,
            confirmar_contrasena,
            num_identificacion,
            id_tipoDoc,
            fecha_nacimiento,
            acepta_terminos,
            id_ciudad,
        } = req.body;

        // Soporte para ambas variantes del campo contrasena (con y sin tilde)
        const password          = contrasena          ?? req.body['contrase\u00f1a'];
        const confirmarPassword = confirmar_contrasena ?? req.body['confirmar_contrase\u00f1a'];

        // ----------------------------------------------------------------
        // 2. Validaciones de presencia — campos requeridos
        // ----------------------------------------------------------------
        const camposFaltantes = [];

        if (!nombre)                camposFaltantes.push('El campo nombre es requerido');
        if (!apellido)              camposFaltantes.push('El campo apellido es requerido');
        if (!correo_electronico)    camposFaltantes.push('El campo correo_electronico es requerido');
        if (!telefono)              camposFaltantes.push('El campo telefono es requerido');
        if (!password)              camposFaltantes.push('El campo contrasena es requerido');
        if (!confirmarPassword)     camposFaltantes.push('El campo confirmar_contrasena es requerido');
        if (!num_identificacion)    camposFaltantes.push('El campo num_identificacion es requerido');
        if (!id_tipoDoc)            camposFaltantes.push('El campo id_tipoDoc es requerido');
        if (!fecha_nacimiento)      camposFaltantes.push('El campo fecha_nacimiento es requerido');
        if (!id_ciudad)             camposFaltantes.push('El campo id_ciudad es requerido');

        if (camposFaltantes.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validacion', camposFaltantes);
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
            erroresFormato.push('El correo electronico no tiene un formato valido');
        }

        if (!REGEX_TELEFONO.test(telefono)) {
            erroresFormato.push('El telefono debe tener exactamente 10 digitos y comenzar con 3 (ej: 3001234567)');
        }

        if (!REGEX_DOCUMENTO.test(String(num_identificacion))) {
            erroresFormato.push('El numero de identificacion debe contener entre 6 y 12 digitos');
        }

        if (!REGEX_FECHA.test(fecha_nacimiento)) {
            erroresFormato.push('La fecha de nacimiento debe tener el formato YYYY-MM-DD');
        }

        if (!esContrasenaFuerte(password)) {
            erroresFormato.push(
                'La contrasena debe tener minimo 8 caracteres, 1 mayuscula, 1 minuscula, 1 numero y 1 caracter especial'
            );
        }

        if (password !== confirmarPassword) {
            erroresFormato.push('La contrasena y su confirmacion no coinciden');
        }

        if (acepta_terminos !== true) {
            erroresFormato.push('Debe aceptar los terminos y condiciones para registrarse');
        }

        if (!Number.isInteger(Number(id_ciudad)) || Number(id_ciudad) <= 0) {
            erroresFormato.push('El campo id_ciudad debe ser un entero positivo');
        }

        if (erroresFormato.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validacion', erroresFormato);
        }

        // ----------------------------------------------------------------
        // 4. Verificar que el tipo de documento exista
        // ----------------------------------------------------------------
        const tipoDocExistente = await TipoDoc.findByPk(id_tipoDoc, { transaction: t });
        if (!tipoDocExistente) {
            await t.rollback();
            throw new ValidationError('Error de validacion', [
                `El tipo de documento con id ${id_tipoDoc} no existe`
            ]);
        }

        // ----------------------------------------------------------------
        // 5. Verificar unicidad de correo y documento antes de insertar
        // ----------------------------------------------------------------
        const correoExistente = await Usuario.findOne({
            where: { correo_electronico },
            transaction: t,
        });
        if (correoExistente) {
            await t.rollback();
            throw new ConflictError('El correo electronico ya esta registrado en el sistema');
        }

        const documentoExistente = await Usuario.findOne({
            where: { num_identificacion: String(num_identificacion) },
            transaction: t,
        });
        if (documentoExistente) {
            await t.rollback();
            throw new ConflictError('El numero de identificacion ya esta registrado en el sistema');
        }

        // ----------------------------------------------------------------
        // 6. Verificar que la ciudad exista
        // ----------------------------------------------------------------
        const ciudadExistente = await Ciudad.findByPk(id_ciudad, { transaction: t });
        if (!ciudadExistente) {
            await t.rollback();
            throw new NotFoundError(`La ciudad con id ${id_ciudad} no existe en el sistema`);
        }

        // ----------------------------------------------------------------
        // 7. Obtener el id del rol 'Tecnico' desde la tabla Rol
        // ----------------------------------------------------------------
        const rolTecnico = await Rol.findOne({
            where: { descripcion: 'TECNICO' },
            transaction: t,
        });

        if (!rolTecnico) {
            await t.rollback();
            logger.error('registrarTecnico: El rol "TECNICO" no existe en la tabla Rol');
            throw new Error('Configuracion de roles incorrecta en el servidor');
        }

        // ----------------------------------------------------------------
        // 8. Hashear la contrasena (cost 10)
        // ----------------------------------------------------------------
        const contrasenaHash = await bcrypt.hash(password, 10);

        // ----------------------------------------------------------------
        // 9. Crear el Usuario dentro de la transaccion
        // ----------------------------------------------------------------
        const nuevoUsuario = await Usuario.create(
            {
                nombre:             nombre.trim(),
                apellido:           apellido.trim(),
                correo_electronico,
                telefono,
                'contraseña':       contrasenaHash,
                num_identificacion: String(num_identificacion),
                id_rol:             rolTecnico.id_rol,
                id_tipoDoc,
                fecha_nacimiento,
                id_ciudad:          Number(id_ciudad),
            },
            { transaction: t }
        );

        logger.info(
            `registrarTecnico: Usuario creado con id ${nuevoUsuario.id_usuario} — correo: ${correo_electronico}`
        );

        // ----------------------------------------------------------------
        // 10. Crear el perfil Tecnico vinculado al Usuario
        //     Sin especialidades — se agregan despues de la aprobacion admin
        // ----------------------------------------------------------------
        const nuevoTecnico = await Tecnico.create(
            {
                id_usuario:        nuevoUsuario.id_usuario,
                ciudad_base:       Number(id_ciudad),
                estado_validacion: 'PENDIENTE_VALIDACION',
            },
            { transaction: t }
        );

        logger.info(
            `registrarTecnico: Perfil Tecnico creado con id ${nuevoTecnico.id_tecnico} para usuario ${nuevoUsuario.id_usuario}`
        );

        // ----------------------------------------------------------------
        // 11. Confirmar la transaccion
        // ----------------------------------------------------------------
        await t.commit();

        return res.status(201).json({
            success: true,
            message:
                'Tu solicitud de registro ha sido recibida y esta pendiente de revision. ' +
                'Un administrador la revisara en un plazo de 24 a 48 horas. ' +
                'Una vez aprobada, podras configurar tus especialidades y comenzar a recibir solicitudes.',
            data: {
                id_usuario:         nuevoUsuario.id_usuario,
                id_tecnico:         nuevoTecnico.id_tecnico,
                nombre:             nuevoUsuario.nombre,
                apellido:           nuevoUsuario.apellido,
                correo_electronico: nuevoUsuario.correo_electronico,
                telefono:           nuevoUsuario.telefono,
                ciudad:             ciudadExistente.nombre_ciudad,
                estado_validacion:  nuevoTecnico.estado_validacion,
                rol:                rolTecnico.descripcion,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/perfil:
 *   get:
 *     summary: Obtener perfil del técnico autenticado (HU-06)
 *     description: |
 *       Retorna los datos completos del perfil del técnico que realiza la petición.
 *       El técnico se identifica a través del token JWT.
 *
 *       **Datos retornados:**
 *       - Datos del Usuario: nombre, apellido, correo_electronico, telefono, num_identificacion, fecha_nacimiento
 *       - Datos del perfil Técnico: id_tecnico, estado_validacion, prom_calificacion, disponible_inmediato
 *       - Ciudad base: nombre de la ciudad
 *       - Tipo de documento: descripcion
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del técnico obtenido exitosamente
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
 *                     id_tecnico:
 *                       type: integer
 *                       example: 7
 *                     id_usuario:
 *                       type: integer
 *                       example: 15
 *                     nombre:
 *                       type: string
 *                       example: "Andres Felipe"
 *                     apellido:
 *                       type: string
 *                       example: "Martinez Herrera"
 *                     correo_electronico:
 *                       type: string
 *                       format: email
 *                       example: "andres.martinez@example.com"
 *                     telefono:
 *                       type: string
 *                       example: "3156789012"
 *                     num_identificacion:
 *                       type: string
 *                       example: "1061234567"
 *                     fecha_nacimiento:
 *                       type: string
 *                       format: date
 *                       example: "1990-06-15"
 *                     tipo_documento:
 *                       type: string
 *                       example: "CC"
 *                     url_foto:
 *                       type: string
 *                       nullable: true
 *                       example: "/uploads/fotos/tecnico_42_1711034000000.jpg"
 *                     id_ciudad:
 *                       type: integer
 *                       nullable: true
 *                       example: 1
 *                     ciudad_base:
 *                       type: string
 *                       example: "Cali"
 *                       nullable: true
 *                     ciudades_operacion:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_ciudad:
 *                             type: integer
 *                             example: 3
 *                           nombre_ciudad:
 *                             type: string
 *                             example: "Palmira"
 *                     estado_validacion:
 *                       type: string
 *                       enum: [PENDIENTE_VALIDACION, ACTIVO, SUSPENDIDO, RECHAZADO]
 *                       example: "ACTIVO"
 *                     prom_calificacion:
 *                       type: number
 *                       format: float
 *                       example: 4.7
 *                     disponible_inmediato:
 *                       type: boolean
 *                       example: true
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerPerfilTecnico = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Verificar que el usuario autenticado tiene rol Tecnico
        // ----------------------------------------------------------------
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        // ----------------------------------------------------------------
        // 2. Buscar el registro Tecnico vinculado al id_usuario del token
        //    Ciudad usa belongsTo sin alias (ver models/index.js línea 48)
        // ----------------------------------------------------------------
        const tecnico = await Tecnico.findOne({
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
                {
                    model: Ciudad,
                    attributes: ['id_ciudad', 'nombre_ciudad'],
                },
                {
                    model: Ciudad,
                    as: 'ciudades_operacion',
                    attributes: ['id_ciudad', 'nombre_ciudad'],
                    through: { attributes: [] },
                },
            ],
        });

        if (!tecnico) {
            throw new NotFoundError('No se encontró el perfil de técnico asociado a este usuario');
        }

        logger.info(`obtenerPerfilTecnico: Perfil consultado para id_usuario ${req.usuario.id_usuario}`);

        const usuario = tecnico.datos_usuario;

        return res.status(200).json({
            success: true,
            message: 'Perfil obtenido exitosamente',
            data: {
                id_tecnico:          tecnico.id_tecnico,
                id_usuario:          usuario.id_usuario,
                nombre:              usuario.nombre,
                apellido:            usuario.apellido,
                correo_electronico:  usuario.correo_electronico,
                telefono:            usuario.telefono,
                num_identificacion:  usuario.num_identificacion,
                fecha_nacimiento:    usuario.fecha_nacimiento,
                tipo_documento:      usuario.TipoDoc?.descripcion ?? null,
                url_foto:            tecnico.url_foto ?? null,
                id_ciudad:           tecnico.Ciudad?.id_ciudad ?? null,
                ciudad_base:         tecnico.Ciudad?.nombre_ciudad ?? null,
                ciudades_operacion:  tecnico.ciudades_operacion?.map(c => ({
                    id_ciudad: c.id_ciudad,
                    nombre_ciudad: c.nombre_ciudad,
                })) ?? [],
                estado_validacion:   tecnico.estado_validacion,
                prom_calificacion:   tecnico.prom_calificacion,
                disponible_inmediato: tecnico.disponible_inmediato,
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/perfil:
 *   put:
 *     summary: Actualizar perfil del técnico autenticado (HU-06)
 *     description: |
 *       Permite al técnico autenticado actualizar sus datos editables.
 *
 *       **Campos editables:**
 *       - `telefono`: número celular colombiano (10 dígitos comenzando con 3)
 *       - `correo_electronico`: debe ser un email válido y no estar en uso por otro usuario
 *       - `id_ciudad`: ID de la ciudad base (debe existir en la tabla Ciudad)
 *       - `disponible_inmediato`: toggle de jornada (true = disponible para servicios inmediatos)
 *
 *       **Campos de solo lectura (no se pueden cambiar):**
 *       - `nombre`, `apellido`, `num_identificacion`, `fecha_nacimiento`, `id_tipoDoc`
 *       - `estado_validacion` (gestionado exclusivamente por el administrador)
 *
 *       **Reglas de negocio:**
 *       - Al menos uno de los campos editables debe estar presente en el body.
 *       - Si se envía `correo_electronico`, se verifica que no esté registrado en otro usuario.
 *       - Si se envía `id_ciudad`, se verifica que la ciudad exista en la base de datos.
 *       - La operación se realiza dentro de una transacción Sequelize.
 *     tags: [Tecnicos]
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
 *                 example: "3001112233"
 *                 description: "Número celular colombiano: 10 dígitos comenzando con 3"
 *               correo_electronico:
 *                 type: string
 *                 format: email
 *                 example: "andres.nuevo@example.com"
 *                 description: "Nuevo correo electrónico, debe ser único en el sistema"
 *               id_ciudad:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *                 description: "ID de la nueva ciudad base del técnico"
 *               disponible_inmediato:
 *                 type: boolean
 *                 example: true
 *                 description: "Toggle de jornada: true = disponible para servicios inmediatos, false = fuera de jornada"
 *               radio_cobertura_km:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 15
 *                 description: "Radio de cobertura en kilómetros (1-100)"
 *               latitud:
 *                 type: number
 *                 format: double
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 3.4516
 *                 description: "Latitud GPS del técnico. Requiere longitud. Se usa para búsquedas PostGIS."
 *               longitud:
 *                 type: number
 *                 format: double
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -76.5320
 *                 description: "Longitud GPS del técnico. Requiere latitud. Se usa para búsquedas PostGIS."
 *           examples:
 *             toggle_disponibilidad:
 *               summary: Iniciar jornada (disponible para servicios inmediatos)
 *               value:
 *                 disponible_inmediato: true
 *             fin_jornada:
 *               summary: Terminar jornada
 *               value:
 *                 disponible_inmediato: false
 *             activar_gps:
 *               summary: Activar ubicación GPS (técnico validado inicia jornada)
 *               value:
 *                 latitud: 3.4516
 *                 longitud: -76.5320
 *                 disponible_inmediato: true
 *             solo_telefono:
 *               summary: Actualizar solo teléfono
 *               value:
 *                 telefono: "3001112233"
 *             cambiar_ciudad:
 *               summary: Cambiar ciudad base a Medellín
 *               value:
 *                 id_ciudad: 2
 *     responses:
 *       200:
 *         description: Perfil del técnico actualizado exitosamente
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
 *                       example: 15
 *                     correo_electronico:
 *                       type: string
 *                       example: "andres.nuevo@example.com"
 *                     telefono:
 *                       type: string
 *                       example: "3001112233"
 *                     ciudad_base:
 *                       type: string
 *                       example: "Medellín"
 *                       nullable: true
 *                     disponible_inmediato:
 *                       type: boolean
 *                       example: true
 *                     radio_cobertura_km:
 *                       type: integer
 *                       example: 15
 *                     ubicacion_base:
 *                       type: object
 *                       nullable: true
 *                       description: "Coordenadas GPS del técnico (null si no ha activado GPS)"
 *                       properties:
 *                         latitud:
 *                           type: number
 *                           example: 3.4516
 *                         longitud:
 *                           type: number
 *                           example: -76.5320
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
export const actualizarPerfilTecnico = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Verificar rol
        // ----------------------------------------------------------------
        if (req.usuario.rol !== 'TECNICO') {
            await t.rollback();
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        // ----------------------------------------------------------------
        // 2. Extraer únicamente los campos editables del body
        // ----------------------------------------------------------------
        const { telefono, correo_electronico, id_ciudad, disponible_inmediato, radio_cobertura_km, latitud, longitud } = req.body;

        // ----------------------------------------------------------------
        // 3. Verificar que al menos un campo editable fue enviado
        // ----------------------------------------------------------------
        if (!telefono && !correo_electronico && id_ciudad === undefined && disponible_inmediato === undefined && radio_cobertura_km === undefined && latitud === undefined && longitud === undefined) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'Debe enviar al menos un campo para actualizar: telefono, correo_electronico, id_ciudad, disponible_inmediato, radio_cobertura_km, latitud o longitud',
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

        if (id_ciudad !== undefined) {
            const idCiudadNum = Number(id_ciudad);
            if (!Number.isInteger(idCiudadNum) || idCiudadNum <= 0) {
                erroresFormato.push('El campo id_ciudad debe ser un entero positivo');
            }
        }

        if (disponible_inmediato !== undefined && typeof disponible_inmediato !== 'boolean') {
            erroresFormato.push('El campo disponible_inmediato debe ser true o false');
        }

        if (radio_cobertura_km !== undefined) {
            const radioNum = Number(radio_cobertura_km);
            if (!Number.isInteger(radioNum) || radioNum < 1 || radioNum > 100) {
                erroresFormato.push('El campo radio_cobertura_km debe ser un entero entre 1 y 100');
            }
        }

        // Latitud y longitud deben enviarse juntas
        if ((latitud !== undefined) !== (longitud !== undefined)) {
            erroresFormato.push('Los campos latitud y longitud deben enviarse juntos');
        }

        if (latitud !== undefined && longitud !== undefined) {
            const latNum = parseFloat(latitud);
            const lngNum = parseFloat(longitud);
            if (isNaN(latNum) || latNum < -90 || latNum > 90) {
                erroresFormato.push('La latitud debe ser un número entre -90 y 90');
            }
            if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
                erroresFormato.push('La longitud debe ser un número entre -180 y 180');
            }
        }

        if (erroresFormato.length > 0) {
            await t.rollback();
            throw new ValidationError('Error de validación', erroresFormato);
        }

        // ----------------------------------------------------------------
        // 5. Verificar que el Técnico existe
        // ----------------------------------------------------------------
        const tecnico = await buscarPerfilTecnico(req.usuario.id_usuario, t);

        // ----------------------------------------------------------------
        // 6. Si se está cambiando el correo, verificar unicidad
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
        // 7. Si se está cambiando la ciudad, verificar que exista
        // ----------------------------------------------------------------
        let ciudadNueva = null;
        if (id_ciudad !== undefined) {
            ciudadNueva = await Ciudad.findByPk(Number(id_ciudad), { transaction: t });
            if (!ciudadNueva) {
                await t.rollback();
                throw new NotFoundError(`La ciudad con id ${id_ciudad} no existe en el sistema`);
            }
        }

        // ----------------------------------------------------------------
        // 8. Actualizar tabla Usuario si hay campos de usuario que cambiar
        // ----------------------------------------------------------------
        const camposUsuario = {};
        if (telefono)           camposUsuario.telefono           = telefono;
        if (correo_electronico) camposUsuario.correo_electronico = correo_electronico;

        if (Object.keys(camposUsuario).length > 0) {
            await Usuario.update(camposUsuario, {
                where: { id_usuario: req.usuario.id_usuario },
                transaction: t,
            });
        }

        // ----------------------------------------------------------------
        // 9. Actualizar tabla Tecnico si hay campos de técnico que cambiar
        // ----------------------------------------------------------------
        const camposTecnico = {};
        if (id_ciudad !== undefined)            camposTecnico.ciudad_base = Number(id_ciudad);
        if (disponible_inmediato !== undefined)  camposTecnico.disponible_inmediato = disponible_inmediato;
        if (radio_cobertura_km !== undefined)    camposTecnico.radio_cobertura_km = Number(radio_cobertura_km);
        if (latitud !== undefined && longitud !== undefined) {
            camposTecnico.ubicacion_base = {
                type: 'Point',
                coordinates: [parseFloat(longitud), parseFloat(latitud)],
            };
        }

        if (Object.keys(camposTecnico).length > 0) {
            await Tecnico.update(camposTecnico, {
                where: { id_tecnico: tecnico.id_tecnico },
                transaction: t,
            });
        }

        await t.commit();

        // Recuperar datos actualizados para la respuesta
        const usuarioActualizado = await Usuario.findByPk(req.usuario.id_usuario, {
            attributes: ['id_usuario', 'correo_electronico', 'telefono'],
        });

        // Recuperar tecnico actualizado para ciudad y disponible_inmediato
        const tecnicoActualizado = await Tecnico.findOne({
            where: { id_usuario: req.usuario.id_usuario },
            include: [{ model: Ciudad, attributes: ['nombre_ciudad'] }],
        });

        const cambiados = [
            ...Object.keys(camposUsuario),
            ...Object.keys(camposTecnico),
        ];

        logger.info(
            `actualizarPerfilTecnico: Perfil actualizado para id_usuario ${req.usuario.id_usuario} — campos: ${cambiados.join(', ')}`
        );

        // Extraer coordenadas de ubicacion_base para la respuesta
        const ubicacionBase = tecnicoActualizado?.ubicacion_base;
        const ubicacionResp = ubicacionBase?.coordinates
            ? { latitud: ubicacionBase.coordinates[1], longitud: ubicacionBase.coordinates[0] }
            : null;

        return res.status(200).json({
            success: true,
            message: 'Perfil actualizado exitosamente',
            data: {
                id_usuario:           usuarioActualizado.id_usuario,
                correo_electronico:   usuarioActualizado.correo_electronico,
                telefono:             usuarioActualizado.telefono,
                ciudad_base:          tecnicoActualizado?.Ciudad?.nombre_ciudad ?? null,
                disponible_inmediato: tecnicoActualizado?.disponible_inmediato ?? null,
                radio_cobertura_km:   tecnicoActualizado?.radio_cobertura_km ?? null,
                ubicacion_base:       ubicacionResp,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------
// ENDPOINTS DE ADMINISTRACIÓN — HU-24 y HU-25
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/pendientes:
 *   get:
 *     summary: Listar técnicos pendientes de validación (HU-24)
 *     description: |
 *       Retorna la lista paginada de todos los técnicos cuyo `estado_validacion`
 *       es `PENDIENTE_VALIDACION`, esperando revisión por parte del administrador.
 *
 *       **Solo Administradores.**
 *
 *       Incluye los datos personales básicos de cada técnico (nombre, correo,
 *       teléfono, número de identificación) y su ciudad base.
 *
 *       **Paginación:**
 *       - `page` (entero >= 1, default: 1)
 *       - `limit` (entero 1–100, default: 20)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: "Número de página (comienza en 1)"
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: "Cantidad de registros por página (máximo 100)"
 *         example: 20
 *     responses:
 *       200:
 *         description: Lista de técnicos pendientes obtenida exitosamente
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
 *                   example: "Técnicos pendientes de validación obtenidos exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 8
 *                   description: "Total de registros encontrados (sin paginación)"
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_tecnico:
 *                         type: integer
 *                         example: 7
 *                       id_usuario:
 *                         type: integer
 *                         example: 15
 *                       nombre:
 *                         type: string
 *                         example: "Andres Felipe"
 *                       apellido:
 *                         type: string
 *                         example: "Martinez Herrera"
 *                       correo_electronico:
 *                         type: string
 *                         format: email
 *                         example: "andres.martinez@example.com"
 *                       telefono:
 *                         type: string
 *                         example: "3156789012"
 *                       num_identificacion:
 *                         type: string
 *                         example: "1061234567"
 *                       ciudad_base:
 *                         type: string
 *                         example: "Cali"
 *                         nullable: true
 *                       estado_validacion:
 *                         type: string
 *                         example: "PENDIENTE_VALIDACION"
 *                       fecha_registro:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-02-10T14:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerTecnicosPendientes = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Parsear y validar parámetros de paginación
        // ----------------------------------------------------------------
        const pageRaw  = req.query.page  ?? '1';
        const limitRaw = req.query.limit ?? '20';

        const page  = parseInt(pageRaw,  10);
        const limit = parseInt(limitRaw, 10);

        const erroresPaginacion = [];

        if (!Number.isInteger(page)  || page  < 1)                    erroresPaginacion.push('El parámetro page debe ser un entero mayor o igual a 1');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)     erroresPaginacion.push('El parámetro limit debe ser un entero entre 1 y 100');

        if (erroresPaginacion.length > 0) {
            throw new ValidationError('Parámetros de paginación inválidos', erroresPaginacion);
        }

        const offset = (page - 1) * limit;

        // ----------------------------------------------------------------
        // 2. Consultar técnicos con estado PENDIENTE_VALIDACION
        //    - Ciudad usa el modelo directamente (sin alias en models/index.js)
        //    - datos_usuario es el alias definido en Tecnico.belongsTo(Usuario)
        // ----------------------------------------------------------------
        const { count, rows } = await Tecnico.findAndCountAll({
            where: { estado_validacion: 'PENDIENTE_VALIDACION' },
            include: [
                {
                    model:      Usuario,
                    as:         'datos_usuario',
                    attributes: [
                        'id_usuario',
                        'nombre',
                        'apellido',
                        'correo_electronico',
                        'telefono',
                        'num_identificacion',
                    ],
                },
                {
                    model:      Ciudad,
                    attributes: ['nombre_ciudad'],
                },
            ],
            order:  [['createdAt', 'ASC']],   // primero los más antiguos (FIFO de revisión)
            limit,
            offset,
        });

        logger.info(
            `obtenerTecnicosPendientes: ${count} técnicos pendientes — página ${page}/${Math.ceil(count / limit) || 1} — solicitado por admin id=${req.usuario.id_usuario}`
        );

        return res.status(200).json({
            success: true,
            message: 'Técnicos pendientes de validación obtenidos exitosamente',
            total:   count,
            page,
            limit,
            data: rows.map((tec) => ({
                id_tecnico:         tec.id_tecnico,
                id_usuario:         tec.datos_usuario?.id_usuario         ?? null,
                nombre:             tec.datos_usuario?.nombre             ?? null,
                apellido:           tec.datos_usuario?.apellido           ?? null,
                correo_electronico: tec.datos_usuario?.correo_electronico ?? null,
                telefono:           tec.datos_usuario?.telefono           ?? null,
                num_identificacion: tec.datos_usuario?.num_identificacion ?? null,
                ciudad_base:        tec.Ciudad?.nombre_ciudad             ?? null,
                estado_validacion:  tec.estado_validacion,
                fecha_registro:     tec.createdAt,
            })),
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/{id}:
 *   get:
 *     summary: Obtener perfil completo de un técnico por ID (HU-24)
 *     description: |
 *       Retorna todos los datos de un técnico específico para que el administrador
 *       pueda revisarlo antes de aprobar o rechazar su solicitud.
 *
 *       **Solo Administradores.**
 *
 *       **Datos incluidos:**
 *       - Todos los datos del Usuario (nombre, correo, teléfono, documento, etc.)
 *       - Ciudad base
 *       - Certificados técnicos (si existen)
 *       - Especialidades con el nombre de cada subcategoría y categoría padre
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del técnico (`id_tecnico`)
 *         example: 7
 *     responses:
 *       200:
 *         description: Perfil completo del técnico obtenido exitosamente
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
 *                   example: "Perfil del técnico obtenido exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_tecnico:
 *                       type: integer
 *                       example: 7
 *                     estado_validacion:
 *                       type: string
 *                       enum: [PENDIENTE_VALIDACION, ACTIVO, SUSPENDIDO, RECHAZADO]
 *                       example: "PENDIENTE_VALIDACION"
 *                     radio_cobertura_km:
 *                       type: integer
 *                       example: 10
 *                     disponible_inmediato:
 *                       type: boolean
 *                       example: true
 *                     prom_calificacion:
 *                       type: number
 *                       format: float
 *                       example: 0.0
 *                     fecha_registro:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-02-10T14:30:00.000Z"
 *                     usuario:
 *                       type: object
 *                       properties:
 *                         id_usuario:
 *                           type: integer
 *                           example: 15
 *                         nombre:
 *                           type: string
 *                           example: "Andres Felipe"
 *                         apellido:
 *                           type: string
 *                           example: "Martinez Herrera"
 *                         correo_electronico:
 *                           type: string
 *                           format: email
 *                           example: "andres.martinez@example.com"
 *                         telefono:
 *                           type: string
 *                           example: "3156789012"
 *                         num_identificacion:
 *                           type: string
 *                           example: "1061234567"
 *                         fecha_nacimiento:
 *                           type: string
 *                           format: date
 *                           example: "1990-06-15"
 *                     ciudad_base:
 *                       type: string
 *                       example: "Cali"
 *                       nullable: true
 *                     certificados:
 *                       type: array
 *                       items:
 *                         type: object
 *                       example: []
 *                     especialidades:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_subcategoria:
 *                             type: integer
 *                             example: 3
 *                           nombre_subcategoria:
 *                             type: string
 *                             example: "Reparación de tuberías"
 *                           nombre_categoria:
 *                             type: string
 *                             example: "Plomería"
 *                           experiencia:
 *                             type: string
 *                             example: "3 años reparando tuberías en viviendas residenciales"
 *                             nullable: true
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerDetalleTecnico = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Validar ID de ruta
        // ----------------------------------------------------------------
        const idTecnico = parseInt(req.params.id, 10);
        if (!Number.isInteger(idTecnico) || idTecnico <= 0) {
            throw new ValidationError('Parámetro inválido', [
                'El parámetro id debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Buscar el técnico con todas sus relaciones
        //    - datos_usuario  → alias definido en models/index.js
        //    - Ciudad         → sin alias (acceso como tecnico.Ciudad)
        //    - certificados   → alias definido en models/index.js
        //    - especialidades → N:N con alias definido en models/index.js
        //      Subcategoria incluye su Categoria padre (sin alias en esa rel)
        // ----------------------------------------------------------------
        const tecnico = await Tecnico.findByPk(idTecnico, {
            include: [
                {
                    model:      Usuario,
                    as:         'datos_usuario',
                    attributes: [
                        'id_usuario',
                        'nombre',
                        'apellido',
                        'correo_electronico',
                        'telefono',
                        'num_identificacion',
                        'fecha_nacimiento',
                    ],
                },
                {
                    model:      Ciudad,
                    attributes: ['nombre_ciudad'],
                },
                {
                    model: CertificadoTecnico,
                    as:    'certificados',
                },
                {
                    model:   Subcategoria,
                    as:      'especialidades',
                    through: {
                        model:      Especialidad,
                        attributes: ['experiencia'],
                    },
                    include: [
                        {
                            model:      Categoria,
                            attributes: ['nombre'],
                        },
                    ],
                },
            ],
        });

        if (!tecnico) {
            throw new NotFoundError(`No se encontró el técnico con ID ${idTecnico}`);
        }

        logger.info(
            `obtenerDetalleTecnico: Técnico id=${idTecnico} consultado por admin id=${req.usuario.id_usuario}`
        );

        const usuario = tecnico.datos_usuario;

        return res.status(200).json({
            success: true,
            message: 'Perfil del técnico obtenido exitosamente',
            data: {
                id_tecnico:             tecnico.id_tecnico,
                estado_validacion:      tecnico.estado_validacion,
                radio_cobertura_km:     tecnico.radio_cobertura_km,
                disponible_inmediato:   tecnico.disponible_inmediato,
                disponibilidad_horaria: tecnico.disponibilidad_horaria,
                prom_calificacion:      tecnico.prom_calificacion,
                url_foto:               tecnico.url_foto               ?? null,
                url_docId:              tecnico.url_docId              ?? null,
                fecha_registro:         tecnico.createdAt,
                fecha_validacion:       tecnico.fecha_validacion        ?? null,
                usuario: usuario
                    ? {
                          id_usuario:         usuario.id_usuario,
                          nombre:             usuario.nombre,
                          apellido:           usuario.apellido,
                          correo_electronico: usuario.correo_electronico,
                          telefono:           usuario.telefono,
                          num_identificacion: usuario.num_identificacion,
                          fecha_nacimiento:   usuario.fecha_nacimiento ?? null,
                      }
                    : null,
                ciudad_base: tecnico.Ciudad?.nombre_ciudad ?? null,
                certificados: (tecnico.certificados ?? []).map((c) => ({
                    id_certificado:     c.id_certificado,
                    nombre:             c.nombre,
                    entidad_emisora:    c.entidad_emisora    ?? null,
                    fecha_emision:      c.fecha_emision      ?? null,
                    fecha_vencimiento:  c.fecha_vencimiento  ?? null,
                    url_certificado:    c.url_certificado    ?? null,
                })),
                especialidades: (tecnico.especialidades ?? []).map((s) => ({
                    id_subcategoria:     s.id_subcategoria,
                    nombre_subcategoria: s.nombre,
                    nombre_categoria:    s.Categoria?.nombre      ?? null,
                    experiencia:         s.Especialidad?.experiencia    ?? null,
                })),
            },
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/{id}/aprobar:
 *   put:
 *     summary: Aprobar solicitud de un técnico (HU-24)
 *     description: |
 *       Cambia el `estado_validacion` del técnico de `PENDIENTE_VALIDACION`
 *       a `ACTIVO`, registra el administrador que aprobó y la fecha de
 *       validación.
 *
 *       **Solo Administradores.**
 *
 *       **Reglas de negocio:**
 *       - El técnico debe existir y estar en estado `PENDIENTE_VALIDACION`.
 *       - Se registra el `id_usuario` del admin (obtenido del token JWT) en
 *         el campo `validado_por`.
 *       - Se registra la fecha y hora actual en `fecha_validacion`.
 *       - Campo opcional `notas_aprobacion` (máximo 300 caracteres).
 *       - La operación se realiza dentro de una transacción Sequelize.
 *
 *       > **Nota:** Las notificaciones al técnico se implementarán en una
 *       > iteración futura con el módulo de Notificaciones.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del técnico a aprobar (`id_tecnico`)
 *         example: 7
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notas_aprobacion:
 *                 type: string
 *                 maxLength: 300
 *                 example: "Documentación en regla. Certificado de electricista vigente verificado."
 *                 description: "Notas internas del administrador sobre la aprobación (opcional)"
 *           examples:
 *             sin_notas:
 *               summary: Aprobar sin notas adicionales
 *               value: {}
 *             con_notas:
 *               summary: Aprobar con notas del revisor
 *               value:
 *                 notas_aprobacion: "Documentación en regla. Certificado de electricista vigente verificado. Experiencia comprobada en el sector."
 *     responses:
 *       200:
 *         description: Técnico aprobado exitosamente
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
 *                   example: "Técnico aprobado exitosamente. Su cuenta está ahora activa."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_tecnico:
 *                       type: integer
 *                       example: 7
 *                     id_usuario:
 *                       type: integer
 *                       example: 15
 *                     nombre_completo:
 *                       type: string
 *                       example: "Andres Felipe Martinez Herrera"
 *                     estado_validacion:
 *                       type: string
 *                       example: "ACTIVO"
 *                     fecha_validacion:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-02-11T10:00:00.000Z"
 *                     validado_por:
 *                       type: integer
 *                       example: 1
 *                       description: "id_usuario del administrador que aprobó"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: El técnico no está en estado PENDIENTE_VALIDACION
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "El técnico ya fue procesado previamente. Estado actual: ACTIVO"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const aprobarTecnico = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Validar ID de ruta
        // ----------------------------------------------------------------
        const idTecnico = parseInt(req.params.id, 10);
        if (!Number.isInteger(idTecnico) || idTecnico <= 0) {
            await t.rollback();
            throw new ValidationError('Parámetro inválido', [
                'El parámetro id debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Validar campo opcional notas_aprobacion
        // ----------------------------------------------------------------
        const { notas_aprobacion } = req.body ?? {};

        if (notas_aprobacion !== undefined && notas_aprobacion !== null) {
            if (typeof notas_aprobacion !== 'string') {
                await t.rollback();
                throw new ValidationError('Error de validación', [
                    'El campo notas_aprobacion debe ser texto',
                ]);
            }
            if (notas_aprobacion.trim().length > 300) {
                await t.rollback();
                throw new ValidationError('Error de validación', [
                    'El campo notas_aprobacion no puede superar los 300 caracteres',
                ]);
            }
        }

        // ----------------------------------------------------------------
        // 3. Buscar el técnico con datos del usuario para la respuesta
        // ----------------------------------------------------------------
        const tecnico = await Tecnico.findByPk(idTecnico, {
            include: [
                {
                    model:      Usuario,
                    as:         'datos_usuario',
                    attributes: ['id_usuario', 'nombre', 'apellido'],
                },
            ],
            transaction: t,
        });

        if (!tecnico) {
            await t.rollback();
            throw new NotFoundError(`No se encontró el técnico con ID ${idTecnico}`);
        }

        // ----------------------------------------------------------------
        // 4. Verificar que el técnico esté en estado PENDIENTE_VALIDACION
        // ----------------------------------------------------------------
        if (tecnico.estado_validacion !== 'PENDIENTE_VALIDACION') {
            await t.rollback();
            throw new ConflictError(
                `El técnico ya fue procesado previamente. Estado actual: ${tecnico.estado_validacion}`
            );
        }

        // ----------------------------------------------------------------
        // 5. Aplicar la aprobación dentro de la transacción
        //    - estado_validacion → ACTIVO
        //    - validado_por      → id_usuario del admin (del token JWT)
        //    - fecha_validacion  → fecha/hora actual
        // ----------------------------------------------------------------
        const ahora = new Date();

        await Tecnico.update(
            {
                estado_validacion: 'ACTIVO',
                validado_por:      req.usuario.id_usuario,
                fecha_validacion:  ahora,
            },
            {
                where: { id_tecnico: idTecnico },
                transaction: t,
            }
        );

        await t.commit();

        const usuario = tecnico.datos_usuario;
        const nombreCompleto = usuario
            ? `${usuario.nombre} ${usuario.apellido}`.trim()
            : null;

        logger.info(
            `aprobarTecnico: Técnico id=${idTecnico} (${nombreCompleto}) APROBADO por admin id=${req.usuario.id_usuario}`
        );

        return res.status(200).json({
            success: true,
            message: 'Técnico aprobado exitosamente. Su cuenta está ahora activa.',
            data: {
                id_tecnico:        idTecnico,
                id_usuario:        usuario?.id_usuario ?? null,
                nombre_completo:   nombreCompleto,
                estado_validacion: 'ACTIVO',
                fecha_validacion:  ahora,
                validado_por:      req.usuario.id_usuario,
                notas_aprobacion:  notas_aprobacion ? notas_aprobacion.trim() : null,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/{id}/rechazar:
 *   put:
 *     summary: Rechazar solicitud de un técnico (HU-25)
 *     description: |
 *       Cambia el `estado_validacion` del técnico de `PENDIENTE_VALIDACION`
 *       a `RECHAZADO`, registra el administrador que rechazó, la fecha y
 *       el motivo obligatorio del rechazo.
 *
 *       **Solo Administradores.**
 *
 *       **Reglas de negocio:**
 *       - El técnico debe existir y estar en estado `PENDIENTE_VALIDACION`.
 *       - El campo `motivo_rechazo` es **obligatorio** y debe tener entre
 *         50 y 1000 caracteres para garantizar un rechazo fundamentado.
 *       - Se registra el `id_usuario` del admin en `validado_por`.
 *       - Se registra la fecha y hora actual en `fecha_validacion`.
 *       - La operación se realiza dentro de una transacción Sequelize.
 *
 *       > **Nota:** Las notificaciones al técnico se implementarán en una
 *       > iteración futura con el módulo de Notificaciones.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del técnico a rechazar (`id_tecnico`)
 *         example: 7
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - motivo_rechazo
 *             properties:
 *               motivo_rechazo:
 *                 type: string
 *                 minLength: 50
 *                 maxLength: 1000
 *                 example: "La documentación presentada está incompleta. El certificado de electricista se encuentra vencido desde enero de 2025. Debe renovarlo y volver a aplicar con documentación actualizada y vigente."
 *                 description: "Explicación detallada del motivo de rechazo (mínimo 50 caracteres)"
 *           examples:
 *             documentacion_incompleta:
 *               summary: Rechazo por documentación incompleta
 *               value:
 *                 motivo_rechazo: "La documentación presentada está incompleta. Falta el certificado de experiencia laboral y la fotocopia del documento de identidad ampliado al 150%."
 *             certificado_vencido:
 *               summary: Rechazo por certificado vencido
 *               value:
 *                 motivo_rechazo: "El certificado de plomería presentado se encuentra vencido desde marzo de 2024. Debe obtener una certificación vigente emitida por una entidad reconocida y volver a presentar su solicitud."
 *     responses:
 *       200:
 *         description: Solicitud del técnico rechazada exitosamente
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
 *                   example: "Solicitud del técnico rechazada. Se ha registrado el motivo del rechazo."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_tecnico:
 *                       type: integer
 *                       example: 7
 *                     id_usuario:
 *                       type: integer
 *                       example: 15
 *                     nombre_completo:
 *                       type: string
 *                       example: "Andres Felipe Martinez Herrera"
 *                     estado_validacion:
 *                       type: string
 *                       example: "RECHAZADO"
 *                     fecha_validacion:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-02-11T10:15:00.000Z"
 *                     validado_por:
 *                       type: integer
 *                       example: 1
 *                       description: "id_usuario del administrador que rechazó"
 *                     motivo_rechazo:
 *                       type: string
 *                       example: "La documentación presentada está incompleta..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: El técnico no está en estado PENDIENTE_VALIDACION
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "El técnico ya fue procesado previamente. Estado actual: RECHAZADO"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const rechazarTecnico = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        // ----------------------------------------------------------------
        // 1. Validar ID de ruta
        // ----------------------------------------------------------------
        const idTecnico = parseInt(req.params.id, 10);
        if (!Number.isInteger(idTecnico) || idTecnico <= 0) {
            await t.rollback();
            throw new ValidationError('Parámetro inválido', [
                'El parámetro id debe ser un número entero positivo',
            ]);
        }

        // ----------------------------------------------------------------
        // 2. Validar campo obligatorio motivo_rechazo
        // ----------------------------------------------------------------
        const { motivo_rechazo } = req.body ?? {};

        if (!motivo_rechazo || typeof motivo_rechazo !== 'string' || motivo_rechazo.trim() === '') {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El campo motivo_rechazo es obligatorio',
            ]);
        }

        const motivoLimpio = motivo_rechazo.trim();

        if (motivoLimpio.length < 50) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                `El motivo de rechazo debe tener al menos 50 caracteres. Actualmente tiene ${motivoLimpio.length}.`,
            ]);
        }

        if (motivoLimpio.length > 1000) {
            await t.rollback();
            throw new ValidationError('Error de validación', [
                'El motivo de rechazo no puede superar los 1000 caracteres',
            ]);
        }

        // ----------------------------------------------------------------
        // 3. Buscar el técnico con datos del usuario para la respuesta
        // ----------------------------------------------------------------
        const tecnico = await Tecnico.findByPk(idTecnico, {
            include: [
                {
                    model:      Usuario,
                    as:         'datos_usuario',
                    attributes: ['id_usuario', 'nombre', 'apellido'],
                },
            ],
            transaction: t,
        });

        if (!tecnico) {
            await t.rollback();
            throw new NotFoundError(`No se encontró el técnico con ID ${idTecnico}`);
        }

        // ----------------------------------------------------------------
        // 4. Verificar que el técnico esté en estado PENDIENTE_VALIDACION
        // ----------------------------------------------------------------
        if (tecnico.estado_validacion !== 'PENDIENTE_VALIDACION') {
            await t.rollback();
            throw new ConflictError(
                `El técnico ya fue procesado previamente. Estado actual: ${tecnico.estado_validacion}`
            );
        }

        // ----------------------------------------------------------------
        // 5. Aplicar el rechazo dentro de la transacción
        //    - estado_validacion → RECHAZADO
        //    - validado_por      → id_usuario del admin (del token JWT)
        //    - fecha_validacion  → fecha/hora actual
        //    Nota: motivo_rechazo se almacena en la respuesta y en los logs.
        //    Si en el futuro se agrega una columna motivo_rechazo a la tabla
        //    Tecnico mediante una migración, solo hay que incluirla en el update.
        // ----------------------------------------------------------------
        const ahora = new Date();

        await Tecnico.update(
            {
                estado_validacion: 'RECHAZADO',
                validado_por:      req.usuario.id_usuario,
                fecha_validacion:  ahora,
            },
            {
                where: { id_tecnico: idTecnico },
                transaction: t,
            }
        );

        await t.commit();

        const usuario = tecnico.datos_usuario;
        const nombreCompleto = usuario
            ? `${usuario.nombre} ${usuario.apellido}`.trim()
            : null;

        logger.warn(
            `rechazarTecnico: Técnico id=${idTecnico} (${nombreCompleto}) RECHAZADO por admin id=${req.usuario.id_usuario} — motivo: "${motivoLimpio.substring(0, 80)}..."`
        );

        return res.status(200).json({
            success: true,
            message: 'Solicitud del técnico rechazada. Se ha registrado el motivo del rechazo.',
            data: {
                id_tecnico:        idTecnico,
                id_usuario:        usuario?.id_usuario ?? null,
                nombre_completo:   nombreCompleto,
                estado_validacion: 'RECHAZADO',
                fecha_validacion:  ahora,
                validado_por:      req.usuario.id_usuario,
                motivo_rechazo:    motivoLimpio,
            },
        });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/admin/todos:
 *   get:
 *     summary: Obtener lista de TODOS los técnicos con paginación y filtro opcional
 *     description: |
 *       Retorna todos los técnicos registrados en la plataforma con paginación,
 *       incluyendo información del usuario asociado y ciudad base.
 *
 *       **Solo Administradores.**
 *
 *       **Filtros opcionales:**
 *       - `estado`: Filtra por estado_validacion específico (PENDIENTE_VALIDACION, ACTIVO, SUSPENDIDO, RECHAZADO, INACTIVO)
 *
 *       **Paginación:**
 *       - `page`: Número de página (por defecto 1)
 *       - `limit`: Cantidad de resultados por página (1-100, por defecto 20)
 *
 *       **Orden:**
 *       - Los técnicos se retornan ordenados por fecha de creación descendente (más recientes primero)
 *
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         required: false
 *         description: Número de página
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         required: false
 *         description: Cantidad de resultados por página
 *         example: 20
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [PENDIENTE_VALIDACION, ACTIVO, SUSPENDIDO, RECHAZADO, INACTIVO]
 *         required: false
 *         description: Filtrar por estado de validación específico
 *         example: ACTIVO
 *     responses:
 *       200:
 *         description: Lista de técnicos obtenida exitosamente
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
 *                   example: "Técnicos obtenidos exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 45
 *                   description: Total de técnicos que cumplen el filtro
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_tecnico:
 *                         type: integer
 *                         example: 7
 *                       id_usuario:
 *                         type: integer
 *                         example: 15
 *                       nombre:
 *                         type: string
 *                         example: "Andrés Felipe"
 *                       apellido:
 *                         type: string
 *                         example: "Martínez Herrera"
 *                       correo_electronico:
 *                         type: string
 *                         format: email
 *                         example: "andres.martinez@example.com"
 *                       telefono:
 *                         type: string
 *                         example: "3156789012"
 *                       num_identificacion:
 *                         type: string
 *                         example: "1061234567"
 *                       ciudad_base:
 *                         type: string
 *                         example: "Cali"
 *                       estado_validacion:
 *                         type: string
 *                         enum: [PENDIENTE_VALIDACION, ACTIVO, SUSPENDIDO, RECHAZADO, INACTIVO]
 *                         example: "ACTIVO"
 *                       fecha_registro:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-02-10T14:30:00.000Z"
 *             examples:
 *               todos_los_tecnicos:
 *                 summary: Todos los técnicos (sin filtro)
 *                 value:
 *                   success: true
 *                   message: "Técnicos obtenidos exitosamente"
 *                   total: 45
 *                   page: 1
 *                   limit: 20
 *                   data:
 *                     - id_tecnico: 12
 *                       id_usuario: 28
 *                       nombre: "Carlos Eduardo"
 *                       apellido: "Ramírez Torres"
 *                       correo_electronico: "carlos.ramirez@example.com"
 *                       telefono: "3209876543"
 *                       num_identificacion: "1098765432"
 *                       ciudad_base: "Medellín"
 *                       estado_validacion: "ACTIVO"
 *                       fecha_registro: "2026-02-22T10:15:00.000Z"
 *                     - id_tecnico: 11
 *                       id_usuario: 27
 *                       nombre: "María Fernanda"
 *                       apellido: "López García"
 *                       correo_electronico: "maria.lopez@example.com"
 *                       telefono: "3101234567"
 *                       num_identificacion: "987654321"
 *                       ciudad_base: "Cali"
 *                       estado_validacion: "PENDIENTE_VALIDACION"
 *                       fecha_registro: "2026-02-20T08:30:00.000Z"
 *               filtrado_por_estado:
 *                 summary: Solo técnicos activos
 *                 value:
 *                   success: true
 *                   message: "Técnicos obtenidos exitosamente"
 *                   total: 32
 *                   page: 1
 *                   limit: 20
 *                   data:
 *                     - id_tecnico: 12
 *                       id_usuario: 28
 *                       nombre: "Carlos Eduardo"
 *                       apellido: "Ramírez Torres"
 *                       correo_electronico: "carlos.ramirez@example.com"
 *                       telefono: "3209876543"
 *                       num_identificacion: "1098765432"
 *                       ciudad_base: "Medellín"
 *                       estado_validacion: "ACTIVO"
 *                       fecha_registro: "2026-02-22T10:15:00.000Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerTodosTecnicos = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Parsear y validar parámetros de paginación
        // ----------------------------------------------------------------
        const pageRaw  = req.query.page  ?? '1';
        const limitRaw = req.query.limit ?? '20';
        const estadoFiltro = req.query.estado;

        const page  = parseInt(pageRaw,  10);
        const limit = parseInt(limitRaw, 10);

        const erroresPaginacion = [];

        if (!Number.isInteger(page)  || page  < 1)                    erroresPaginacion.push('El parámetro page debe ser un entero mayor o igual a 1');
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)     erroresPaginacion.push('El parámetro limit debe ser un entero entre 1 y 100');

        if (erroresPaginacion.length > 0) {
            throw new ValidationError('Parámetros de paginación inválidos', erroresPaginacion);
        }

        const offset = (page - 1) * limit;

        // ----------------------------------------------------------------
        // 2. Validar estado si se proporciona
        // ----------------------------------------------------------------
        const where = {};
        const estadosValidos = ['PENDIENTE_VALIDACION', 'ACTIVO', 'SUSPENDIDO', 'RECHAZADO', 'INACTIVO'];

        if (estadoFiltro) {
            if (!estadosValidos.includes(estadoFiltro)) {
                throw new ValidationError(
                    `El parámetro estado debe ser uno de: ${estadosValidos.join(', ')}`
                );
            }
            where.estado_validacion = estadoFiltro;
        }

        // ----------------------------------------------------------------
        // 3. Consultar técnicos con filtros opcionales
        //    - Ciudad usa el modelo directamente (sin alias en models/index.js)
        //    - datos_usuario es el alias definido en Tecnico.belongsTo(Usuario)
        // ----------------------------------------------------------------
        const { count, rows } = await Tecnico.findAndCountAll({
            where,
            include: [
                {
                    model:      Usuario,
                    as:         'datos_usuario',
                    attributes: [
                        'id_usuario',
                        'nombre',
                        'apellido',
                        'correo_electronico',
                        'telefono',
                        'num_identificacion',
                    ],
                },
                {
                    model:      Ciudad,
                    attributes: ['nombre_ciudad'],
                },
            ],
            order:  [['createdAt', 'DESC']],   // Más recientes primero
            limit,
            offset,
        });

        logger.info(
            `obtenerTodosTecnicos: ${count} técnicos totales${estadoFiltro ? ` con estado=${estadoFiltro}` : ''} — página ${page}/${Math.ceil(count / limit) || 1} — solicitado por admin id=${req.usuario.id_usuario}`
        );

        return res.status(200).json({
            success: true,
            message: 'Técnicos obtenidos exitosamente',
            total:   count,
            page,
            limit,
            data: rows.map((tec) => ({
                id_tecnico:         tec.id_tecnico,
                id_usuario:         tec.datos_usuario?.id_usuario         ?? null,
                nombre:             tec.datos_usuario?.nombre             ?? null,
                apellido:           tec.datos_usuario?.apellido           ?? null,
                correo_electronico: tec.datos_usuario?.correo_electronico ?? null,
                telefono:           tec.datos_usuario?.telefono           ?? null,
                num_identificacion: tec.datos_usuario?.num_identificacion ?? null,
                ciudad_base:        tec.Ciudad?.nombre_ciudad             ?? null,
                estado_validacion:  tec.estado_validacion,
                fecha_registro:     tec.createdAt,
            })),
        });

    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /tecnicos/foto:
 *   post:
 *     summary: Subir foto de perfil del técnico
 *     description: |
 *       Permite al técnico subir una foto de perfil. La foto debe ser JPG, JPEG o PNG
 *       y no puede superar los 5MB. El archivo se guarda en `uploads/fotos/` con un
 *       nombre único que incluye el id_usuario y timestamp.
 *
 *       **Solo técnicos autenticados.**
 *
 *       **Formatos aceptados:** image/jpeg, image/jpg, image/png
 *       **Tamaño máximo:** 5MB
 *
 *       La URL de la foto se almacena en el campo `url_foto` del técnico.
 *     tags: [Tecnicos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - foto
 *             properties:
 *               foto:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de imagen (JPG, JPEG o PNG)
 *     responses:
 *       200:
 *         description: Foto subida exitosamente
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
 *                   example: "Foto de perfil actualizada exitosamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     url_foto:
 *                       type: string
 *                       example: "/uploads/fotos/tecnico-15-1709817600000.jpg"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Solo técnicos pueden subir foto de perfil
 */
export const uploadFotoPerfil = async (req, res) => {
    try {
        // Verificar que el usuario autenticado tiene rol Tecnico
        if (req.usuario.rol !== 'TECNICO') {
            throw new ForbiddenError('Esta ruta es exclusiva para técnicos');
        }

        // Verificar que se subió un archivo
        if (!req.file) {
            throw new ValidationError('Debes proporcionar una imagen en el campo "foto"');
        }

        // Buscar el tecnico autenticado
        const tecnico = await buscarPerfilTecnico(req.usuario.id_usuario);

        // Construir la URL relativa del archivo
        const urlFoto = `/uploads/fotos/${req.file.filename}`;

        // Actualizar el campo url_foto en la tabla Tecnico
        await Tecnico.update(
            { url_foto: urlFoto },
            { where: { id_tecnico: tecnico.id_tecnico } }
        );

        logger.info(`uploadFotoPerfil: Técnico ${tecnico.id_tecnico} subió foto de perfil: ${urlFoto}`);

        return res.status(200).json({
            success: true,
            message: 'Foto de perfil actualizada exitosamente',
            data: {
                url_foto: urlFoto
            }
        });

    } catch (error) {
        return handleError(res, error);
    }
};
