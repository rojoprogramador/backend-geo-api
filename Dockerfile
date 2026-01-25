# ==========================================
# DOCKERFILE PARA GEO-API
# ==========================================

# 1. IMAGEN BASE
# Usamos Node.js versión 20 en Alpine Linux (muy ligera, ~40MB)
# Alpine es una distribución minimalista de Linux perfecta para contenedores
FROM node:20-alpine

# 2. METADATA
# Información sobre quién mantiene esta imagen
LABEL maintainer="tu_email@ejemplo.com"
LABEL description="API de geolocalización con Node.js y PostGIS"

# 3. DIRECTORIO DE TRABAJO
# Dentro del contenedor, creamos la carpeta /app y trabajamos ahí
# Es como hacer "cd /app" pero permanente
WORKDIR /app

# 4. COPIAR ARCHIVOS DE DEPENDENCIAS PRIMERO
# ¿Por qué primero? Docker usa CACHE por capas
# Si solo cambias código (no package.json), no reinstala todo
# Esto hace las builds MUY rápidas
COPY package*.json ./

# 5. INSTALAR DEPENDENCIAS
# Dentro del contenedor, ejecuta npm install
# Aquí se crean los node_modules del contenedor
RUN npm install

# 6. COPIAR EL RESTO DEL CÓDIGO
# Ahora sí, copiamos todo tu código fuente
# Esto va después para aprovechar el caché de npm install
COPY . .

# 7. EXPONER EL PUERTO
# Le decimos a Docker que nuestra app usa el puerto 3000
# (No lo publica, solo documenta)
EXPOSE 3000

# 8. COMANDO POR DEFECTO
# Cuando el contenedor arranca, ejecuta esto
# Es como escribir "node index.js" en la terminal
CMD ["node", "index.js"]
