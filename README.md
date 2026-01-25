
docker-compose exec app npx sequelize-cli model:generate --name MotivoCancelacion --attributes descripcion:string,tipo_usuario:string,activo:boolean

# 🌍 Geo-API

API REST para geolocalización y gestión de servicios, desarrollada con Node.js, Express, PostgreSQL y PostGIS. Proyecto con arquitectura escalable, CI/CD automatizado y calidad de código garantizada.

## 🚀 Tecnologías

- **Node.js 20** - Entorno de ejecución
- **Express 5** - Framework web
- **Sequelize 6** - ORM para PostgreSQL
- **PostgreSQL 17** - Base de datos relacional
- **PostGIS 3.5** - Extensión geoespacial
- **JWT** - Autenticación y autorización
- **Bcrypt** - Encriptación de contraseñas
- **Docker** - Contenedorización y orquestación
- **GitHub Actions** - CI/CD automatizado
- **SonarCloud** - Análisis de calidad de código

---

## 📊 Bitácora de Desarrollo y Hitos

### 🛡️ Fase 3: DevOps, Calidad y CI/CD (Estado Actual)
**Objetivo:** Automatizar pruebas y asegurar la calidad del código antes de desplegar.

- [x] **Pipeline de CI/CD:** Implementación de **GitHub Actions** para validar cada commit.
    - Configuración de entorno de pruebas con **PostGIS 17** (Dockerizado).
    - Ejecución automatizada de migraciones y seeders.
- [x] **Análisis de Calidad:** Integración con **SonarCloud**.
    - Configuración de *Quality Gates* estrictos.
    - Corrección de *Code Smells* y configuración de *New Code Definition* (30 días).
- [x] **Seguridad de Ramas:**
    - Protección de ramas `main` y `develop`.
    - Bloqueo de merges si el CI falla o si SonarCloud detecta errores.

### 🐳 Fase 2: Dockerización del Entorno
**Objetivo:** Crear un entorno de desarrollo reproducible e idéntico a producción.

- [x] Creación de `Dockerfile` para la aplicación Node.js.
- [x] Orquestación con `docker-compose`.
    - Servicio `app`: Backend API.
    - Servicio `db`: Base de datos PostgreSQL con extensión **PostGIS** preinstalada.
- [x] Configuración de redes y volúmenes persistentes para la BD.
- [x] Gestión de variables de entorno seguras para Docker.

### 🔐 Fase 1: Core, Base de Datos y Seguridad
**Objetivo:** Establecer la arquitectura base y el sistema de usuarios.

- [x] **Base de Datos:**
    - Modelado de tablas: `Usuario`, `Rol`, `TipoDoc`.
    - Migraciones y Seeders con **Sequelize CLI**.
    - Corrección de integridad de datos (Fix: typo en columna `correo_electronico`).
- [x] **Autenticación:**
    - Implementación de **JWT (JSON Web Tokens)**.
    - Hashing de contraseñas con bcrypt.
    - Middleware de protección de rutas.

---

## 📁 Estructura del Proyecto

```
geo-api/
├── config/              # Configuración de base de datos (Sequelize)
├── controllers/         # Controladores de negocio
│   ├── authController.js    # Login y autenticación
│   └── usuarioController.js # CRUD de usuarios
├── middleware/          # Middlewares personalizados
│   └── authMiddleware.js    # Verificación de JWT
├── migrations/          # Migraciones de Sequelize
│   ├── 20250101-create-rol.js
│   ├── 20250102-create-tipo-documento.js
│   └── 20250103-create-usuario.js
├── models/              # Modelos de Sequelize
│   ├── index.js         # Centralización de modelos y relaciones
│   ├── Usuario.js       # Modelo de usuario
│   ├── Rol.js           # Modelo de rol
│   └── TipoDocumento.js # Modelo de tipo de documento
├── routes/              # Rutas de la API
│   ├── authRoutes.js    # POST /api/auth/login
│   └── usuarioRoutes.js # CRUD /api/usuarios
├── .dockerignore        # Archivos excluidos de Docker
├── .env                 # Variables de entorno (desarrollo local)
├── .gitignore           # Archivos excluidos de Git
├── docker-compose.yml   # Orquestación de contenedores
├── Dockerfile           # Imagen de la aplicación Node.js
├── index.js             # Punto de entrada de la aplicación
└── package.json         # Dependencias y scripts
```

---

## 🐳 Instalación con Docker (Recomendado)

### Prerequisitos
- **Docker Desktop** instalado
  - Descargar: https://www.docker.com/products/docker-desktop
  - Verificar: `docker --version` y `docker-compose --version`

### 1. Clonar el repositorio
```bash
git clone <tu-repositorio>
cd geo-api
```

### 2. Arrancar los contenedores
```bash
# Primera vez: construir y arrancar
docker-compose up --build

# Modo segundo plano (daemon)
docker-compose up -d
```

### 3. Verificar que funciona
```bash
# Ver contenedores corriendo
docker-compose ps

# Probar la API
curl http://localhost:3000
# Respuesta esperada: {"message": "¡Bienvenido a la Geo-API funcionando!"}
```

### 4. Ejecutar migraciones (primera vez)
```bash
docker-compose exec app npx sequelize-cli db:migrate
```

¡Listo! Tu API está corriendo en **http://localhost:3000**

---

## 💻 Instalación Local (Sin Docker)

### Prerequisitos
- Node.js 20+
- PostgreSQL 17+ con PostGIS instalado

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
Crea un archivo `.env` en la raíz:

```env
# Base de Datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geo_api_db
DB_USER=postgres
DB_PASSWORD=tu_contraseña

# Servidor
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=tu_secreto_seguro_cambiar_en_produccion
JWT_EXPIRES_IN=24h
```

### 3. Crear base de datos
```sql
CREATE DATABASE geo_api_db;
\c geo_api_db;
CREATE EXTENSION postgis;
```

### 4. Ejecutar migraciones
```bash
npx sequelize-cli db:migrate
```

### 5. Iniciar servidor
```bash
node index.js
```

---

## 🌐 Endpoints de la API

### Autenticación

#### POST `/api/auth/login`
Inicia sesión y obtiene un token JWT.

**Request:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "usuario@ejemplo.com"
  }
}
```

### Usuarios

#### GET `/api/usuarios`
Lista todos los usuarios (requiere autenticación).

**Headers:**
```
Authorization: Bearer <tu_token_jwt>
```

**Response:**
```json
[
  {
    "id": 1,
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "usuario@ejemplo.com",
    "rol": {
      "id": 1,
      "nombre": "Admin"
    },
    "tipoDocumento": {
      "id": 1,
      "codigo": "CC",
      "nombre": "Cédula de Ciudadanía"
    }
  }
]
```

---

## 🐳 Comandos Docker Útiles

```bash
# Gestión básica
docker-compose up -d              # Arrancar en segundo plano
docker-compose logs -f app        # Ver logs en tiempo real
docker-compose stop               # Detener servicios
docker-compose down -v            # Eliminar todo (incluye datos)

# Desarrollo
docker-compose restart app        # Reiniciar después de cambios
docker-compose up --build         # Reconstruir y arrancar

# Base de datos
docker-compose exec app npx sequelize-cli db:migrate     # Ejecutar migraciones
docker-compose exec db psql -U postgres -d geo_api_db   # Acceder a PostgreSQL
docker-compose exec db pg_dump -U postgres geo_api_db > backup.sql  # Backup
```

---

## 🔧 Troubleshooting

| Problema | Solución |
|----------|----------|
| Puerto 3000 en uso | Cambia el puerto en [docker-compose.yml](docker-compose.yml) o detén el proceso: `netstat -ano \| findstr :3000` |
| Error de conexión DB | Espera 10 segundos (PostgreSQL tarda en arrancar). Verifica con `docker-compose logs db` |
| Cambios no se reflejan | Reconstruye sin caché: `docker-compose build --no-cache app` |
| Empezar desde cero | `docker-compose down -v && docker system prune -a && docker-compose up --build` |

---

## 🔐 Conectar con Herramientas Externas

### pgAdmin / DBeaver / TablePlus
Usa estas credenciales para conectarte a la base de datos:

- **Host:** `localhost`
- **Puerto:** `5432`
- **Usuario:** `postgres`
- **Contraseña:** `admin123` (Docker) o tu contraseña local
- **Base de datos:** `geo_api_db`

---

## 🔒 Seguridad para Producción

⚠️ **Checklist antes de desplegar:**

- [ ] Cambiar todas las contraseñas y secretos
- [ ] Generar JWT_SECRET seguro: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] No exponer puerto de PostgreSQL (eliminar `5432:5432`)
- [ ] Usar AWS RDS en lugar de contenedor DB
- [ ] Habilitar HTTPS con reverse proxy (nginx/traefik)
- [ ] Configurar backups automáticos
- [ ] Establecer límites de recursos en Docker
- [ ] Variables sensibles en AWS Secrets Manager

---

## 📊 Variables de Entorno

```env
# Base de Datos
DB_HOST=localhost         # 'db' para Docker
DB_PORT=5432
DB_NAME=geo_api_db
DB_USER=postgres
DB_PASSWORD=admin123      # ⚠️ Cambiar en producción

# Servidor
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=tu_secreto_seguro_cambiar_en_produccion
JWT_EXPIRES_IN=24h
```

Ver configuración completa en [docker-compose.yml](docker-compose.yml)

---

## 🗄️ Acceso a la Base de Datos

### Herramientas Recomendadas
- **pgAdmin**: https://www.pgadmin.org/download/
- **DBeaver**: https://dbeaver.io/download/
- **Línea de comandos**: `docker-compose exec db psql -U postgres -d geo_api_db`

**Credenciales (Docker):**
- Host: `localhost` | Puerto: `5432` | Usuario: `postgres` | Password: `admin123` | DB: `geo_api_db`

---

## ☁️ Despliegue en AWS

### Arquitectura Recomendada
```
AWS EC2/ECS (App Node.js) → AWS RDS PostgreSQL 17 + PostGIS 3.5
```

### Checklist de Despliegue
- [ ] Crear RDS PostgreSQL 17 con PostGIS
- [ ] Configurar Security Groups (solo app puede acceder a RDS)
- [ ] Almacenar credenciales en AWS Secrets Manager
- [ ] Habilitar backups automáticos en RDS
- [ ] Usar [docker-compose.prod.yml](docker-compose.prod.yml) para el deploy
- [ ] Configurar dominio y SSL

📖 **Guía completa**: [ACCESO-BASE-DATOS.md](ACCESO-BASE-DATOS.md)

---

## 🚧 Roadmap

### Fase 4: Testing y Documentación (En Progreso)
- [ ] Implementar tests unitarios y de integración (Jest/Supertest)
- [ ] Aumentar cobertura de código al 80%+
- [ ] Documentar API con Swagger/OpenAPI
- [ ] Configurar tests E2E

### Fase 5: Funcionalidades Core
- [ ] Implementar CRUD completo de categorías
- [ ] Sistema de solicitudes de servicio
- [ ] Endpoints de geolocalización con PostGIS (búsqueda por radio, rutas)
- [ ] Agregar paginación y filtros avanzados
- [ ] Implementar refresh tokens
- [ ] Configurar rate limiting

### Fase 6: Producción
- [ ] Despliegue en AWS (EC2 + RDS)
- [ ] Configurar backups automáticos
- [ ] Implementar monitoreo y alertas
- [ ] Configurar CDN para assets estáticos

---

## 📝 Comandos Sequelize

```bash
# Migraciones
docker-compose exec app npx sequelize-cli db:migrate              # Ejecutar
docker-compose exec app npx sequelize-cli db:migrate:undo         # Revertir última
docker-compose exec app npx sequelize-cli migration:generate --name descripcion

# Seeders
docker-compose exec app npx sequelize-cli db:seed:all             # Ejecutar todos
docker-compose exec app npx sequelize-cli seed:generate --name nombre

# Crear modelo
docker-compose exec app npx sequelize-cli model:generate --name Modelo --attributes campo:tipo
```

---

## 👨‍💻 Contribuir

1. Fork el proyecto
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'feat: descripción del cambio'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

**Nota:** Los PR deben pasar CI/CD y SonarCloud Quality Gates antes de ser mergeados.

---

## 📄 Licencia

ISC
