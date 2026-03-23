#!/bin/bash
# ============================================================
# Deploy script para Geo-API en EC2
# Ejecutado por GitHub Actions via SSH o manualmente
# ============================================================
set -e

APP_DIR="/opt/geo-api"
COMPOSE_FILE="docker-compose.prod.yml"

cd "$APP_DIR"

echo "=== Pulling latest code ==="
git pull origin develop

echo "=== Building and starting containers ==="
docker compose -f "$COMPOSE_FILE" build --no-cache
docker compose -f "$COMPOSE_FILE" up -d

echo "=== Waiting for DB to be healthy ==="
sleep 10

echo "=== Running migrations ==="
docker compose -f "$COMPOSE_FILE" exec -T app npx sequelize-cli db:migrate --env production

echo "=== Running seeders (idempotent) ==="
docker compose -f "$COMPOSE_FILE" exec -T app npx sequelize-cli db:seed:all --env production || true

echo "=== Health check ==="
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo "Deploy exitoso! API respondiendo en puerto 3000"
else
    echo "WARNING: Health check retorno $HTTP_CODE"
    echo "Logs del contenedor:"
    docker compose -f "$COMPOSE_FILE" logs --tail=30 app
fi

echo "=== Limpiando imagenes antiguas ==="
docker image prune -f
