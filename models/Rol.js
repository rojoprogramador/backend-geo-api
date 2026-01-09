import sequelize from "../config/database.js";
import { DataTypes } from "sequelize";

const Rol = sequelize.define('Rol', {

    id_rol:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    descripcion:{
        type: DataTypes.STRING(50),
        allowNull: false,
    }
},{
    tableName: 'Rol',
    timestamps: false,
});

export default Rol;