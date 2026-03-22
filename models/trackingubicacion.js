import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const TrackingUbicacion = sequelize.define('TrackingUbicacion', {
    id_tracking: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_cita: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    id_solicitud: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ubicacion_actual: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: false
    },
    velocidad_kmh: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    en_movimiento: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'TrackingUbicacion',
    timestamps: true
});

export default TrackingUbicacion;
