# Geo-API

API REST para marketplace de servicios tecnicos con geolocalizacion y notificaciones en tiempo real, desarrollada con Node.js, Express, PostgreSQL + PostGIS y Socket.IO.

## Stack Tecnologico

- **Node.js 20+** / **Express 5** — Backend con ESM nativo
- **PostgreSQL 17 + PostGIS 3.5** — BD relacional con soporte geoespacial
- **Sequelize 6** — ORM con migraciones y seeders
- **Socket.IO 4** — WebSockets para notificaciones en tiempo real y tracking GPS
- **JWT + Bcrypt** — Autenticacion y autorizacion por roles (ADMIN, CLIENTE, TECNICO)
- **Multer** — Upload de archivos (foto de perfil)
- **Docker** — Contenedorizacion (desarrollo y tests)
- **Jest 30 + Supertest** — Tests unitarios e integracion
- **Swagger/OpenAPI 3.0** — Documentacion interactiva
- **Winston** — Logger estructurado
- **GitHub Actions + SonarCloud** — CI/CD y analisis de calidad

---

## Inicio Rapido

### Con Docker (recomendado)

```bash
git clone <repositorio>
cd geo-api
docker-compose up --build
docker-compose exec app npx sequelize-cli db:migrate
docker-compose exec app npx sequelize-cli db:seed:all
```

API disponible en `http://localhost:3000` | Swagger en `http://localhost:3000/api-docs`

### Sin Docker

```bash
npm install

# Configurar .env (ver .env.example)
# Crear BD PostgreSQL con extension PostGIS

npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev
```

---

## Estructura del Proyecto

```
geo-api/
├── config/              # Configuracion BD (Sequelize)
├── controllers/         # Logica de negocio (13 controladores)
├── middleware/           # authMiddleware (JWT + roles)
├── migrations/          # 31 migraciones Sequelize
├── models/              # 27 modelos Sequelize (incl. PostGIS)
├── routes/              # 11 archivos de rutas Express
├── seeders/             # 3 seeders (datos de referencia)
├── sockets/             # WebSocket (Socket.IO)
│   ├── auth/            # Autenticacion JWT en handshake
│   ├── constants/       # Eventos CLIENT_EVENTS / SERVER_EVENTS
│   ├── namespaces/      # 4 namespaces (solicitudes, cotizaciones, servicios, tracking)
│   └── services/        # Emitter, presenceManager, cotizacionBatcher
├── utils/               # Errores, logger, JWT, passwords, validators
├── docs/                # Swagger config, documentacion WebSocket
├── tests/               # Unit (489) + Integration (41) = 530 tests
│   ├── unit/            # Controllers, middleware, utils, sockets
│   └── integration/     # Flujos completos con BD real
├── uploads/             # Archivos subidos (fotos de perfil)
├── docker-compose.yml   # Entorno de desarrollo
└── docker-compose.test.yml  # BD aislada para tests
```

---

## Endpoints REST

### Autenticacion

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Iniciar sesion | No |
| PUT | `/api/auth/cambiar-contrasena` | Cambiar contrasena | Si |

### Clientes

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/clientes/registro` | Registro de cliente | No |
| GET | `/api/clientes/perfil` | Perfil del cliente | CLIENTE |
| PUT | `/api/clientes/perfil` | Actualizar perfil | CLIENTE |

### Tecnicos

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/tecnicos/registro` | Registro de tecnico | No |
| GET | `/api/tecnicos/perfil` | Perfil del tecnico (incluye url_foto) | TECNICO |
| PUT | `/api/tecnicos/perfil` | Actualizar perfil | TECNICO |
| POST | `/api/tecnicos/foto` | Subir foto de perfil | TECNICO |
| POST | `/api/tecnicos/especialidades` | Agregar especialidades (batch) | TECNICO |
| GET | `/api/tecnicos/especialidades` | Listar mis especialidades | TECNICO |
| DELETE | `/api/tecnicos/especialidades/:id` | Eliminar especialidad | TECNICO |
| POST | `/api/tecnicos/ciudades` | Agregar ciudades de operacion (batch) | TECNICO |
| GET | `/api/tecnicos/ciudades` | Listar mis ciudades | TECNICO |
| DELETE | `/api/tecnicos/ciudades/:id` | Eliminar ciudad | TECNICO |
| GET | `/api/tecnicos/pendientes` | Tecnicos por validar | ADMIN |
| GET | `/api/tecnicos/:id/detalle` | Detalle de tecnico | ADMIN |
| PUT | `/api/tecnicos/:id/aprobar` | Aprobar tecnico | ADMIN |
| PUT | `/api/tecnicos/:id/rechazar` | Rechazar tecnico | ADMIN |

### Solicitudes

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/solicitudes/inmediata` | Solicitud inmediata (busca tecnicos con PostGIS) | CLIENTE |
| POST | `/api/solicitudes/programada` | Solicitud programada | CLIENTE |
| GET | `/api/solicitudes/mis-solicitudes` | Listar mis solicitudes | CLIENTE |
| GET | `/api/solicitudes/:id` | Detalle de solicitud | CLIENTE/TECNICO |
| PUT | `/api/solicitudes/:id/cancelar` | Cancelar solicitud | CLIENTE |

### Cotizaciones

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/cotizaciones` | Enviar cotizacion | TECNICO |
| GET | `/api/cotizaciones/solicitud/:id` | Cotizaciones de una solicitud | CLIENTE |
| PUT | `/api/cotizaciones/:id/aceptar` | Aceptar cotizacion | CLIENTE |
| PUT | `/api/cotizaciones/:id/rechazar` | Rechazar cotizacion | CLIENTE |

### Servicios

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| PUT | `/api/servicios/iniciar/:id` | Iniciar servicio | TECNICO |
| PUT | `/api/servicios/:id/finalizar` | Finalizar servicio | TECNICO |

### Calificaciones

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/calificaciones` | Calificar servicio | CLIENTE |

### Catalogo

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/api/categorias` | Listar categorias | Si |
| POST | `/api/categorias` | Crear categoria | ADMIN |
| PUT | `/api/categorias/:id` | Actualizar categoria | ADMIN |
| DELETE | `/api/categorias/:id` | Eliminar categoria | ADMIN |
| GET | `/api/subcategorias` | Listar subcategorias (filtro: `?id_categoria=X`) | No |
| GET | `/api/subcategorias/:id` | Detalle subcategoria | No |
| POST | `/api/subcategorias` | Crear subcategoria | ADMIN |
| PUT | `/api/subcategorias/:id` | Actualizar subcategoria | ADMIN |
| DELETE | `/api/subcategorias/:id` | Eliminar subcategoria | ADMIN |
| GET | `/api/ciudades` | Listar ciudades | No |

Documentacion completa en **Swagger UI**: `http://localhost:3000/api-docs`

---

## WebSockets (Socket.IO)

La API usa Socket.IO v4 para notificaciones en tiempo real y tracking GPS. Conexion: `http://localhost:3000` con token JWT en el handshake.

### Namespaces

| Namespace | Descripcion |
|-----------|-------------|
| `/solicitudes` | Nuevas solicitudes a tecnicos, cancelaciones, asignaciones |
| `/cotizaciones` | Nuevas cotizaciones al cliente, aceptacion/rechazo |
| `/servicios` | Inicio/fin de servicio, calificaciones |
| `/tracking` | Ubicacion GPS del tecnico en tiempo real |

### Autenticacion WebSocket

```javascript
const socket = io('http://localhost:3000/solicitudes', {
  auth: { token: 'Bearer <JWT>' }
});
```

### Eventos principales

**Servidor -> Cliente:**
- `server:nueva_solicitud` — Nueva solicitud disponible para el tecnico
- `server:nueva_cotizacion` — El tecnico envio una cotizacion
- `server:cotizacion_aceptada` / `server:cotizacion_rechazada`
- `server:servicio_iniciado` / `server:servicio_finalizado`
- `server:calificacion_recibida`
- `server:tecnico_ubicacion` — Posicion GPS en tiempo real
- `server:tecnico_online` / `server:tecnico_offline`

**Cliente -> Servidor:**
- `client:join_solicitud_room` / `client:leave_solicitud_room`
- `client:join_cotizaciones_room`
- `client:tecnico_send_location` — Enviar GPS (throttle 3s)
- `client:join_tracking_room` / `client:leave_tracking_room`

Documentacion detallada con ejemplos React Native: [docs/websocket-events.md](docs/websocket-events.md)

---

## Flujo de Negocio

```
1. Cliente crea solicitud (inmediata/programada)
   -> PostGIS busca tecnicos cercanos -> WebSocket notifica

2. Tecnicos envian cotizaciones
   -> WebSocket notifica al cliente (batch: 5min o 5 cotizaciones)

3. Cliente acepta una cotizacion
   -> Se crea el servicio, se asigna el tecnico
   -> WebSocket notifica aceptacion al ganador, rechazo a los demas

4. Tecnico inicia el servicio
   -> Tracking GPS en tiempo real via WebSocket

5. Tecnico finaliza el servicio
   -> WebSocket notifica al cliente

6. Cliente califica al tecnico
   -> Se actualiza el promedio de calificacion
```

---

## Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **ADMIN** | Gestionar categorias/subcategorias, aprobar/rechazar tecnicos, ver detalle de tecnicos |
| **CLIENTE** | Registrarse, crear solicitudes, ver/aceptar/rechazar cotizaciones, calificar |
| **TECNICO** | Registrarse, gestionar perfil/especialidades/ciudades, cotizar, iniciar/finalizar servicios |

---

## Tests

```bash
npm test                  # Todos (530 tests)
npm run test:unit         # Solo unitarios (489, sin Docker)
npm run test:integration  # Solo integracion (41, requiere Docker)
npm run test:coverage     # Reporte de cobertura
```

Los tests de integracion levantan automaticamente un contenedor PostgreSQL + PostGIS en puerto 5434, ejecutan migraciones y seeders, y lo detienen al finalizar.

---

## Scripts Disponibles

```bash
npm start                 # Iniciar servidor (production)
npm run dev               # Desarrollo con hot-reload (--watch)
npm test                  # Ejecutar todos los tests
npm run test:unit         # Tests unitarios
npm run test:integration  # Tests de integracion
npm run test:coverage     # Cobertura de codigo
npm run db:migrate        # Ejecutar migraciones pendientes
npm run db:migrate:undo   # Revertir ultima migracion
npm run db:seed           # Ejecutar seeders
npm run db:seed:undo      # Revertir seeders
```

---

## Variables de Entorno

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geo_servicios_db
DB_USER=postgres
DB_PASSWORD=tu_contrasena
PORT=3000
NODE_ENV=development
JWT_SECRET=tu_secreto_seguro
JWT_EXPIRES_IN=24h
```

Ver `.env.example` para la configuracion completa.

---

## Archivos Estaticos

Las fotos de perfil se sirven via `express.static`:

```
GET /uploads/fotos/{filename}
```

La URL completa se retorna en `GET /api/tecnicos/perfil` como `url_foto`.

---

## Licencia

ISC
