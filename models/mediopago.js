import { DataTypes } from "sequelize";
import sequelize from "../config/database.js"

const MedioPago = sequelize.define('MedioPago', {
    id_medioPago: {
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
    tableName: 'MedioPago',
    timestamps: true
});

export default MedioPago;