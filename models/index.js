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
import MedioPago from "./mediopago.js";
import Servicio from "./servicio.js";
import Calificacion from "./calificacion.js";
import Garantia from "./garantia.js";
import Transaccion from "./transaccion.js";
import Notificacion from "./notificacion.js";
import TecnicoSolicitudQueue from "./tecnicosolicitudqueue.js";
import TrackingUbicacion from "./trackingubicacion.js";
import CuentaTecnico from "./cuentatecnico.js";
import CiudadTecnico from "./ciudadtecnico.js";

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
Ciudad.belongsTo(Pais, { foreignKey: 'id_pais', as: 'Pais' });

// Ciudad -> Usuario
Ciudad.hasMany(Usuario, { foreignKey: 'id_ciudad' });
Usuario.belongsTo(Ciudad, { foreignKey: 'id_ciudad' });

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

// Usuario (Admin) valida a Técnicos
Usuario.hasMany(Tecnico, { foreignKey: 'validado_por', as: 'tecnicos_validados' });
Tecnico.belongsTo(Usuario, { foreignKey: 'validado_por', as: 'admin_validador' });

// === DETALLES DEL TÉCNICO ===
// Certificados
Tecnico.hasMany(CertificadoTecnico, { foreignKey: 'id_tecnico', as: 'certificados' });
CertificadoTecnico.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// Especialidades (Muchos a Muchos: TECNICO <-> Subcategoria)
Tecnico.belongsToMany(Subcategoria, { through: Especialidad, foreignKey: 'id_tecnico', otherKey: 'id_subcategoria', as: 'especialidades' });
Subcategoria.belongsToMany(Tecnico, { through: Especialidad, foreignKey: 'id_subcategoria', otherKey: 'id_tecnico', as: 'tecnicos' });

// Ciudades de operación (Muchos a Muchos: TECNICO <-> Ciudad)
Tecnico.belongsToMany(Ciudad, { through: CiudadTecnico, foreignKey: 'id_tecnico', otherKey: 'id_ciudad', as: 'ciudades_operacion' });
Ciudad.belongsToMany(Tecnico, { through: CiudadTecnico, foreignKey: 'id_ciudad', otherKey: 'id_tecnico', as: 'tecnicos_operan' });

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

// === CITAS ===
// Solicitud -> Cita (1:N)
Solicitud.hasMany(Cita, { foreignKey: 'id_solicitud', as: 'citas' });
Cita.belongsTo(Solicitud, { foreignKey: 'id_solicitud', as: 'solicitud' });

// Estado -> Cita
EstadoSolicitud.hasMany(Cita, { foreignKey: 'id_estado' });
Cita.belongsTo(EstadoSolicitud, { foreignKey: 'id_estado', as: 'estado' });

// MotivoCancelacion -> Cita (opcional)
MotivoCancelacion.hasMany(Cita, { foreignKey: 'id_motivo_cancelacion' });
Cita.belongsTo(MotivoCancelacion, { foreignKey: 'id_motivo_cancelacion', as: 'motivo_cancelacion' });

// === SERVICIOS (Ejecución del trabajo) ===

// 0. Solicitud -> Servicio (Trazabilidad)
Solicitud.hasMany(Servicio, { foreignKey: 'id_solicitud', as: 'servicios_generados' });
Servicio.belongsTo(Solicitud, { foreignKey: 'id_solicitud', as: 'solicitud_origen' });

// 1. Medio de Pago -> Servicio
MedioPago.hasMany(Servicio, { foreignKey: 'id_medioPago' });
Servicio.belongsTo(MedioPago, { foreignKey: 'id_medioPago', as: 'medio_pago' });

// 2. Cliente -> Historial de Servicios
Cliente.hasMany(Servicio, { foreignKey: 'id_cliente', as: 'historial_servicios' });
Servicio.belongsTo(Cliente, { foreignKey: 'id_cliente', as: 'cliente' });

// 3. Tecnico -> Servicios Realizados
Tecnico.hasMany(Servicio, { foreignKey: 'id_tecnico', as: 'servicios_realizados' });
Servicio.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// 4. Subcategoria -> Servicio
Subcategoria.hasMany(Servicio, { foreignKey: 'id_subcategoria' });
Servicio.belongsTo(Subcategoria, { foreignKey: 'id_subcategoria', as: 'subcategoria' });

// 5. Estado -> Servicio
EstadoSolicitud.hasMany(Servicio, { foreignKey: 'id_estado' });
Servicio.belongsTo(EstadoSolicitud, { foreignKey: 'id_estado', as: 'estado' });


// === CALIFICACIONES ===

// 1. Servicio <-> Calificación (Relación 1 a 1)
Servicio.hasOne(Calificacion, { foreignKey: 'id_servicio', as: 'calificacion' });
Calificacion.belongsTo(Servicio, { foreignKey: 'id_servicio', as: 'servicio' });

// 2. Cliente califica
Cliente.hasMany(Calificacion, { foreignKey: 'id_cliente', as: 'calificaciones_dadas' });
Calificacion.belongsTo(Cliente, { foreignKey: 'id_cliente', as: 'cliente' });

// 3. Tecnico es calificado
Tecnico.hasMany(Calificacion, { foreignKey: 'id_tecnico', as: 'calificaciones_recibidas' });
Calificacion.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });

// *NOTA: Aquí NO ponemos relación con Subcategoria, tal como lo pediste.*


// === GARANTIAS ===

// 1. Servicio <-> Garantía (Relación 1 a 1)
Servicio.hasOne(Garantia, { foreignKey: 'id_servicio', as: 'garantia' });
Garantia.belongsTo(Servicio, { foreignKey: 'id_servicio', as: 'servicio' });


// === TRANSACCIONES ===

// Servicio <-> Transaccion (Relación 1:1)
Servicio.hasOne(Transaccion, { foreignKey: 'id_servicio', as: 'transaccion' });
Transaccion.belongsTo(Servicio, { foreignKey: 'id_servicio', as: 'servicio' });

// MedioPago -> Transaccion
MedioPago.hasMany(Transaccion, { foreignKey: 'id_medioPago' });
Transaccion.belongsTo(MedioPago, { foreignKey: 'id_medioPago', as: 'medio_pago' });


// === NOTIFICACIONES ===

// Usuario recibe notificaciones
Usuario.hasMany(Notificacion, { foreignKey: 'id_usuario', as: 'notificaciones' });
Notificacion.belongsTo(Usuario, { foreignKey: 'id_usuario', as: 'usuario' });


// === COLA DE TÉCNICOS (Queue) ===

// Solicitud -> Queue (Técnicos notificados)
Solicitud.hasMany(TecnicoSolicitudQueue, { foreignKey: 'id_solicitud', as: 'tecnicos_notificados' });
TecnicoSolicitudQueue.belongsTo(Solicitud, { foreignKey: 'id_solicitud', as: 'solicitud' });

// Tecnico -> Queue (Solicitudes recibidas)
Tecnico.hasMany(TecnicoSolicitudQueue, { foreignKey: 'id_tecnico', as: 'solicitudes_recibidas' });
TecnicoSolicitudQueue.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });


// === TRACKING DE UBICACIÓN ===

// Cita -> Tracking (Puntos GPS del técnico en camino)
Cita.hasMany(TrackingUbicacion, { foreignKey: 'id_cita', as: 'puntos_tracking' });
TrackingUbicacion.belongsTo(Cita, { foreignKey: 'id_cita', as: 'cita' });

// Tecnico -> Tracking
Tecnico.hasMany(TrackingUbicacion, { foreignKey: 'id_tecnico', as: 'historial_tracking' });
TrackingUbicacion.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });


// === CUENTA DEL TÉCNICO ===

// Tecnico <-> CuentaTecnico (Relación 1:1)
Tecnico.hasOne(CuentaTecnico, { foreignKey: 'id_tecnico', as: 'cuenta' });
CuentaTecnico.belongsTo(Tecnico, { foreignKey: 'id_tecnico', as: 'tecnico' });


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
    MotivoCancelacion,
    MedioPago,
    Servicio,
    Calificacion,
    Garantia,
    Transaccion,
    Notificacion,
    TecnicoSolicitudQueue,
    TrackingUbicacion,
    CuentaTecnico,
    CiudadTecnico
};