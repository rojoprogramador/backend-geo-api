import { describe, it, expect, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../helpers/app.js';
import { sequelize } from '../../models/index.js';

const app = createApp();

afterAll(async () => {
  await sequelize.close();
});

describe('Flujo: Registro + Login + Cambiar contraseña', () => {
  let token;

  const clienteData = {
    nombre: 'María Alejandra',
    apellido: 'González Ospina',
    correo_electronico: 'maria.test@example.com',
    telefono: '3101234567',
    'contraseña': 'MiClave123!',
    'confirmar_contraseña': 'MiClave123!',
    num_identificacion: '1098765432',
    id_tipoDoc: 1,
    fecha_nacimiento: '1995-03-20',
    acepta_terminos: true,
    id_ciudad: 1,
  };

  // ---------------------------------------------------------------
  // 1. Registro de cliente
  // ---------------------------------------------------------------
  it('debe registrar un nuevo cliente → 201', async () => {
    const res = await request(app)
      .post('/api/clientes/registro')
      .send(clienteData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id_usuario');
    expect(res.body.data).toHaveProperty('id_cliente');
    expect(res.body.data.correo_electronico).toBe(clienteData.correo_electronico);
  });

  it('debe rechazar registro duplicado → 409', async () => {
    const res = await request(app)
      .post('/api/clientes/registro')
      .send(clienteData);

    expect(res.status).toBe(409);
  });

  it('debe rechazar registro con campos faltantes → 400', async () => {
    const res = await request(app)
      .post('/api/clientes/registro')
      .send({ nombre: 'Test' });

    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------
  // 2. Login — response: { message, token, usuario }
  // ---------------------------------------------------------------
  it('debe iniciar sesión exitosamente → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: clienteData.correo_electronico,
        'contraseña': 'MiClave123!',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.usuario.rol).toBe('CLIENTE');
    token = res.body.token;
  });

  it('debe rechazar login con contraseña incorrecta → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: clienteData.correo_electronico,
        'contraseña': 'WrongPass123!',
      });

    expect(res.status).toBe(401);
  });

  it('debe rechazar login con correo inexistente → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: 'noexiste@example.com',
        'contraseña': 'MiClave123!',
      });

    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------
  // 3. Perfil protegido
  // ---------------------------------------------------------------
  it('debe obtener perfil con token válido → 200', async () => {
    const res = await request(app)
      .get('/api/clientes/perfil')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.correo_electronico).toBe(clienteData.correo_electronico);
  });

  it('debe rechazar acceso sin token → 401', async () => {
    const res = await request(app)
      .get('/api/clientes/perfil');

    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------
  // 4. Cambiar contraseña
  // ---------------------------------------------------------------
  it('debe cambiar contraseña exitosamente → 200', async () => {
    const res = await request(app)
      .put('/api/auth/cambiar-contrasena')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contrasena_actual: 'MiClave123!',
        nueva_contrasena: 'NuevaClave456@',
        confirmar_nueva_contrasena: 'NuevaClave456@',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('debe iniciar sesión con la nueva contraseña → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: clienteData.correo_electronico,
        'contraseña': 'NuevaClave456@',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('debe rechazar la contraseña anterior → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: clienteData.correo_electronico,
        'contraseña': 'MiClave123!',
      });

    expect(res.status).toBe(401);
  });
});

describe('Flujo: Registro + Login técnico', () => {
  let tokenTecnico;

  const tecnicoData = {
    nombre: 'Andrés Felipe',
    apellido: 'Martínez López',
    correo_electronico: 'andres.tech@example.com',
    telefono: '3009876543',
    'contraseña': 'TecPass123!',
    'confirmar_contraseña': 'TecPass123!',
    num_identificacion: '1087654321',
    id_tipoDoc: 1,
    fecha_nacimiento: '1990-06-15',
    acepta_terminos: true,
    id_ciudad: 1,
    especialidades: [1],
  };

  it('debe registrar un nuevo técnico → 201', async () => {
    const res = await request(app)
      .post('/api/tecnicos/registro')
      .send(tecnicoData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id_usuario');
    expect(res.body.data).toHaveProperty('id_tecnico');
  });

  it('debe iniciar sesión como técnico → 200 con estado_validacion', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: tecnicoData.correo_electronico,
        'contraseña': 'TecPass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.usuario).toHaveProperty('estado_validacion');
    expect(res.body.usuario.estado_validacion).toBe('PENDIENTE_VALIDACION');
    tokenTecnico = res.body.token;
  });

  it('debe obtener perfil técnico → 200', async () => {
    const res = await request(app)
      .get('/api/tecnicos/perfil')
      .set('Authorization', `Bearer ${tokenTecnico}`);

    expect(res.status).toBe(200);
    expect(res.body.data.correo_electronico).toBe(tecnicoData.correo_electronico);
  });
});
