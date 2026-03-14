import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const CiudadTecnico = sequelize.define('CiudadTecnico', {
    id_ciudad_tecnico: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_ciudad: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    tableName: 'CiudadTecnico',
    timestamps: true
});

export default CiudadTecnico;
