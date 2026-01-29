import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Pais = sequelize.define('Pais', {
    id_pais: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre_pais: {
        type: DataTypes.STRING,
        allowNull: false
    },
    activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'Pais',
    timestamps: true
});

export default Pais;