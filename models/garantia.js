import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Garantia = sequelize.define('Garantia', {
    id_garantia: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_servicio: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tiempo_validez: DataTypes.STRING,
    fecha_expiracion: DataTypes.DATE
}, {
    tableName: 'Garantia',
    timestamps: true
});

export default Garantia;