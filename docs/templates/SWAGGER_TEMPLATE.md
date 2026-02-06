# 📚 Templates de Documentación Swagger (JSDoc)

Guía rápida para documentar endpoints con anotaciones JSDoc que genera la documentación Swagger automáticamente.

---

## 🎯 Reglas Generales

1. **Coloca el JSDoc inmediatamente antes de la función** del controller
2. **Usa `$ref` para reutilizar schemas** definidos en `docs/swagger/swagger.js`
3. **Incluye ejemplos** tanto en requests como en responses
4. **Documenta TODOS los códigos de respuesta** posibles (200, 400, 401, 403, 404, 500)
5. **Agrega `security: bearerAuth`** si el endpoint requiere autenticación

---

## 📝 Template 1: GET (Listar recursos)

### Endpoint protegido (requiere autenticación)

```javascript
/**
 * @swagger
 * /ruta/recurso:
 *   get:
 *     summary: Título corto del endpoint
 *     description: Descripción detallada de qué hace el endpoint y cuándo usarlo
 *     tags: [NombreDelTag]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página para paginación
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Cantidad de resultados por página
 *     responses:
 *       200:
 *         description: Lista obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/NombreDelSchema'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     pages:
 *                       type: integer
 *                       example: 15
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const listarRecursos = async (req, res, next) => {
    // Tu código aquí
};
```

---

## 📝 Template 2: GET (Por ID)

```javascript
/**
 * @swagger
 * /ruta/recurso/{id}:
 *   get:
 *     summary: Obtener recurso por ID
 *     description: Retorna un único recurso identificado por su ID
 *     tags: [NombreDelTag]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID único del recurso
 *         example: 42
 *     responses:
 *       200:
 *         description: Recurso encontrado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/NombreDelSchema'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerPorId = async (req, res, next) => {
    // Tu código aquí
};
```

---

## 📝 Template 3: POST (Crear recurso)

```javascript
/**
 * @swagger
 * /ruta/recurso:
 *   post:
 *     summary: Crear un nuevo recurso
 *     description: Crea un nuevo recurso con los datos proporcionados
 *     tags: [NombreDelTag]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NombreDelSchema'
 *           examples:
 *             ejemplo1:
 *               summary: Ejemplo básico
 *               value:
 *                 campo1: valor1
 *                 campo2: valor2
 *             ejemplo2:
 *               summary: Ejemplo completo
 *               value:
 *                 campo1: valor1
 *                 campo2: valor2
 *                 campo3: valor3
 *     responses:
 *       201:
 *         description: Recurso creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/NombreDelSchema'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         description: Conflicto - El recurso ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const crearRecurso = async (req, res, next) => {
    // Tu código aquí
};
```

---

## 📝 Template 4: PUT/PATCH (Actualizar)

```javascript
/**
 * @swagger
 * /ruta/recurso/{id}:
 *   put:
 *     summary: Actualizar recurso completo
 *     description: Reemplaza todos los campos del recurso (PUT) o solo los enviados (PATCH)
 *     tags: [NombreDelTag]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del recurso a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NombreDelSchema'
 *     responses:
 *       200:
 *         description: Recurso actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/NombreDelSchema'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const actualizarRecurso = async (req, res, next) => {
    // Tu código aquí
};
```

---

## 📝 Template 5: DELETE

```javascript
/**
 * @swagger
 * /ruta/recurso/{id}:
 *   delete:
 *     summary: Eliminar recurso
 *     description: Elimina permanentemente el recurso (o marca como inactivo si es soft delete)
 *     tags: [NombreDelTag]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del recurso a eliminar
 *     responses:
 *       200:
 *         description: Recurso eliminado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Recurso eliminado exitosamente
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         description: No se puede eliminar por restricciones de integridad referencial
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const eliminarRecurso = async (req, res, next) => {
    // Tu código aquí
};
```

---

## 📝 Template 6: Endpoint con Geolocalización (PostGIS)

```javascript
/**
 * @swagger
 * /solicitudes/tecnicos-cercanos:
 *   post:
 *     summary: Buscar técnicos cercanos usando PostGIS
 *     description: Busca técnicos dentro del radio de cobertura según coordenadas GPS. Ordena por distancia y disponibilidad.
 *     tags: [Geolocalización]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *               - id_subcategoria
 *             properties:
 *               lat:
 *                 type: number
 *                 format: double
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 3.4516
 *                 description: Latitud WGS84 (SRID 4326)
 *               lng:
 *                 type: number
 *                 format: double
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -76.5320
 *                 description: Longitud WGS84 (SRID 4326)
 *               id_subcategoria:
 *                 type: integer
 *                 example: 1
 *                 description: ID de la especialidad buscada
 *               radio_km:
 *                 type: integer
 *                 default: 10
 *                 minimum: 1
 *                 maximum: 50
 *                 description: Radio de búsqueda en kilómetros
 *     responses:
 *       200:
 *         description: Lista de técnicos ordenados por distancia
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Tecnico'
 *                       - type: object
 *                         properties:
 *                           distancia_km:
 *                             type: number
 *                             format: float
 *                             example: 2.5
 *                             description: Distancia en kilómetros desde el punto solicitado
 *       400:
 *         description: Coordenadas inválidas o fuera de rango
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No hay técnicos disponibles en la zona
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const buscarTecnicosCercanos = async (req, res, next) => {
    // Tu código PostGIS aquí
};
```

---

## 📝 Template 7: Endpoint Público (Sin autenticación)

```javascript
/**
 * @swagger
 * /public/categorias:
 *   get:
 *     summary: Listar todas las categorías de servicio
 *     description: Endpoint público que no requiere autenticación. Retorna el catálogo completo de categorías y subcategorías.
 *     tags: [Público]
 *     responses:
 *       200:
 *         description: Catálogo obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_categoria:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: Plomería
 *                       subcategorias:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id_subcategoria:
 *                               type: integer
 *                               example: 1
 *                             nombre:
 *                               type: string
 *                               example: Reparación de fugas
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
export const obtenerCategorias = async (req, res, next) => {
    // Tu código aquí
};
```

---

## 🎨 Buenas Prácticas

### ✅ Hacer:
- Usar schemas reutilizables con `$ref` siempre que sea posible
- Incluir múltiples ejemplos si el endpoint acepta diferentes tipos de datos
- Documentar TODOS los posibles códigos HTTP de respuesta
- Agregar descripciones claras y concisas
- Usar tags consistentes (mismo nombre que aparece en swagger.js)

### ❌ Evitar:
- Duplicar schemas inline cuando ya existen en swagger.js
- Olvidar agregar `security: bearerAuth` en endpoints protegidos
- No documentar casos de error (400, 404, etc.)
- Ejemplos genéricos ("string", "number") - usar datos realistas

---

## 📦 Schemas Disponibles (desde swagger.js)

Puedes referenciarlos con `$ref`:

- `#/components/schemas/Usuario`
- `#/components/schemas/Tecnico`
- `#/components/schemas/Cliente`
- `#/components/schemas/Solicitud`
- `#/components/schemas/Cotizacion`
- `#/components/schemas/Cita`
- `#/components/schemas/Servicio`
- `#/components/schemas/Calificacion`
- `#/components/schemas/Coordenadas`
- `#/components/schemas/Error`
- `#/components/schemas/Success`
- `#/components/schemas/LoginRequest`
- `#/components/schemas/LoginResponse`

---

## 📦 Responses Reutilizables

- `#/components/responses/UnauthorizedError` (401)
- `#/components/responses/ForbiddenError` (403)
- `#/components/responses/NotFoundError` (404)
- `#/components/responses/ValidationError` (400)
- `#/components/responses/ServerError` (500)

---

## 🔄 Workflow de Documentación

1. **Implementa el endpoint** en el controller
2. **Copia el template** correspondiente (GET, POST, etc.)
3. **Personaliza** summary, description, tags
4. **Ajusta requestBody** y parameters según tu endpoint
5. **Agrega ejemplos** realistas
6. **Documenta responses** (códigos 200, 400, 401, etc.)
7. **Prueba en Swagger UI** → http://localhost:3000/api-docs

---

## 🧪 Verificación

Después de documentar un endpoint:

1. Inicia el servidor: `node index.js`
2. Abre: http://localhost:3000/api-docs
3. Busca tu endpoint en el tag correspondiente
4. Haz clic en "Try it out"
5. Ejecuta la prueba directamente desde Swagger

---

## 💡 Tips Extra

- **Importar a Postman:** Descarga el JSON desde `/api-docs.json`
- **Autenticación en Swagger:** Usa el botón "Authorize" y pega tu token JWT
- **Multiple Examples:** Útil para mostrar diferentes casos de uso del mismo endpoint
- **ReadOnly Fields:** Marca campos como `readOnly: true` si son generados por el servidor (IDs, timestamps)

---

✅ **Recuerda:** Documentar mientras desarrollas es mucho más rápido que hacerlo todo al final. Solo toma 2-3 minutos por endpoint.
