# Geo-API

API REST para geolocalización y gestión de servicios, desarrollada con Node.js, Express y PostgreSQL.

## Estado del Proyecto

Este proyecto está en su fase inicial de desarrollo. Actualmente cuenta con la estructura básica y está en proceso de implementación de migraciones con Sequelize.

## Tecnologías

- **Node.js** - Entorno de ejecución
- **Express** - Framework web
- **Sequelize** - ORM para PostgreSQL
- **PostgreSQL** - Base de datos
- **JWT** - Autenticación y autorización
- **Bcrypt** - Encriptación de contraseñas

## Estructura Actual

```
geo-api/
├── config/          # Configuración de base de datos
├── controllers/     # Controladores de negocio
├── middleware/      # Middlewares (autenticación, validaciones)
├── migrations/      # Migraciones de base de datos (en desarrollo)
├── models/          # Modelos de Sequelize (Usuario, Rol, TipoDoc)
├── routes/          # Rutas de la API
├── seeders/         # Datos iniciales
└── index.js         # Punto de entrada
```

## Características Implementadas

- Autenticación con JWT
- Gestión de usuarios con roles
- Tipos de documento
- CORS habilitado
- Relaciones entre modelos

## Próximos Pasos

- [ ] Implementar migraciones de Sequelize
- [ ] Configurar variables de entorno
- [ ] Desarrollar endpoints completos
- [ ] Agregar validaciones
- [ ] Documentar API con Swagger

## Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
# Copia el archivo .env.example a .env y edita las credenciales
cp .env.example .env

# Edita el archivo .env con tus credenciales de PostgreSQL

# Ejecutar servidor
node index.js
```

## Variables de Entorno

El proyecto usa las siguientes variables de entorno (ver [.env.example](.env.example)):

- `DB_HOST` - Host de PostgreSQL (default: localhost)
- `DB_PORT` - Puerto de PostgreSQL (default: 5432)
- `DB_NAME` - Nombre de la base de datos
- `DB_USER` - Usuario de PostgreSQL
- `DB_PASSWORD` - Contraseña de PostgreSQL
- `PORT` - Puerto del servidor API (default: 3000)
- `JWT_SECRET` - Secreto para firma de tokens JWT
- `JWT_EXPIRES_IN` - Tiempo de expiración del token (default: 24h)

## Notas Importantes

El archivo `index.js` tiene comentada la sincronización automática de Sequelize (`sequelize.sync()`) en la línea 47, ya que se planea usar migraciones para un mejor control de la base de datos.

## Licencia

ISC
