import sequelize from "../config/database.js";

//Importar modelos
import Rol from "./Rol.js";
import Usuario from "./Usuario.js";
import TipoDoc from "./TipoDoc.js";

//Definir relaciones
//Relaciones de Rol y Usuario
Rol.hasMany(Usuario, { foreignKey: 'id_rol' });
Usuario.belongsTo(Rol, { foreignKey: 'id_rol' });

//Relaciones de TipoDoc y Usuario
TipoDoc.hasMany(Usuario, { foreignKey: 'id_tipoDoc' });
Usuario.belongsTo(TipoDoc, { foreignKey: 'id_tipoDoc' });

export {
    sequelize,
    Rol,
    Usuario,
    TipoDoc
};