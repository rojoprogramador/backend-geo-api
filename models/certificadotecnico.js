import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const CertificadoTecnico = sequelize.define('Certificado_Tecnico', {
    id_cert: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    id_tecnico: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ruta: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'Certificado_Tecnico',
    timestamps: true
});

export default CertificadoTecnico;