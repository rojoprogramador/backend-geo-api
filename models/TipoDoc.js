import sequelize from "../config/database.js";
import { DataTypes } from "sequelize";

const TipoDoc = sequelize.define('TipoDoc',{

    id_tipoDoc:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    descripcion:{
        type: DataTypes.STRING(50),
        allowNull: false,
    }
},{
    tableName: 'TipoDoc',
    timestamps: false,
});

export default TipoDoc;