#!/bin/bash
# ============================================================
# Setup inicial de EC2 para Geo-API (Ubuntu 24.04 + Docker)
# Ejecutar una sola vez: bash setup-ec2.sh
# ============================================================
set -e

echo "=== Actualizando sistema ==="
sudo apt update && sudo apt upgrade -y

echo "=== Instalando Docker ==="
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Agregando usuario ubuntu al grupo docker ==="
sudo usermod -aG docker ubuntu

echo "=== Configurando firewall ==="
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable

echo "=== Creando directorio de la app ==="
sudo mkdir -p /opt/geo-api
sudo chown ubuntu:ubuntu /opt/geo-api

echo "=== Clonando repositorio ==="
cd /opt/geo-api
git clone https://github.com/rojoprogramador/backend-geo-api.git .
git checkout develop

echo ""
echo "============================================"
echo " Setup completado!"
echo " "
echo " SIGUIENTE PASO:"
echo " 1. Crear archivo .env en /opt/geo-api/"
echo "    cp .env.example .env && nano .env"
echo " 2. Cerrar sesion y volver a entrar (para grupo docker)"
echo " 3. Ejecutar: bash scripts/deploy.sh"
echo "============================================"
