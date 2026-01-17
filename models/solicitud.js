import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Solicitud = sequelize.define('Solicitud', {
    id_solicitud: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    descripcion: DataTypes.TEXT,
    imagenes: DataTypes.TEXT,
    
    // Configuración PostGIS
    ubicacion_solicitud: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: false
    },
    
    valor_solicitud: DataTypes.DECIMAL(10, 2),
    num_rechazos: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    fecha_solicitud: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    estado: DataTypes.STRING, 
    prioridad: DataTypes.STRING,
    
    // Definición explícita de llaves foráneas
    id_cliente: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    id_subcategoria: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    tableName: 'Solicitud',
    timestamps: true
});

export default Solicitud;