import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Cita = sequelize.define('Cita', {
    id_cita: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_solicitud: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fecha_cita: {
        type: DataTypes.DATE,
        allowNull: false
    },
    ubicacion_cita: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: true
    },
    id_estado: {
        type: DataTypes.INTEGER
    },
    id_motivo_cancelacion: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'Cita',
    timestamps: true
});

export default Cita;