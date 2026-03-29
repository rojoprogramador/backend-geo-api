import { Op } from 'sequelize';
import { sequelize, Solicitud, TecnicoSolicitudQueue } from '../models/index.js';
import logger from '../utils/logger.js';

const ESTADO_PENDIENTE = 1;
const ESTADO_BUSCANDO_TECNICOS = 2;
const ESTADO_COTIZANDO = 3;

let sweepTimer = null;

const getTtlMinutes = () => {
    const raw = Number.parseInt(process.env.INMEDIATA_TTL_MIN || '20', 10);
    return Number.isInteger(raw) && raw > 0 ? raw : 20;
};

const getSweepSeconds = () => {
    const raw = Number.parseInt(process.env.INMEDIATA_EXPIRY_SWEEP_SEC || '60', 10);
    return Number.isInteger(raw) && raw > 0 ? raw : 60;
};

export const getInmediataCutoffDate = () => {
    return new Date(Date.now() - getTtlMinutes() * 60 * 1000);
};

const sweepExpiredImmediateRequests = async () => {
    const cutoff = getInmediataCutoffDate();

    const expiradas = await Solicitud.findAll({
        attributes: ['id_solicitud'],
        where: {
            tipo_servicio: 'INMEDIATO',
            id_estado: { [Op.in]: [ESTADO_BUSCANDO_TECNICOS, ESTADO_COTIZANDO] },
            id_tecnico: null,
            fecha_solicitud: { [Op.lte]: cutoff },
        },
    });

    if (expiradas.length === 0) return;

    const ids = expiradas.map((s) => s.id_solicitud);
    const t = await sequelize.transaction();

    try {
        const [colasActualizadas] = await TecnicoSolicitudQueue.update(
            {
                estado_respuesta: 'IGNORADO',
                motivo_rechazo: 'EXPIRADA_TTL',
                fecha_respuesta: new Date(),
            },
            {
                where: {
                    id_solicitud: { [Op.in]: ids },
                    estado_respuesta: { [Op.in]: ['NOTIFICADO', 'VISTO'] },
                },
                transaction: t,
            }
        );

        const [solicitudesActualizadas] = await Solicitud.update(
            { id_estado: ESTADO_PENDIENTE },
            {
                where: {
                    id_solicitud: { [Op.in]: ids },
                    id_estado: { [Op.in]: [ESTADO_BUSCANDO_TECNICOS, ESTADO_COTIZANDO] },
                    id_tecnico: null,
                },
                transaction: t,
            }
        );

        await t.commit();

        logger.info(
            `inmediataExpiry: ${solicitudesActualizadas} solicitud(es) expiradas -> PENDIENTE, ` +
            `${colasActualizadas} entrada(s) de cola -> IGNORADO`
        );
    } catch (error) {
        await t.rollback();
        logger.error(`inmediataExpiry: error en sweep: ${error.message}`);
    }
};

export const startInmediataExpirySweeper = () => {
    if (sweepTimer) return;

    const intervalMs = getSweepSeconds() * 1000;
    sweepTimer = setInterval(() => {
        sweepExpiredImmediateRequests().catch((error) => {
            logger.error(`inmediataExpiry: fallo no controlado: ${error.message}`);
        });
    }, intervalMs);

    if (typeof sweepTimer.unref === 'function') {
        sweepTimer.unref();
    }

    logger.info(
        `inmediataExpiry: sweeper iniciado (ttl=${getTtlMinutes()}min, intervalo=${getSweepSeconds()}s)`
    );
};
