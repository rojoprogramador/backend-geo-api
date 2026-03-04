# Testing - Backend Geo-API

Guia completa del sistema de pruebas del proyecto. Para ejecutar los tests rapidamente, ver la seccion [Comandos](#comandos).

---

## Arquitectura de Tests

El proyecto usa **Jest 30** con soporte ESM nativo y se divide en dos niveles:

```
tests/
├── setup/                  # Configuracion global
│   ├── globalSetup.js      # Levanta Docker + migraciones + seeders
│   ├── globalTeardown.js   # Detiene Docker
│   └── loadEnv.js          # Carga .env.test antes de cada archivo
├── helpers/
│   └── app.js              # createApp() — Express sin listen()
├── mocks/
│   └── models.js           # Factory de mocks Sequelize
├── unit/                   # Tests unitarios (mocks, sin BD)
│   ├── controllers/        # 10 archivos — uno por controlador
│   └── middleware/          # authMiddleware
└── integration/            # Tests de integracion (BD real en Docker)
    ├── auth-flow.test.js   # Registro, login, perfil, cambio de clave
    └── full-flow.test.js   # Ciclo completo del negocio
```

| Tipo | Cantidad | BD | Velocidad |
|------|----------|-----|-----------|
| Unitarios | 271 tests / 11 suites | No (mocks) | ~1s |
| Integracion | 41 tests / 2 suites | Si (Docker PostGIS) | ~3s |
| **Total** | **312 tests / 13 suites** | | |

---

## Requisitos

- **Node.js 20+** (el proyecto usa ESM nativo)
- **Docker Desktop** (para tests de integracion)
- **Dependencias instaladas**: `npm install`
- **sequelize-cli** disponible (`npx sequelize-cli --version`)

---

## Comandos

```bash
# Todos los tests (unit + integration)
npm test

# Solo tests unitarios (sin Docker)
npm run test:unit

# Solo tests de integracion (requiere Docker)
npm run test:integration

# Reporte de cobertura
npm run test:coverage

# CI (con cobertura, modo no-interactivo)
npm run test:ci
```

> **Nota:** Todos los comandos de test usan internamente `NODE_OPTIONS=--experimental-vm-modules` para soporte ESM.

---

## Tests Unitarios

Los tests unitarios verifican cada controlador y middleware de forma aislada, sin conexion a base de datos. Todos los modelos Sequelize se mockean.

### Patron ESM Mock (jest.unstable_mockModule)

Jest con ESM requiere un patron especifico para mockear modulos. **El orden es critico:**

```javascript
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// 1. Definir mocks ANTES de importar (factory SINCRONA, sin await)
const mockModels = {
  sequelize: { transaction: jest.fn() },
  MiModelo: { findOne: jest.fn(), create: jest.fn() },
};
const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), finished: undefined };
const mockHandleError = jest.fn((res, error) => {
  const sc = error.statusCode || 500;
  return res.status(sc).json({ success: false, message: error.message });
});

// 2. Registrar mocks ANTES de importar modulos reales
jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/errorHandler.js', () => ({ handleError: mockHandleError }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// 3. Importar clases de error (NO se mockean)
const { ValidationError, NotFoundError } = await import('../../../utils/errors/AppError.js');

// 4. Importar controlador DESPUES de mockear
const { miFuncion } = await import('../../../controllers/miController.js');
```

### beforeEach

```javascript
beforeEach(() => {
  req = createReqMock();
  res = createResMock();
  jest.clearAllMocks();
  mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
  mockTransaction.finished = undefined;
});
```

### Patrones de Asercion

```javascript
// Respuesta exitosa
expect(res.status).toHaveBeenCalledWith(200);
expect(res.jsonData.success).toBe(true);

// Error tipado
const err = mockHandleError.mock.calls[0][1];
expect(err).toBeInstanceOf(ValidationError);
expect(err.message).toContain('campo requerido');

// Transacciones
expect(mockTransaction.commit).toHaveBeenCalled();
expect(mockTransaction.rollback).not.toHaveBeenCalled();
```

### Mock Factory (tests/mocks/models.js)

Provee `createReqMock()` y `createResMock()` que simulan objetos Express:

- `req` tiene `body`, `params`, `query`, `usuario` (JWT payload)
- `res` tiene `status()` (retorna `this` para chaining), `json()`, `jsonData` (ultimo valor pasado a json)

### Controladores Cubiertos

| Controlador | Tests | Que valida |
|-------------|-------|------------|
| authController | 16 | Login, cambiar contrasena, validaciones |
| clienteController | 29 | Registro, perfil, actualizacion, duplicados |
| tecnicoController | 50 | Registro, perfil, admin: pendientes/todos/aprobar/rechazar |
| solicitudController | 46 | Inmediata, programada, cancelacion, consultas |
| cotizacionController | 33 | Crear, aceptar, rechazar, listar |
| servicioController | 33 | Iniciar, finalizar, transacciones, garantias |
| calificacionController | 33 | Calificar, duplicados, promedio, consultas |
| categoriaController | 16 | CRUD completo |
| subcategoriaController | 9 | CRUD completo |
| ciudadController | 6 | Listar, filtrar por pais |

---

## Tests de Integracion

Los tests de integracion ejecutan peticiones HTTP reales contra la API completa con una base de datos PostgreSQL + PostGIS en Docker.

### Como Funciona

1. **globalSetup.js** levanta el contenedor Docker (`docker-compose.test.yml`) en puerto 5434
2. Ejecuta todas las **migraciones** via `sequelize-cli db:migrate`
3. Ejecuta todos los **seeders** via `sequelize-cli db:seed:all`
4. Inserta un **usuario admin** de prueba (`admin@geoapi.test` / `AdminPass123!`)
5. Los tests corren con **Supertest** contra la app Express (sin `listen()`)
6. **globalTeardown.js** detiene y elimina el contenedor Docker

### Base de Datos de Test

```
Host:     localhost
Puerto:   5434 (diferente al de desarrollo)
BD:       geo_servicios_test_db
Usuario:  postgres
Password: test_password
```

La configuracion esta en `.env.test` y `docker-compose.test.yml`.

### Datos Semilla (Seeders)

Los seeders del proyecto (`seeders/`) insertan los datos de referencia:

| Tabla | Registros | Datos |
|-------|-----------|-------|
| Rol | 3 | ADMIN, CLIENTE, TECNICO |
| TipoDoc | 3 | CEDULA, PASAPORTE, CARNET_EXTRANJERIA |
| Pais | 1 | Colombia |
| Ciudad | 3 | Cali, Bogota, Medellin |
| Categoria | 3 | Plomeria, Electricidad, Carpinteria |
| Subcategoria | 8 | 3 plomeria + 3 electricidad + 2 carpinteria |
| EstadoSolicitud | 7 | PENDIENTE → CANCELADA |
| MedioPago | 4 | EFECTIVO, TARJETA_CREDITO, TRANSFERENCIA, SALDO_APP |
| MotivoCancelacion | 5 | Cliente no disponible, Tecnico no pudo asistir, etc. |

Adicionalmente, globalSetup inserta un **usuario admin** para tests que requieren rol ADMIN.

### Flujos Cubiertos

**auth-flow.test.js** (14 tests):
- Registro de cliente + login + perfil protegido + cambio de contrasena
- Registro de tecnico + login con `estado_validacion` + perfil

**full-flow.test.js** (27 tests):
1. **Ciclo completo del negocio** (13 tests):
   Registro → Login → Admin aprueba tecnico → Solicitud inmediata (PostGIS) → Cotizacion → Aceptar → Iniciar servicio → Finalizar (comision 15%) → Calificar → Duplicado rechazado

2. **Cancelacion** (5 tests):
   Registro → Solicitud sin tecnicos (PENDIENTE) → Cancelar → No se puede cancelar dos veces

3. **Admin gestion de tecnicos** (9 tests):
   Login admin → Registrar tecnico → Listar pendientes → Listar todos → Rechazar → Control de acceso (403)

---

## Escribir Nuevos Tests

### Test Unitario Nuevo

1. Crear archivo en `tests/unit/controllers/nombre.test.js`
2. Seguir el patron ESM Mock descrito arriba
3. Importar `createReqMock`/`createResMock` de `../../mocks/models.js`
4. Mockear modelos, handleError y logger ANTES de importar el controlador

### Test de Integracion Nuevo

1. Crear archivo en `tests/integration/nombre.test.js`
2. Importar `createApp` de `../helpers/app.js` y modelos de `../../models/index.js`
3. Usar `supertest` para hacer peticiones HTTP
4. Cerrar la conexion Sequelize en `afterAll`

```javascript
import { describe, it, expect, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../helpers/app.js';
import { sequelize } from '../../models/index.js';

const app = createApp();

afterAll(async () => {
  await sequelize.close();
});

describe('Mi flujo', () => {
  it('debe hacer algo → 200', async () => {
    const res = await request(app).get('/api/endpoint');
    expect(res.status).toBe(200);
  });
});
```

### Acceso Directo a BD en Tests de Integracion

Para configurar datos que no tienen endpoint (ej: ubicacion PostGIS de tecnico):

```javascript
import { Tecnico, Especialidad } from '../../models/index.js';

await Tecnico.update(
  {
    ubicacion_base: { type: 'Point', coordinates: [-76.5320, 3.4516] },
    disponible_inmediato: true,
  },
  { where: { id_tecnico: id } }
);

await Especialidad.create({ id_tecnico: id, id_subcategoria: 1 });
```

---

## Gotchas y Errores Comunes

| Problema | Solucion |
|----------|----------|
| `jest.mock()` no funciona | Usar `jest.unstable_mockModule()` — proyecto ESM |
| Factory del mock es async | La factory debe ser **sincrona** (sin `await` dentro) |
| Importar controller antes de mock | El mock debe registrarse ANTES del `await import()` |
| `--testPathPattern` deprecado | Jest 30 usa `--testPathPatterns` (plural) |
| Campo `contraseña` (con ñ) | Usar `req.body['contraseña']` con bracket notation |
| Docker no arranca | Verificar que Docker Desktop esta corriendo |
| Puerto 5434 en uso | Detener container: `docker compose -f docker-compose.test.yml down -v` |
| Tests de integracion lentos | Correr solo unitarios: `npm run test:unit` |

---

## Cobertura

```bash
npm run test:coverage
```

Genera un reporte en `coverage/`. Los archivos incluidos:

- `controllers/**/*.js`
- `middleware/**/*.js`
- `utils/**/*.js`

---

## CI/CD

El pipeline de GitHub Actions (`.github/workflows/ci.yml`) ejecuta:

1. Tests unitarios e integracion con PostgreSQL + PostGIS
2. Migraciones y seeders automaticos
3. Analisis de calidad con SonarCloud

Para ejecutar en modo CI localmente:

```bash
npm run test:ci
```
