import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Categoria from './categoria.js';

const Subcategoria = sequelize.define('Subcategoria', {
    id_subcategoria: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    descripcion: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    id_categoria: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Categoria,
            key: 'id_categoria'
        }
    }
}, {
    tableName: 'Subcategoria',
    timestamps: true
});

export default Subcategoria;