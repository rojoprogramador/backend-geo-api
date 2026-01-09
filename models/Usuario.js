import sequelize from "../config/database.js";
import { DataTypes } from "sequelize";

const Usuario = sequelize.define('Usuario',{
    id_usuario:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    nombre:{
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    apellido:{
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    fecha_nacimiento:{
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    correo_electronico:{
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    telefono:{
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    contraseña:{
        type: DataTypes.STRING,
        allowNull: false,
    },
    id_rol:{
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    id_tipoDoc:{
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    num_identificacion:{
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
    },
},{
    tableName: 'Usuario',
});

export default Usuario;