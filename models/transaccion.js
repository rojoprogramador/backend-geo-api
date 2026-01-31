import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Transaccion = sequelize.define('Transaccion', {
    id_transaccion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_servicio: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
    },
    monto_total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    monto_tecnico: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    comision_plataforma: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    id_medioPago: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    metodo_cobro: {
        type: DataTypes.ENUM('PLATAFORMA', 'EFECTIVO', 'CRUCE_CUENTAS'),
        allowNull: false,
        defaultValue: 'PLATAFORMA'
    },
    estado_pago: {
        type: DataTypes.ENUM('PENDIENTE', 'COMPLETADO', 'FALLIDO', 'REEMBOLSADO'),
        allowNull: false,
        defaultValue: 'PENDIENTE'
    },
    fecha_pago: {
        type: DataTypes.DATE,
        allowNull: true
    },
    comprobante_url: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'Transaccion',
    timestamps: true
});

export default Transaccion;
