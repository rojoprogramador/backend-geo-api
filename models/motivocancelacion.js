import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MotivoCancelacion = sequelize.define('MotivoCancelacion', {
    id_motivo: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    descripcion: DataTypes.STRING,
    activo: DataTypes.BOOLEAN
}, {
    tableName: 'MotivoCancelacion',
    timestamps: true
});

export default MotivoCancelacion;