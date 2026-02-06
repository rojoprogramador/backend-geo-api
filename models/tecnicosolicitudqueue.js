import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const TecnicoSolicitudQueue = sequelize.define('TecnicoSolicitudQueue', {
    id_cola: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_solicitud: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fecha_notificacion: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    fecha_respuesta: {
        type: DataTypes.DATE,
        allowNull: true
    },
    estado_respuesta: {
        type: DataTypes.ENUM(
            'NOTIFICADO',
            'VISTO',
            'COTIZADO',
            'RECHAZADO',
            'IGNORADO'
        ),
        allowNull: false,
        defaultValue: 'NOTIFICADO'
    },
    motivo_rechazo: {
        type: DataTypes.STRING,
        allowNull: true
    },
    priority_score: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'TecnicoSolicitudQueue',
    timestamps: true
});

export default TecnicoSolicitudQueue;
