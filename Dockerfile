FROM node:20-alpine

LABEL description="Geo-API — Node.js + PostGIS"

WORKDIR /app

# Instalar curl para healthcheck
RUN apk add --no-cache curl

# Copiar dependencias primero (caché de capas Docker)
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Copiar código fuente
COPY . .

# Crear directorio de uploads con permisos
RUN mkdir -p uploads/fotos && chown -R node:node /app

# Usuario no-root
USER node

EXPOSE 3000

# Healthcheck cada 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
