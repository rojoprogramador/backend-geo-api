import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const EstadoSolicitud = sequelize.define('EstadoSolicitud', {
    id_estado: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    descripcion: {
        type: DataTypes.STRING,
        allowNull: false
    },
    activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'EstadoSolicitud',
    timestamps: true
});

export default EstadoSolicitud;