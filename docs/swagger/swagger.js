import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Geo-API - Plataforma de Servicios Técnicos',
      version: '1.0.0',
      description: `
API REST para conectar clientes con técnicos de servicios del hogar en Cali, Colombia.

**Características principales:**
- 🌍 Geolocalización con PostGIS (búsqueda de técnicos cercanos)
- 🔐 Autenticación JWT + RBAC (3 roles: Admin, Cliente, Técnico)
- 💰 Sistema de cotizaciones y pagos
- ⭐ Calificaciones y comentarios
- 📱 Notificaciones push
- 🚀 Arquitectura escalable con Service Layer

**Tecnologías:**
Node.js 20 | Express 5 | PostgreSQL 17 + PostGIS 3.5 | Sequelize ORM
      `,
      contact: {
        name: 'Equipo Geo-API',
        email: 'camilobrsc718@gmail.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://18.219.47.14:3000/api',
        description: 'Servidor de Producción (AWS EC2)'
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Servidor de Desarrollo Local'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido del endpoint /auth/login. Formato: "Bearer {token}"'
        }
      },
      schemas: {
        // ========== ESQUEMAS COMUNES ==========
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Descripción del error'
            },
            errors: {
              type: 'array',
              items: { type: 'string' },
              example: ['El campo email es requerido', 'La contraseña debe tener al menos 8 caracteres']
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Operación exitosa'
            },
            data: {
              type: 'object',
              description: 'Datos de respuesta (varía según endpoint)'
            }
          }
        },
        Coordenadas: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: {
              type: 'number',
              format: 'double',
              minimum: -90,
              maximum: 90,
              example: 3.4516,
              description: 'Latitud en formato WGS84 (SRID 4326)'
            },
            lng: {
              type: 'number',
              format: 'double',
              minimum: -180,
              maximum: 180,
              example: -76.5320,
              description: 'Longitud en formato WGS84 (SRID 4326)'
            }
          }
        },

        // ========== USUARIO Y AUTENTICACIÓN ==========
        Usuario: {
          type: 'object',
          required: ['nombre', 'correo_electronico', 'contraseña', 'id_rol'],
          properties: {
            id_usuario: {
              type: 'integer',
              readOnly: true,
              example: 1
            },
            nombre: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              example: 'Juan Carlos'
            },
            apellido: {
              type: 'string',
              maxLength: 100,
              example: 'Pérez García'
            },
            correo_electronico: {
              type: 'string',
              format: 'email',
              example: 'juan.perez@example.com'
            },
            telefono: {
              type: 'string',
              pattern: '^[0-9]{10}$',
              example: '3001234567',
              description: 'Número celular de 10 dígitos'
            },
            contraseña: {
              type: 'string',
              format: 'password',
              writeOnly: true,
              minLength: 8,
              example: 'MiPassword123!'
            },
            fecha_nacimiento: {
              type: 'string',
              format: 'date',
              example: '1990-05-15'
            },
            id_rol: {
              type: 'integer',
              enum: [1, 2, 3],
              example: 2,
              description: '1 = Administrador, 2 = Cliente, 3 = Técnico'
            },
            id_tipoDoc: {
              type: 'integer',
              example: 1,
              description: '1 = CC, 2 = CE, 3 = Pasaporte'
            },
            num_identificacion: {
              type: 'string',
              maxLength: 20,
              example: '1234567890'
            },
            activo: {
              type: 'boolean',
              default: true,
              readOnly: true
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              readOnly: true
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['correo_electronico', 'contraseña'],
          properties: {
            correo_electronico: {
              type: 'string',
              format: 'email',
              example: 'admin@geo-api.com'
            },
            contraseña: {
              type: 'string',
              format: 'password',
              example: 'Admin123!'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Autenticación exitosa'
            },
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZF91c3VhcmlvIjoxLCJyb2wiOiJBZG1pbmlzdHJhZG9yIiwiaWF0IjoxNjQwMDAwMDAwLCJleHAiOjE2NDAwODY0MDB9.xyz123'
            },
            usuario: {
              type: 'object',
              properties: {
                nombre: {
                  type: 'string',
                  example: 'Admin Principal'
                },
                rol: {
                  type: 'string',
                  example: 'ADMIN'
                },
                estado_validacion: {
                  type: 'string',
                  enum: ['PENDIENTE_VALIDACION', 'ACTIVO', 'SUSPENDIDO', 'RECHAZADO', 'INACTIVO'],
                  example: 'ACTIVO',
                  description: 'Solo presente si el rol es TECNICO'
                },
                disponible_inmediato: {
                  type: 'boolean',
                  example: true,
                  description: 'Solo presente si el rol es TECNICO'
                },
                radio_cobertura_km: {
                  type: 'integer',
                  example: 10,
                  description: 'Radio de cobertura en km. Solo presente si el rol es TECNICO'
                }
              }
            }
          }
        },

        // ========== TÉCNICO ==========
        Tecnico: {
          type: 'object',
          properties: {
            id_tecnico: {
              type: 'integer',
              readOnly: true,
              example: 1
            },
            id_usuario: {
              type: 'integer',
              example: 5
            },
            ubicacion_base: {
              $ref: '#/components/schemas/Coordenadas'
            },
            radio_cobertura_km: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 10,
              example: 15,
              description: 'Radio de cobertura en kilómetros'
            },
            estado_validacion: {
              type: 'string',
              enum: ['PENDIENTE_VALIDACION', 'ACTIVO', 'SUSPENDIDO', 'RECHAZADO', 'INACTIVO'],
              readOnly: true,
              example: 'ACTIVO'
            },
            disponible_inmediato: {
              type: 'boolean',
              default: true,
              example: true
            },
            disponibilidad_horaria: {
              type: 'object',
              example: {
                lunes: { inicio: '08:00', fin: '18:00' },
                martes: { inicio: '08:00', fin: '18:00' }
              },
              description: 'Horarios de disponibilidad por día de la semana (JSON)'
            },
            especialidades: {
              type: 'array',
              items: {
                type: 'integer',
                description: 'ID de Subcategoría'
              },
              example: [1, 2, 5],
              description: 'IDs de las subcategorías en las que el técnico tiene experiencia'
            }
          }
        },

        // ========== SOLICITUD ==========
        Solicitud: {
          type: 'object',
          required: ['id_subcategoria', 'ubicacion', 'tipo_servicio', 'descripcion'],
          properties: {
            id_solicitud: {
              type: 'integer',
              readOnly: true,
              example: 42
            },
            id_cliente: {
              type: 'integer',
              readOnly: true,
              example: 3,
              description: 'Se obtiene automáticamente del token JWT'
            },
            id_subcategoria: {
              type: 'integer',
              example: 1,
              description: 'Tipo de servicio solicitado (ej: Plomería residencial)'
            },
            ubicacion: {
              $ref: '#/components/schemas/Coordenadas'
            },
            tipo_servicio: {
              type: 'string',
              enum: ['INMEDIATO', 'PROGRAMADO'],
              example: 'INMEDIATO',
              description: 'INMEDIATO: Técnico llega lo antes posible. PROGRAMADO: Cliente elige fecha/hora'
            },
            descripcion: {
              type: 'string',
              minLength: 10,
              maxLength: 500,
              example: 'Fuga de agua en la tubería de la cocina, necesito reparación urgente'
            },
            prioridad: {
              type: 'string',
              enum: ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'],
              default: 'MEDIA',
              example: 'ALTA'
            },
            id_estado: {
              type: 'integer',
              readOnly: true,
              example: 1,
              description: '1=PENDIENTE, 2=EN_PROCESO, 3=FINALIZADO, etc.'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              readOnly: true
            }
          }
        },

        // ========== COTIZACIÓN ==========
        Cotizacion: {
          type: 'object',
          required: ['id_solicitud', 'monto', 'descripcion'],
          properties: {
            id_cotizacion: {
              type: 'integer',
              readOnly: true,
              example: 15
            },
            id_solicitud: {
              type: 'integer',
              example: 42
            },
            id_tecnico: {
              type: 'integer',
              readOnly: true,
              example: 7,
              description: 'Se obtiene automáticamente del token JWT del técnico'
            },
            monto: {
              type: 'number',
              format: 'decimal',
              minimum: 0,
              example: 50000,
              description: 'Monto en pesos colombianos (COP)'
            },
            descripcion: {
              type: 'string',
              minLength: 10,
              maxLength: 1000,
              example: 'Reparación de tubería incluye: Materiales (PVC 1/2"), mano de obra, prueba de hermeticidad. Tiempo estimado: 2 horas.'
            },
            tiempo_estimado_horas: {
              type: 'integer',
              minimum: 1,
              example: 2,
              description: 'Tiempo estimado de duración del servicio'
            },
            estado: {
              type: 'string',
              enum: ['PENDIENTE', 'ACEPTADA', 'RECHAZADA'],
              default: 'PENDIENTE',
              readOnly: true
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              readOnly: true
            }
          }
        },

        // ========== CITA ==========
        Cita: {
          type: 'object',
          properties: {
            id_cita: {
              type: 'integer',
              readOnly: true,
              example: 25
            },
            id_solicitud: {
              type: 'integer',
              example: 42,
              description: 'Referencia a la solicitud (de aquí se obtiene cliente y técnico)'
            },
            fecha_programada: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-10T14:00:00Z',
              description: 'Fecha y hora acordada para el servicio'
            },
            estado_cita: {
              type: 'string',
              enum: ['PROGRAMADA', 'CONFIRMADA', 'EN_CAMINO', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'],
              example: 'PROGRAMADA'
            },
            id_motivo_cancelacion: {
              type: 'integer',
              nullable: true,
              example: null,
              description: 'ID del motivo si la cita fue cancelada'
            }
          }
        },

        // ========== SERVICIO ==========
        Servicio: {
          type: 'object',
          properties: {
            id_servicio: {
              type: 'integer',
              readOnly: true,
              example: 18
            },
            id_solicitud: {
              type: 'integer',
              example: 42
            },
            fecha_inicio: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-10T14:15:00Z'
            },
            fecha_fin: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-02-10T16:30:00Z'
            },
            monto_final: {
              type: 'number',
              format: 'decimal',
              example: 55000,
              description: 'Puede diferir del monto de cotización si hubo ajustes'
            },
            observaciones: {
              type: 'string',
              maxLength: 1000,
              example: 'Servicio completado exitosamente. Se reemplazó tubería adicional.'
            }
          }
        },

        // ========== CALIFICACIÓN ==========
        Calificacion: {
          type: 'object',
          required: ['id_servicio', 'puntuacion', 'comentario'],
          properties: {
            id_calificacion: {
              type: 'integer',
              readOnly: true
            },
            id_servicio: {
              type: 'integer',
              example: 18
            },
            puntuacion: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              example: 5,
              description: 'Calificación de 1 a 5 estrellas'
            },
            comentario: {
              type: 'string',
              minLength: 10,
              maxLength: 500,
              example: 'Excelente servicio, muy profesional y puntual. Lo recomiendo 100%'
            },
            tipo_calificacion: {
              type: 'string',
              enum: ['CLIENTE_A_TECNICO', 'TECNICO_A_CLIENTE'],
              example: 'CLIENTE_A_TECNICO'
            }
          }
        }
      },

      responses: {
        UnauthorizedError: {
          description: 'Token de autenticación inválido, expirado o no proporcionado',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Token inválido o expirado'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Acceso denegado - El usuario no tiene permisos suficientes',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Acceso denegado: No tienes permiso para realizar esta acción'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Recurso no encontrado',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Recurso no encontrado'
              }
            }
          }
        },
        ValidationError: {
          description: 'Error de validación de datos enviados',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Error de validación',
                errors: [
                  'El campo email es requerido',
                  'La contraseña debe tener al menos 8 caracteres',
                  'Las coordenadas GPS son inválidas'
                ]
              }
            }
          }
        },
        ServerError: {
          description: 'Error interno del servidor',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                message: 'Error interno del servidor'
              }
            }
          }
        }
      }
    },

    tags: [
      {
        name: 'Autenticación',
        description: 'Endpoints de login, registro y gestión de sesiones JWT'
      },
      {
        name: 'Usuarios',
        description: 'CRUD de usuarios (Solo Administrador)'
      },
      {
        name: 'Clientes',
        description: 'Gestión de perfiles de clientes'
      },
      {
        name: 'Tecnicos',
        description: 'Registro, validación, especialidades y disponibilidad de técnicos'
      },
      {
        name: 'Categorías',
        description: 'CRUD de categorías de servicios (Admin)'
      },
      {
        name: 'Subcategorías',
        description: 'CRUD de subcategorías de servicios (Admin)'
      },
      {
        name: 'Solicitudes',
        description: 'Crear y gestionar solicitudes de servicio'
      },
      {
        name: 'Cotizaciones',
        description: 'Enviar, aceptar y rechazar cotizaciones de técnicos'
      },
      {
        name: 'Servicios',
        description: 'Gestión de servicios activos y completados'
      },
      {
        name: 'Calificaciones',
        description: 'Sistema de ratings y comentarios bidireccional'
      },
      {
        name: 'Admin',
        description: 'Endpoints administrativos (validación de técnicos, reportes)'
      },
      {
        name: 'Citas',
        description: '(Pendiente de implementación) Programar y gestionar citas de servicio'
      },
      {
        name: 'Transacciones',
        description: '(Pendiente de implementación) Gestión de pagos y billetera de técnicos'
      },
      {
        name: 'Geolocalización',
        description: '(Pendiente de implementación) Búsqueda de técnicos cercanos usando PostGIS'
      },
      {
        name: 'Ciudades',
        description: 'Consulta de ciudades disponibles en la plataforma'
      }
    ]
  },

  // Rutas donde buscar anotaciones JSDoc
  apis: [
    join(__dirname, '../../routes/*.js'),
    join(__dirname, '../../controllers/*.js')
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
