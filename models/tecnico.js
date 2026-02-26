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
    ubicacion_base: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: true
    },
    radio_cobertura_km: {
        type: DataTypes.INTEGER,
        defaultValue: 10
    },
    disponibilidad_horaria: {
        type: DataTypes.JSON,
        allowNull: true
    },
    disponible_inmediato: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    prom_calificacion: {
        type: DataTypes.FLOAT,
        defaultValue: 0.0
    },
    estado_validacion: {
        type: DataTypes.ENUM('PENDIENTE_VALIDACION', 'ACTIVO', 'SUSPENDIDO', 'RECHAZADO', 'INACTIVO'),
        allowNull: false,
        defaultValue: 'PENDIENTE_VALIDACION'
    },
    fecha_validacion: {
        type: DataTypes.DATE,
        allowNull: true
    },
    validado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'Tecnico',
    timestamps: true
});

export default Tecnico;