/**
 * @fileoverview Constantes de eventos WebSocket.
 * Fuente única de verdad para nombres de eventos entre servidor y cliente.
 */

// =============================================
// CLIENTE → SERVIDOR (prefijo "client:")
// =============================================
export const CLIENT_EVENTS = {
    // /solicitudes namespace
    JOIN_SOLICITUD_ROOM:      'client:join_solicitud',
    LEAVE_SOLICITUD_ROOM:     'client:leave_solicitud',

    // /cotizaciones namespace
    JOIN_COTIZACIONES_ROOM:   'client:join_cotizaciones',

    // /tracking namespace
    TECNICO_SEND_LOCATION:    'client:tecnico_ubicacion',
    JOIN_TRACKING_ROOM:       'client:join_tracking',
    LEAVE_TRACKING_ROOM:      'client:leave_tracking',
};

// =============================================
// SERVIDOR → CLIENTE (prefijo "server:")
// =============================================
export const SERVER_EVENTS = {
    // --- /solicitudes namespace ---
    NUEVA_SOLICITUD:          'server:nueva_solicitud',
    SOLICITUD_CANCELADA:      'server:solicitud_cancelada',
    SOLICITUD_ASIGNADA:       'server:solicitud_asignada',

    // --- /cotizaciones namespace ---
    NUEVA_COTIZACION:         'server:nueva_cotizacion',
    COTIZACIONES_LISTAS:      'server:cotizaciones_listas',
    COTIZACION_ACEPTADA:      'server:cotizacion_aceptada',
    COTIZACION_RECHAZADA:     'server:cotizacion_rechazada',

    // --- /servicios namespace ---
    SERVICIO_INICIADO:        'server:servicio_iniciado',
    SERVICIO_FINALIZADO:      'server:servicio_finalizado',
    CALIFICACION_RECIBIDA:    'server:calificacion_recibida',

    // --- /tracking namespace ---
    TECNICO_UBICACION:        'server:tecnico_ubicacion',
    TECNICO_EN_CAMINO:        'server:tecnico_en_camino',
    TECNICO_CERCA:            'server:tecnico_cerca',
    TECNICO_LLEGO:            'server:tecnico_llego',

    // --- Global ---
    TECNICO_ONLINE:           'server:tecnico_online',
    TECNICO_OFFLINE:          'server:tecnico_offline',
    ERROR:                    'server:error',
};
