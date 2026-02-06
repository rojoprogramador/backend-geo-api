import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Calificacion = sequelize.define('Calificacion', {
    id_calificacion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_servicio: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_cliente: DataTypes.INTEGER,
    id_tecnico: DataTypes.INTEGER,
    puntuacion: {
        type: DataTypes.INTEGER,
        validate: { min: 1, max: 5 }
    },
    comentario: DataTypes.TEXT,
    fecha_calificacion: DataTypes.DATE
}, {
    tableName: 'Calificacion',
    timestamps: true
});

export default Calificacion;
