import sequelize from "../config/database.js";

// --- 1. IMPORTAR TODOS LOS MODELOS ---
import Rol from "./Rol.js";
import TipoDoc from "./TipoDoc.js";
import Usuario from "./Usuario.js";
import Pais from "./pais.js";                  
import Ciudad from "./ciudad.js";              
import Cliente from "./Cliente.js";          
import Tecnico from "./tecnico.js";          
import CertificadoTecnico from "./certificadotecnico.js"; 
import Categoria from "./categoria.js";
import Subcategoria from "./subcategoria.js";
import Especialidad from "./especialidad.js";
import EstadoSolicitud from "./estadosolicitud.js"; 
import Solicitud from "./solicitud.js";
import Cotizacion from "./cotizacion.js";
import Cita from "./cita.js";                  
import MotivoCancelacion from "./motivocancelacion.js";

// --- 2. DEFINIR RELACIONES ---

// === USUARIO BASE ===
// Rol y Usuario
Rol.hasMany(Usuario, { foreignKey: 'id_rol' });
Usuario.belongsTo(Rol, { foreignKey: 'id_rol' });

// TipoDoc y Usuario
TipoDoc.hasMany(Usuario, { foreignKey: 'id_tipoDoc' });
Usuario.belongsTo(TipoDoc, { foreignKey: 'id_tipoDoc' });

// UBICACIÓN 
// Pais -> Ciudad
Pais.hasMany(Ciudad, { foreignKey: 'id_pais' });
Ciudad.belongsTo(Pais, { foreignKey: 'id_pais' });

// Ciudad -> Tecnico (Ubicación base)
Ciudad.hasMany(Tecnico, { foreignKey: 'ciudad_base' });
Tecnico.belongsTo(Ciudad, { foreignKey: 'ciudad_base' });

// HERENCIA DE USUARIOS 
// Usuario -> Cliente (1 a 1)
Usuario.hasOne(Cliente, { foreignKey: 'id_usuario', as: 'perfil_cliente' });
Cliente.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'datos_usuario' });

// Usuario -> Tecnico (1 a 1)
Usuario.hasOne(Tecnico, { foreignKey: 'id_usuario', as: 'perfil_tecnico' });
Tecnico.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'datos_usuario' });

// === DETALLES DEL TÉCNICO ===
// Certificados
Tecnico.hasMany(CertificadoTecnico, { foreignKey: 'id_tecnico', as: 'certificados' });
CertificadoTecnico.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// Especialidades (Muchos a Muchos: TECNICO <-> Subcategoria)
Tecnico.belongsToMany(Subcategoria, { through: Especialidad, foreignKey: 'id_tecnico', otherKey: 'id_subcategoria', as: 'especialidades' });
Subcategoria.belongsToMany(Tecnico, { through: Especialidad, foreignKey: 'id_subcategoria', otherKey: 'id_tecnico', as: 'tecnicos' });

// === CATEGORÍAS ===
Categoria.hasMany(Subcategoria, { foreignKey: 'id_categoria' });
Subcategoria.belongsTo(Categoria, { foreignKey: 'id_categoria' });

// === SOLICITUDES ===
// Cliente crea solicitud 
Cliente.hasMany(Solicitud, { foreignKey: 'id_cliente', as: 'mis_solicitudes' });
Solicitud.belongsTo(Cliente, { foreignKey: 'id_cliente', as: 'cliente' });

// Tecnico recibe solicitud 
Tecnico.hasMany(Solicitud, { foreignKey: 'id_tecnico', as: 'trabajos_asignados' });
Solicitud.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// Subcategoria de la solicitud
Subcategoria.hasMany(Solicitud, { foreignKey: 'id_subcategoria', as: 'solicitudes' });
Solicitud.belongsTo(Subcategoria, { foreignKey: 'id_subcategoria', as: 'subcategoria' });

// Estado de la solicitud 
EstadoSolicitud.hasMany(Solicitud, { foreignKey: 'id_estado' });
Solicitud.belongsTo(EstadoSolicitud, { foreignKey: 'id_estado', as: 'estado' });

// === COTIZACIONES ===
Solicitud.hasMany(Cotizacion, { foreignKey: 'id_solicitud', as: 'cotizaciones' });
Cotizacion.belongsTo(Solicitud, { foreignKey: 'id_solicitud', as: 'solicitud' });

// Tecnico hace cotización 
Tecnico.hasMany(Cotizacion, { foreignKey: 'id_tecnico' });
Cotizacion.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// === CITAS (Nuevo) ===
// Solicitud -> Cita
Solicitud.hasMany(Cita, { foreignKey: 'id_solicitud', as: 'citas' });
Cita.belongsTo(Solicitud, { foreignKey: 'id_solicitud', as: 'solicitud' });

// Cliente -> Cita
Cliente.hasMany(Cita, { foreignKey: 'id_cliente', as: 'citas_programadas' });
Cita.belongsTo(Cliente, { foreignKey: 'id_cliente', as: 'cliente' });

// Tecnico -> Cita
Tecnico.hasMany(Cita, { foreignKey: 'id_tecnico', as: 'citas_asignadas' });
Cita.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// Estado -> Cita
EstadoSolicitud.hasMany(Cita, { foreignKey: 'id_estado' });
Cita.belongsTo(EstadoSolicitud, { foreignKey: 'id_estado', as: 'estado' });

// --- 3. EXPORTAR TODO ---
export {
    sequelize,
    Rol,
    Usuario,
    TipoDoc,
    Pais,          
    Ciudad,        
    Cliente,     
    Tecnico,        
    CertificadoTecnico, 
    Categoria,
    Subcategoria,
    Especialidad,
    EstadoSolicitud, 
    Solicitud,
    Cotizacion,
    Cita,          
    MotivoCancelacion
};