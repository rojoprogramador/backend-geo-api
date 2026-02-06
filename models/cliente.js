import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Cliente = sequelize.define('Cliente', {
    id_cliente: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_usuario: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    }
}, {
    tableName: 'Cliente',
    timestamps: true
});

export default Cliente;