import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const CuentaTecnico = sequelize.define('CuentaTecnico', {
    id_cuenta: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    saldo_disponible: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    saldo_pendiente: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    total_ganado: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    total_comisiones_plataforma: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    cuenta_bancaria: {
        type: DataTypes.STRING,
        allowNull: true
    },
    tipo_cuenta: {
        type: DataTypes.ENUM('AHORROS', 'CORRIENTE'),
        allowNull: true
    },
    banco: {
        type: DataTypes.STRING,
        allowNull: true
    },
    titular_cuenta: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'CuentaTecnico',
    timestamps: true
});

export default CuentaTecnico;
