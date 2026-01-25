import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Especialidad = sequelize.define('Especialidad', {
    id_especialidad: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_subcategoria: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    experiencia: DataTypes.STRING,
    precio_estimado: DataTypes.DECIMAL(10, 2)
}, {
    tableName: 'Especialidad',
    timestamps: true
});

export default Especialidad;