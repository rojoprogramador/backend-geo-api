import { Ciudad, Pais } from '../models/index.js';
import { handleError } from '../utils/errorHandler.js';
import { ValidationError } from '../utils/errors/AppError.js';
import logger from '../utils/logger.js';

/**
 * @swagger
 * /ciudades:
 *   get:
 *     summary: Obtener lista de ciudades disponibles en la plataforma
 *     description: |
 *       Endpoint público (sin autenticación) que retorna todas las ciudades activas
 *       disponibles en la plataforma, incluyendo el nombre del país.
 *
 *       **Uso principal:**
 *       - Formularios de registro de Cliente y Técnico
 *       - Selección de ubicación en perfiles de usuario
 *       - Filtros de búsqueda geográfica
 *
 *       **Filtros opcionales:**
 *       - `id_pais`: Filtra ciudades de un país específico (ej: `?id_pais=1` para Colombia)
 *
 *       Solo retorna ciudades con `activo = true`.
 *     tags: [Ciudades]
 *     parameters:
 *       - in: query
 *         name: id_pais
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Filtrar ciudades por ID de país (opcional)
 *         example: 1
 *     responses:
 *       200:
 *         description: Lista de ciudades obtenida exitosamente
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
 *                   example: "Ciudades obtenidas exitosamente"
 *                 total:
 *                   type: integer
 *                   example: 8
 *                   description: Total de ciudades activas encontradas
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_ciudad:
 *                         type: integer
 *                         example: 1
 *                       nombre_ciudad:
 *                         type: string
 *                         example: "Cali"
 *                       id_pais:
 *                         type: integer
 *                         example: 1
 *                       nombre_pais:
 *                         type: string
 *                         example: "Colombia"
 *             examples:
 *               todas_ciudades:
 *                 summary: Todas las ciudades activas
 *                 value:
 *                   success: true
 *                   message: "Ciudades obtenidas exitosamente"
 *                   total: 8
 *                   data:
 *                     - id_ciudad: 1
 *                       nombre_ciudad: "Cali"
 *                       id_pais: 1
 *                       nombre_pais: "Colombia"
 *                     - id_ciudad: 2
 *                       nombre_ciudad: "Medellín"
 *                       id_pais: 1
 *                       nombre_pais: "Colombia"
 *                     - id_ciudad: 3
 *                       nombre_ciudad: "Bogotá"
 *                       id_pais: 1
 *                       nombre_pais: "Colombia"
 *               filtrado_por_pais:
 *                 summary: Ciudades filtradas por país
 *                 value:
 *                   success: true
 *                   message: "Ciudades obtenidas exitosamente"
 *                   total: 8
 *                   data:
 *                     - id_ciudad: 1
 *                       nombre_ciudad: "Cali"
 *                       id_pais: 1
 *                       nombre_pais: "Colombia"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerCiudades = async (req, res) => {
    try {
        // ----------------------------------------------------------------
        // 1. Extraer parámetros de query (opcionales)
        // ----------------------------------------------------------------
        const { id_pais } = req.query;

        // ----------------------------------------------------------------
        // 2. Validar id_pais si se proporciona
        // ----------------------------------------------------------------
        const where = { activo: true };

        if (id_pais) {
            const idPaisNum = parseInt(id_pais, 10);

            if (!Number.isInteger(idPaisNum) || idPaisNum < 1) {
                throw new ValidationError('El parámetro id_pais debe ser un entero positivo');
            }

            where.id_pais = idPaisNum;
        }

        // ----------------------------------------------------------------
        // 3. Consultar ciudades activas con información del país
        //    IMPORTANTE: La relación Ciudad.belongsTo(Pais) NO tiene alias
        //    en models/index.js, por lo que Sequelize usa el nombre del modelo
        // ----------------------------------------------------------------
        const ciudades = await Ciudad.findAll({
            where,
            include: [
                {
                    model: Pais,
                    as: 'Pais',
                    attributes: ['nombre_pais'],
                },
            ],
            attributes: ['id_ciudad', 'nombre_ciudad', 'id_pais'],
            order: [['nombre_ciudad', 'ASC']],
        });

        logger.info(
            `obtenerCiudades: ${ciudades.length} ciudades obtenidas${id_pais ? ` para id_pais=${id_pais}` : ''}`
        );

        return res.status(200).json({
            success: true,
            message: 'Ciudades obtenidas exitosamente',
            total: ciudades.length,
            data: ciudades.map((c) => ({
                id_ciudad: c.id_ciudad,
                nombre_ciudad: c.nombre_ciudad,
                id_pais: c.id_pais,
                nombre_pais: c.Pais?.nombre_pais ?? null,
            })),
        });
    } catch (error) {
        return handleError(res, error);
    }
};
