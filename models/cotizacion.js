import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Cotizacion = sequelize.define('Cotizacion', {
    id_cotizacion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_solicitud: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    valor_cotizacion: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },    
    incluye_materiales: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    dias_garantia: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    tiempo_estimado: {
        type: DataTypes.STRING
    },
    descripcion: {
        type: DataTypes.TEXT
    },    
    estado: {
        type: DataTypes.ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA'),
        defaultValue: 'PENDIENTE'
    }
}, {
    tableName: 'Cotizacion',
    timestamps: true
});

export default Cotizacion;