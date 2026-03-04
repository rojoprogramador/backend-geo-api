# Geo-API

API REST para marketplace de servicios tecnicos con geolocalizacion, desarrollada con Node.js, Express, PostgreSQL y PostGIS.

## Stack Tecnologico

- **Node.js 20+** / **Express 5** — Backend con ESM nativo
- **PostgreSQL 17 + PostGIS 3.5** — BD relacional con soporte geoespacial
- **Sequelize 6** — ORM con migraciones y seeders
- **JWT + Bcrypt** — Autenticacion y autorizacion por roles
- **Docker** — Contenedorizacion (desarrollo y tests)
- **Jest 30 + Supertest** — Tests unitarios e integracion
- **Swagger/OpenAPI** — Documentacion interactiva de la API
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
├── controllers/         # Logica de negocio (11 controladores)
├── middleware/           # authMiddleware (JWT + roles)
├── migrations/          # 27 migraciones Sequelize
├── models/              # 25 modelos Sequelize (incl. PostGIS)
├── routes/              # 11 archivos de rutas Express
├── seeders/             # 3 seeders (datos de referencia)
├── utils/               # Errores, logger, JWT, passwords
├── docs/                # Swagger config, TESTING.md
├── tests/               # Unit (271) + Integration (41) = 312 tests
├── docker-compose.yml   # Entorno de desarrollo
└── docker-compose.test.yml  # BD aislada para tests
```

---

## Endpoints Principales

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Iniciar sesion | No |
| PUT | `/api/auth/cambiar-contrasena` | Cambiar contrasena | Si |
| POST | `/api/clientes/registro` | Registro de cliente | No |
| GET | `/api/clientes/perfil` | Perfil del cliente | CLIENTE |
| POST | `/api/tecnicos/registro` | Registro de tecnico | No |
| GET | `/api/tecnicos/perfil` | Perfil del tecnico | TECNICO |
| GET | `/api/tecnicos/pendientes` | Tecnicos por validar | ADMIN |
| PUT | `/api/tecnicos/:id/aprobar` | Aprobar tecnico | ADMIN |
| PUT | `/api/tecnicos/:id/rechazar` | Rechazar tecnico | ADMIN |
| POST | `/api/solicitudes/inmediata` | Solicitud inmediata (PostGIS) | CLIENTE |
| POST | `/api/solicitudes/programada` | Solicitud programada | CLIENTE |
| PUT | `/api/solicitudes/:id/cancelar` | Cancelar solicitud | CLIENTE |
| POST | `/api/cotizaciones` | Enviar cotizacion | TECNICO |
| PUT | `/api/cotizaciones/:id/aceptar` | Aceptar cotizacion | CLIENTE |
| PUT | `/api/servicios/iniciar/:id` | Iniciar servicio | TECNICO |
| PUT | `/api/servicios/:id/finalizar` | Finalizar servicio | TECNICO |
| POST | `/api/calificaciones` | Calificar servicio | CLIENTE |
| GET | `/api/categorias` | Listar categorias | Si |
| GET | `/api/ciudades` | Listar ciudades | No |

Documentacion completa en **Swagger UI**: `http://localhost:3000/api-docs`

---

## Tests

```bash
npm test                  # Todos (312 tests)
npm run test:unit         # Solo unitarios (271, sin Docker)
npm run test:integration  # Solo integracion (41, requiere Docker)
npm run test:coverage     # Reporte de cobertura
```

Los tests de integracion levantan automaticamente un contenedor PostgreSQL + PostGIS en puerto 5434, ejecutan migraciones y seeders, y lo detienen al finalizar.

Documentacion detallada: [docs/TESTING.md](docs/TESTING.md)

---

## Scripts Disponibles

```bash
npm start                 # Iniciar servidor
npm run dev               # Desarrollo con hot-reload
npm test                  # Ejecutar todos los tests
npm run test:unit         # Tests unitarios
npm run test:integration  # Tests de integracion
npm run test:coverage     # Cobertura de codigo
npm run db:migrate        # Ejecutar migraciones
npm run db:seed           # Ejecutar seeders
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

## Conventional Commits

El proyecto sigue [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(solicitudes): agregar endpoint de solicitudes programadas
fix(auth): normalizar nombres de roles a ADMIN/CLIENTE/TECNICO
test(integracion): agregar flujo completo solicitud-servicio
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

---

## Migraciones

Las migraciones usan Sequelize CLI y siguen el formato `YYYYMMDDHHMMSS-<accion>-<descripcion>.js`.

### Acciones (prefijos)

| Prefijo | Uso | Ejemplo |
|---------|-----|---------|
| `create-` | Crear una tabla nueva | `create-usuario.js` |
| `add-` | Agregar columna(s) o valor a tabla existente | `add-id-ciudad-to-usuario.js` |
| `change-` | Modificar columna existente (tipo, default, constraint) | `change-disponible-inmediato-default.js` |
| `remove-` | Eliminar columna(s) de una tabla | `remove-campo-to-tabla.js` |
| `rename-` | Renombrar columna o tabla | `rename-viejo-to-nuevo.js` |

### Comandos

```bash
# Generar nueva migracion
npx sequelize-cli migration:generate --name <accion>-<descripcion>

# Ejecutar migraciones pendientes
npm run db:migrate

# Revertir la ultima migracion
npm run db:migrate:undo

# Ejecutar seeders
npm run db:seed
```

### Estructura de una migracion

```javascript
'use strict';
export default {
  async up(queryInterface, Sequelize) {
    // Cambios a aplicar
  },
  async down(queryInterface, Sequelize) {
    // Revertir cambios (obligatorio)
  }
};
```

> **Importante:** Toda migracion debe tener `down()` funcional para poder revertirla.

---

## Licencia

ISC
