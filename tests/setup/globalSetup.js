import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { Sequelize } from 'sequelize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export default async function globalSetup() {
  console.log('\n[globalSetup] Starting test database container...');

  execSync('docker compose -f docker-compose.test.yml up -d --wait', {
    stdio: 'pipe',
    timeout: 60000,
    cwd: ROOT_DIR,
  });

  console.log('[globalSetup] Container ready. Preparing schema...');

  // Load .env.test so DB vars point to the test container (port 5434)
  dotenv.config({ path: path.resolve(ROOT_DIR, '.env.test'), override: true });

  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
      logging: false,
    }
  );

  await sequelize.authenticate();

  // Clean slate: drop and recreate schema, enable PostGIS before migrations
  await sequelize.query('DROP SCHEMA public CASCADE;');
  await sequelize.query('CREATE SCHEMA public;');
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');

  console.log('[globalSetup] Running migrations...');

  // Run sequelize-cli migrations (creates tables identical to production)
  const env = { ...process.env, NODE_ENV: 'test' };

  execSync('npx sequelize-cli db:migrate', {
    stdio: 'pipe',
    cwd: ROOT_DIR,
    env,
    timeout: 60000,
  });

  console.log('[globalSetup] Running seeders...');

  // Run project seeders (Rol, TipoDoc, Pais, Ciudad, Categorias, etc.)
  execSync('npx sequelize-cli db:seed:all', {
    stdio: 'pipe',
    cwd: ROOT_DIR,
    env,
    timeout: 60000,
  });

  // ---- Admin user (test-specific, not in production seeders) ----
  console.log('[globalSetup] Seeding admin user...');

  const adminPassword = await bcrypt.hash('AdminPass123!', 10);
  await sequelize.query(
    `INSERT INTO "Usuario" (nombre, apellido, fecha_nacimiento, correo_electronico, telefono, "contraseña", id_rol, "id_tipoDoc", num_identificacion, id_ciudad, "createdAt", "updatedAt")
     VALUES (:nombre, :apellido, :fecha_nacimiento, :correo, :telefono, :password, :id_rol, :id_tipoDoc, :num_id, :id_ciudad, NOW(), NOW())`,
    {
      replacements: {
        nombre: 'Admin',
        apellido: 'Sistema',
        fecha_nacimiento: '1990-01-01',
        correo: 'admin@geoapi.test',
        telefono: '3001111111',
        password: adminPassword,
        id_rol: 1,
        id_tipoDoc: 1,
        num_id: '9999999999',
        id_ciudad: 1,
      },
    }
  );

  await sequelize.close();
  console.log('[globalSetup] Database ready.\n');
}
