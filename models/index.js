import sequelize from "../config/database.js";


//Importar modelos
import Rol from "./Rol.js";
import Usuario from "./Usuario.js";
import TipoDoc from "./TipoDoc.js";
import Categoria from "./categoria.js";
import Subcategoria from "./subcategoria.js";

//Definir relaciones
//Relaciones de Rol y Usuario
Rol.hasMany(Usuario, { foreignKey: 'id_rol' });
Usuario.belongsTo(Rol, { foreignKey: 'id_rol' });

//Relaciones de TipoDoc y Usuario
TipoDoc.hasMany(Usuario, { foreignKey: 'id_tipoDoc' });
Usuario.belongsTo(TipoDoc, { foreignKey: 'id_tipoDoc' });

//Relaciones de Categoria y Subcategoria
Categoria.hasMany(Subcategoria, { foreignKey: 'id_categoria' });
Subcategoria.belongsTo(Categoria, { foreignKey: 'id_categoria' });

export {
    sequelize,
    Rol,
    Usuario,
    TipoDoc,
    Categoria,
    Subcategoria
};