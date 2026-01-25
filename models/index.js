import sequelize from "../config/database.js";


//Importar modelos
import Rol from "./Rol.js";
import Usuario from "./Usuario.js";
import TipoDoc from "./TipoDoc.js";
import Categoria from "./categoria.js";
import Subcategoria from "./subcategoria.js";
import Solicitud from "./solicitud.js";
import Especialidad from "./especialidad.js";
import Cotizacion from "./cotizacion.js";

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

//Relaciones de Subcategoria y Solicitud
Subcategoria.hasMany(Solicitud, {  foreignKey: 'id_subcategoria', as: 'solicitudes' });
Solicitud.belongsTo(Subcategoria, { foreignKey: 'id_subcategoria', as: 'subcategoria' });

//Relacion de Usuario (Cliente) y Solicitud
Usuario.hasMany(Solicitud, { foreignKey: 'id_cliente', as: 'solicitudes_creadas' });
Solicitud.belongsTo(Usuario, { foreignKey: 'id_cliente', as: 'cliente' });

//Relacion de Usuario (Tecnico) y Solicitud
Usuario.hasMany(Solicitud, { foreignKey: 'id_tecnico', as: 'solicitudes_asignadas' });
Solicitud.belongsTo(Usuario, { foreignKey: 'id_tecnico', as: 'tecnico' });

//Relaciones de especialidad(muchos a muchos) entre Usuario y Subcategoria a traves de Especialidad
Usuario.belongsToMany(Subcategoria, { through: Especialidad, foreignKey: 'id_tecnico', otherKey: 'id_subcategoria', as: 'especialidades' });
Subcategoria.belongsToMany(Usuario, { through: Especialidad, foreignKey: 'id_subcategoria', otherKey: 'id_tecnico', as: 'tecnicos' });

//Relacion de Solitud y cotizacion
Solicitud.hasMany(Cotizacion, { foreignKey: 'id_solicitud', as: 'cotizaciones' });
Cotizacion.belongsTo(Solicitud, { foreignKey: 'id_solicitud', as: 'solicitud' });

//Relacion de Usuario (Tecnico) y Cotizacion
Usuario.hasMany(Cotizacion, { foreignKey: 'id_tecnico', as: 'cotizaciones_realizadas' });
Cotizacion.belongsTo(Usuario, { foreignKey: 'id_tecnico', as: 'tecnico' });

export {
    sequelize,
    Rol,
    Usuario,
    TipoDoc,
    Categoria,
    Subcategoria,
    Solicitud,
    Especialidad,
    Cotizacion
};