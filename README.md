# 🌍 Geo-API

API REST para geolocalización y gestión de servicios, desarrollada con Node.js, Express, PostgreSQL y PostGIS.

## 🚀 Tecnologías

- **Node.js 20** - Entorno de ejecución
- **Express 5** - Framework web
- **Sequelize 6** - ORM para PostgreSQL
- **PostgreSQL 17** - Base de datos relacional
- **PostGIS 3.5** - Extensión geoespacial para PostgreSQL
- **JWT** - Autenticación y autorización
- **Bcrypt** - Encriptación de contraseñas
- **Docker** - Contenedorización y orquestación

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

## ✨ Características Implementadas

### Autenticación
- ✅ JWT con expiración configurable
- ✅ Login con email y contraseña
- ✅ Middleware de protección de rutas
- ✅ Encriptación de contraseñas con bcrypt

### Gestión de Usuarios
- ✅ Registro de usuarios
- ✅ Consulta de usuarios (protegido con JWT)
- ✅ Relación con roles y tipos de documento

### Modelos Implementados
- ✅ **Usuario**: Gestión de usuarios del sistema
- ✅ **Rol**: Tipos de roles (Admin, Usuario, etc.)
- ✅ **TipoDocumento**: Tipos de identificación (CC, Pasaporte, etc.)

### Infraestructura
- ✅ Dockerización completa (app + base de datos)
- ✅ PostgreSQL 17 con PostGIS 3.5
- ✅ Persistencia de datos con volúmenes Docker
- ✅ Red interna para comunicación entre contenedores
- ✅ Variables de entorno configurables
- ✅ CORS habilitado

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

### Gestión de contenedores
```bash
# Arrancar servicios
docker-compose up -d

# Ver logs en tiempo real
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f app
docker-compose logs -f db

# Detener servicios
docker-compose stop

# Detener y eliminar contenedores
docker-compose down

# Eliminar contenedores y volúmenes (¡cuidado, borra datos!)
docker-compose down -v
```

### Reconstruir después de cambios
```bash
# Reconstruir la imagen de la app
docker-compose build app

# Reconstruir y arrancar
docker-compose up --build

# Reconstruir sin caché
docker-compose build --no-cache app
```

### Ejecutar comandos dentro de contenedores
```bash
# Entrar a la terminal del contenedor de la app
docker-compose exec app sh

# Ejecutar migraciones
docker-compose exec app npx sequelize-cli db:migrate

# Crear un nuevo modelo
docker-compose exec app npx sequelize-cli model:generate --name Producto --attributes nombre:string,precio:float

# Entrar a PostgreSQL
docker-compose exec db psql -U postgres -d geo_api_db

# Verificar versión de PostGIS
docker-compose exec db psql -U postgres -d geo_api_db -c "SELECT PostGIS_Version();"
```

### Gestión de base de datos
```bash
# Ver estado de la base de datos
docker-compose exec db pg_isready

# Backup de la base de datos
docker-compose exec db pg_dump -U postgres geo_api_db > backup.sql

# Restaurar backup
docker-compose exec -T db psql -U postgres geo_api_db < backup.sql

# Ver tablas (dentro de psql)
\dt

# Ver estructura de una tabla
\d usuarios

# Salir de psql
\q
```

---

## 🔧 Troubleshooting

### El puerto 3000 ya está en uso
**Opción 1:** Detén el proceso que usa el puerto
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <numero_pid> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

**Opción 2:** Cambia el puerto en [docker-compose.yml](docker-compose.yml):
```yaml
ports:
  - "3001:3000"  # Ahora usa localhost:3001
```

### Error "Cannot connect to database"
1. Verifica que los contenedores estén corriendo:
   ```bash
   docker-compose ps
   ```
2. PostgreSQL tarda unos segundos en arrancar. Espera y reintenta.
3. Revisa los logs:
   ```bash
   docker-compose logs db
   ```

### Los cambios en el código no se reflejan
Docker usa caché. Reconstruye sin caché:
```bash
docker-compose build --no-cache app
docker-compose up -d
```

### Quiero empezar desde cero
Borra TODO (contenedores, volúmenes, imágenes):
```bash
docker-compose down -v
docker system prune -a
docker-compose up --build
```

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

⚠️ **IMPORTANTE:** Antes de desplegar en producción:

1. **Cambia las contraseñas** en [docker-compose.yml](docker-compose.yml)
2. **Genera un JWT_SECRET seguro:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
3. **No expongas el puerto de PostgreSQL** (elimina `5432:5432` en docker-compose.yml)
4. **Usa HTTPS** con un reverse proxy (nginx, traefik)
5. **Configura backups automáticos** de la base de datos
6. **Establece límites de recursos** en Docker:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '0.5'
         memory: 512M
   ```

---

## 📊 Variables de Entorno

### Para Docker (ver [docker-compose.yml](docker-compose.yml))
```yaml
environment:
  - NODE_ENV=development
  - PORT=3000
  - DB_HOST=db
  - DB_PORT=5432
  - DB_NAME=geo_api_db
  - DB_USER=postgres
  - DB_PASSWORD=admin123
  - JWT_SECRET=geo_api_secret_key_2024_cambiar_en_produccion
  - JWT_EXPIRES_IN=24h
```

### Para desarrollo local (archivo `.env`)
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=geo_api_db
DB_USER=postgres
DB_PASSWORD=tu_contraseña
PORT=3000
NODE_ENV=development
JWT_SECRET=tu_secreto_seguro
JWT_EXPIRES_IN=24h
```

---

## 🎯 Flujo de Trabajo Recomendado

```bash
# 1. Por la mañana: arrancar servicios
docker-compose up -d

# 2. Ver logs para verificar que todo esté OK
docker-compose logs -f

# 3. Desarrollar tu código...
# (edita archivos en tu editor)

# 4. Reconstruir cuando hagas cambios importantes
docker-compose restart app

# 5. Si cambias package.json o Dockerfile
docker-compose up --build

# 6. Ejecutar migraciones nuevas
docker-compose exec app npx sequelize-cli db:migrate

# 7. Al terminar el día
docker-compose stop
```

---

## 🗄️ Acceso a la Base de Datos

### En Local (Desarrollo)

Puedes acceder a PostgreSQL de 3 formas:

**1. Herramientas GUI (Recomendado)**
- **pgAdmin**: https://www.pgadmin.org/download/
- **DBeaver**: https://dbeaver.io/download/
- **TablePlus**: https://tableplus.com/

**Credenciales de conexión:**
- Host: `localhost`
- Puerto: `5432`
- Usuario: `postgres`
- Contraseña: `admin123`
- Base de datos: `geo_api_db`

**2. Línea de comandos:**
```bash
docker-compose exec db psql -U postgres -d geo_api_db
```

**3. Extensiones de VS Code:**
- PostgreSQL Explorer por Cweijan

📖 **Guía completa**: Ver [ACCESO-BASE-DATOS.md](ACCESO-BASE-DATOS.md)

---

## ☁️ Despliegue en AWS

### Arquitectura Recomendada

```
AWS
├── EC2 / ECS / App Runner
│   └── Tu app Node.js (solo contenedor de app)
│
└── AWS RDS
    └── PostgreSQL 17 + PostGIS 3.5
        - Backups automáticos
        - Alta disponibilidad
        - Escalable
```

### ⚠️ IMPORTANTE: En producción

- ❌ **NO uses** el contenedor Docker para la base de datos
- ✅ **USA** AWS RDS (PostgreSQL administrado)
- ✅ Credenciales en AWS Secrets Manager
- ✅ RDS sin acceso público
- ✅ Backups automáticos habilitados

### Archivos de configuración

- **Producción**: [docker-compose.prod.yml](docker-compose.prod.yml)
- **Desarrollo**: [docker-compose.yml](docker-compose.yml)

### Pasos para AWS:

1. **Crear RDS PostgreSQL 17**
   - Ve a AWS RDS Console
   - Crea instancia PostgreSQL 17
   - Habilita PostGIS: `CREATE EXTENSION postgis;`

2. **Desplegar app con RDS endpoint**
   ```bash
   # Usar docker-compose.prod.yml
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Configurar variables de entorno**
   ```bash
   DB_HOST=tu-instancia.region.rds.amazonaws.com
   DB_PORT=5432
   DB_NAME=geo_api_db
   DB_USER=postgres
   DB_PASSWORD=<desde AWS Secrets Manager>
   ```

📖 **Guía completa de AWS**: Ver [ACCESO-BASE-DATOS.md](ACCESO-BASE-DATOS.md#️-en-awsproducción)

---

## 🚧 Próximos Pasos

- [ ] Implementar CRUD completo de roles
- [ ] Implementar CRUD completo de tipos de documento
- [ ] Agregar validaciones con express-validator
- [ ] Implementar endpoints de geolocalización con PostGIS
- [ ] Agregar paginación a las consultas
- [ ] Documentar API con Swagger/OpenAPI
- [ ] Implementar tests unitarios (Jest)
- [ ] Agregar CI/CD con GitHub Actions
- [ ] Configurar rate limiting
- [ ] Implementar refresh tokens

---

## 📝 Comandos Útiles de Sequelize

```bash
# Crear nueva migración
docker-compose exec app npx sequelize-cli migration:generate --name nombre-descriptivo

# Crear nuevo modelo con migración
docker-compose exec app npx sequelize-cli model:generate --name NombreModelo --attributes campo1:tipo1,campo2:tipo2

# Ejecutar migraciones pendientes
docker-compose exec app npx sequelize-cli db:migrate

# Revertir última migración
docker-compose exec app npx sequelize-cli db:migrate:undo

# Revertir todas las migraciones
docker-compose exec app npx sequelize-cli db:migrate:undo:all

# Crear seeder
docker-compose exec app npx sequelize-cli seed:generate --name nombre-seeder

# Ejecutar seeders
docker-compose exec app npx sequelize-cli db:seed:all
```

---

## 📄 Licencia

ISC

---

## 👨‍💻 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📧 Contacto

Si tienes dudas o sugerencias, abre un issue en el repositorio.
