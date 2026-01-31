import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Notificacion = sequelize.define('Notificacion', {
    id_notificacion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_usuario: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tipo: {
        type: DataTypes.ENUM(
            'NUEVA_SOLICITUD',
            'COTIZACION_RECIBIDA',
            'COTIZACION_ACEPTADA',
            'CITA_CONFIRMADA',
            'TECNICO_EN_CAMINO',
            'TECNICO_CERCA',
            'SERVICIO_INICIADO',
            'SERVICIO_COMPLETADO',
            'PAGO_RECIBIDO',
            'CALIFICACION_RECIBIDA',
            'VALIDACION_COMPLETADA'
        ),
        allowNull: false
    },
    titulo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    mensaje: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    datos_adicionales: {
        type: DataTypes.JSON,
        allowNull: true
    },
    leida: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    push_enviado: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    fecha_envio: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'Notificacion',
    timestamps: true
});

export default Notificacion;
