import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Tecnico = sequelize.define('Tecnico', {
    id_tecnico: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_usuario: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    // Agregamos la FK en el modelo
    ciudad_base: {
        type: DataTypes.INTEGER
    },
    url_foto: {
        type: DataTypes.STRING
    },
    url_docId: {
        type: DataTypes.STRING
    },
    maneja_radio: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    radio_cobertura: {
        type: DataTypes.INTEGER
    },
    ubicacion_base: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: true
    },
    prom_calificacion: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    estado: {
        type: DataTypes.STRING,
        defaultValue: 'activo'
    },
    validado: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'Tecnico',
    timestamps: true
});

export default Tecnico;