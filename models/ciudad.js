import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Ciudad = sequelize.define('Ciudad', {
    id_ciudad: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre_ciudad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    id_pais: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    ubicacion_centro: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: true
    },
    radio_ciudad_km: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 25
    }
}, {
    tableName: 'Ciudad',
    timestamps: true
});

export default Ciudad;