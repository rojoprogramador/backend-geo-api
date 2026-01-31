import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Servicio = sequelize.define('Servicio', {
    id_servicio: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_cliente: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_subcategoria: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_medioPago: {
        type: DataTypes.INTEGER
    },
    id_estado: {
        type: DataTypes.INTEGER
    },
    ubicacion_servicio: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: true
    },
    imagenes: DataTypes.TEXT,
    valor_total: DataTypes.FLOAT,
    fecha_servicio: DataTypes.DATE
}, {
    tableName: 'Servicio',
    timestamps: true
});

export default Servicio;