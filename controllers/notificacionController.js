import { Usuario, Notificacion } from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /notificaciones/push-token:
 *   post:
 *     summary: Registrar token de Expo para push notifications
 *     description: |
 *       Permite al usuario autenticado registrar su token de Expo
 *       para recibir notificaciones push en su dispositivo móvil.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expo_push_token
 *             properties:
 *               expo_push_token:
 *                 type: string
 *                 example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
 *     responses:
 *       200:
 *         description: Token registrado exitosamente
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
 *                   example: "Token de notificaciones registrado exitosamente"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const registrarPushToken = async (req, res) => {
    try {
        const { expo_push_token } = req.body;

        if (!expo_push_token || typeof expo_push_token !== 'string' || expo_push_token.trim() === '') {
            throw new ValidationError('Error de validación', [
                'El campo expo_push_token es requerido',
            ]);
        }

        await Usuario.update(
            { expo_push_token: expo_push_token.trim() },
            { where: { id_usuario: req.usuario.id_usuario } }
        );

        logger.info(`registrarPushToken: Usuario ${req.usuario.id_usuario} registró push token`);

        return res.status(200).json({
            success: true,
            message: 'Token de notificaciones registrado exitosamente',
        });
    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /notificaciones:
 *   get:
 *     summary: Obtener notificaciones del usuario autenticado
 *     description: |
 *       Retorna las notificaciones del usuario con paginación.
 *       Filtro opcional por estado de lectura.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: leida
 *         schema:
 *           type: boolean
 *         description: "Filtrar por estado de lectura (true/false)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         example: 20
 *     responses:
 *       200:
 *         description: Notificaciones obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total_paginas:
 *                       type: integer
 *                     no_leidas:
 *                       type: integer
 *                     notificaciones:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_notificacion:
 *                             type: integer
 *                           tipo:
 *                             type: string
 *                           titulo:
 *                             type: string
 *                           mensaje:
 *                             type: string
 *                           datos_adicionales:
 *                             type: object
 *                             nullable: true
 *                           leida:
 *                             type: boolean
 *                           fecha_envio:
 *                             type: string
 *                             format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const obtenerMisNotificaciones = async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const whereClause = { id_usuario: req.usuario.id_usuario };

        if (req.query.leida !== undefined) {
            const val = String(req.query.leida).toLowerCase();
            if (val === 'true') whereClause.leida = true;
            else if (val === 'false') whereClause.leida = false;
        }

        const { count, rows: notificaciones } = await Notificacion.findAndCountAll({
            where: whereClause,
            order: [['fecha_envio', 'DESC']],
            limit,
            offset,
            attributes: [
                'id_notificacion', 'tipo', 'titulo', 'mensaje',
                'datos_adicionales', 'leida', 'fecha_envio',
            ],
        });

        // Conteo de no leídas (útil para badge)
        const noLeidas = await Notificacion.count({
            where: { id_usuario: req.usuario.id_usuario, leida: false },
        });

        logger.info(
            `obtenerMisNotificaciones: Usuario ${req.usuario.id_usuario} — página ${page}, total ${count}`
        );

        return res.status(200).json({
            success: true,
            message: 'Notificaciones obtenidas exitosamente',
            data: {
                total: count,
                page,
                limit,
                total_paginas: Math.ceil(count / limit),
                no_leidas: noLeidas,
                notificaciones,
            },
        });
    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /notificaciones/{id}/leer:
 *   put:
 *     summary: Marcar notificación como leída
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notificación marcada como leída
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const marcarComoLeida = async (req, res) => {
    try {
        const idNotificacion = Number.parseInt(req.params.id);
        if (!Number.isInteger(idNotificacion) || idNotificacion <= 0) {
            throw new ValidationError('Error de validación', ['ID de notificación inválido']);
        }

        const notificacion = await Notificacion.findByPk(idNotificacion);
        if (!notificacion) throw new NotFoundError('Notificación no encontrada');

        if (notificacion.id_usuario !== req.usuario.id_usuario) {
            throw new ForbiddenError('No tienes permiso para modificar esta notificación');
        }

        if (!notificacion.leida) {
            await notificacion.update({ leida: true });
        }

        logger.info(`marcarComoLeida: Usuario ${req.usuario.id_usuario} — notif ${idNotificacion}`);

        return res.status(200).json({
            success: true,
            message: 'Notificación marcada como leída',
        });
    } catch (error) {
        return handleError(res, error);
    }
};

// ---------------------------------------------------------------------------

/**
 * @swagger
 * /notificaciones/leer-todas:
 *   put:
 *     summary: Marcar todas las notificaciones como leídas
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Todas las notificaciones marcadas como leídas
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const marcarTodasLeidas = async (req, res) => {
    try {
        const [actualizadas] = await Notificacion.update(
            { leida: true },
            { where: { id_usuario: req.usuario.id_usuario, leida: false } }
        );

        logger.info(
            `marcarTodasLeidas: Usuario ${req.usuario.id_usuario} — ${actualizadas} marcadas`
        );

        return res.status(200).json({
            success: true,
            message: `${actualizadas} notificaciones marcadas como leídas`,
        });
    } catch (error) {
        return handleError(res, error);
    }
};
