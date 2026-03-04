import { describe, it, expect, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../helpers/app.js';
import { sequelize, Tecnico, Especialidad } from '../../models/index.js';

const app = createApp();

afterAll(async () => {
  await sequelize.close();
});

// =============================================================================
// Flujo completo: Solicitud → Cotización → Servicio → Calificación
// Tests: HU-09, HU-11, HU-12, HU-16, HU-17, HU-24
// =============================================================================
describe('Flujo completo: Solicitud → Cotización → Servicio → Calificación', () => {
  let tokenCliente, tokenTecnico, tokenAdmin;
  let idTecnicoRegistro;

  const clienteData = {
    nombre: 'Laura Patricia',
    apellido: 'Rodriguez Mora',
    correo_electronico: 'laura.flow@example.com',
    telefono: '3201234567',
    'contraseña': 'ClienteFlow1!',
    'confirmar_contraseña': 'ClienteFlow1!',
    num_identificacion: '1111111111',
    id_tipoDoc: 1,
    fecha_nacimiento: '1992-08-15',
    acepta_terminos: true,
    id_ciudad: 1,
  };

  const tecnicoData = {
    nombre: 'Carlos Alberto',
    apellido: 'Perez Cardenas',
    correo_electronico: 'carlos.flow@example.com',
    telefono: '3109876543',
    'contraseña': 'TecFlow123!',
    'confirmar_contraseña': 'TecFlow123!',
    num_identificacion: '2222222222',
    id_tipoDoc: 1,
    fecha_nacimiento: '1988-04-10',
    acepta_terminos: true,
    id_ciudad: 1,
  };

  // -----------------------------------------------------------------
  // 1. Registro de cliente y técnico
  // -----------------------------------------------------------------
  it('registrar cliente → 201', async () => {
    const res = await request(app)
      .post('/api/clientes/registro')
      .send(clienteData);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id_cliente');
  });

  it('registrar técnico → 201', async () => {
    const res = await request(app)
      .post('/api/tecnicos/registro')
      .send(tecnicoData);

    expect(res.status).toBe(201);
    idTecnicoRegistro = res.body.data.id_tecnico;
  });

  // -----------------------------------------------------------------
  // 2. Login de los tres roles
  // -----------------------------------------------------------------
  it('login como cliente → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: clienteData.correo_electronico,
        'contraseña': 'ClienteFlow1!',
      });

    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('CLIENTE');
    tokenCliente = res.body.token;
  });

  it('login como técnico → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: tecnicoData.correo_electronico,
        'contraseña': 'TecFlow123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('TECNICO');
    tokenTecnico = res.body.token;
  });

  it('login como admin → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: 'admin@geoapi.test',
        'contraseña': 'AdminPass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('ADMIN');
    tokenAdmin = res.body.token;
  });

  // -----------------------------------------------------------------
  // 3. Admin aprueba al técnico (HU-24)
  // -----------------------------------------------------------------
  it('admin aprueba técnico → ACTIVO', async () => {
    const res = await request(app)
      .put(`/api/tecnicos/${idTecnicoRegistro}/aprobar`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // -----------------------------------------------------------------
  // 4. Configurar ubicación y especialidad del técnico (vía DB)
  //    Necesario para que el PostGIS query en solicitud lo encuentre
  // -----------------------------------------------------------------
  it('configurar ubicación base y especialidad del técnico', async () => {
    // Ubicación en Cali (lat: 3.4516, lng: -76.5320)
    await Tecnico.update(
      {
        ubicacion_base: {
          type: 'Point',
          coordinates: [-76.5320, 3.4516], // GeoJSON: [lng, lat]
        },
        disponible_inmediato: true,
        radio_cobertura_km: 15,
      },
      { where: { id_tecnico: idTecnicoRegistro } }
    );

    // Crear Especialidad: subcategoria 1 = "Reparación de tuberías"
    await Especialidad.create({
      id_tecnico: idTecnicoRegistro,
      id_subcategoria: 1,
    });
  });

  // -----------------------------------------------------------------
  // 5. Cliente crea solicitud inmediata (HU-09)
  // -----------------------------------------------------------------
  let idSolicitud;

  it('cliente crea solicitud inmediata → BUSCANDO_TECNICOS (técnico encontrado)', async () => {
    const res = await request(app)
      .post('/api/solicitudes/inmediata')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({
        id_subcategoria: 1,
        descripcion: 'Tubería rota en el baño, agua saliendo sin control. Necesito ayuda urgente.',
        latitud: 3.4520,
        longitud: -76.5315,
        prioridad: 'URGENTE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id_estado).toBe(2); // BUSCANDO_TECNICOS
    expect(res.body.data.tecnicos_notificados).toBeGreaterThanOrEqual(1);
    idSolicitud = res.body.data.id_solicitud;
  });

  // -----------------------------------------------------------------
  // 6. Técnico ve solicitudes pendientes
  // -----------------------------------------------------------------
  it('técnico ve solicitudes pendientes → incluye la nueva', async () => {
    const res = await request(app)
      .get('/api/solicitudes/tecnico/pendientes')
      .set('Authorization', `Bearer ${tokenTecnico}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);

    const found = res.body.data.solicitudes.some(
      (s) => s.solicitud.id_solicitud === idSolicitud
    );
    expect(found).toBe(true);
  });

  // -----------------------------------------------------------------
  // 7. Técnico envía cotización (HU-11)
  // -----------------------------------------------------------------
  let idCotizacion;

  it('técnico crea cotización → 201', async () => {
    const res = await request(app)
      .post('/api/cotizaciones')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({
        id_solicitud: idSolicitud,
        valor_cotizacion: 150000,
        descripcion: 'Reparación de tubería rota con sellante epoxi profesional.',
        tiempo_estimado: '2-3 horas',
        incluye_materiales: true,
        dias_garantia: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    idCotizacion = res.body.data.id_cotizacion;
  });

  // -----------------------------------------------------------------
  // 8. Cliente ve cotizaciones (HU-12)
  // -----------------------------------------------------------------
  it('cliente ve cotizaciones de su solicitud → 1 cotización', async () => {
    const res = await request(app)
      .get(`/api/cotizaciones/solicitud/${idSolicitud}`)
      .set('Authorization', `Bearer ${tokenCliente}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_cotizaciones).toBe(1);
    expect(res.body.data.cotizaciones[0].id_cotizacion).toBe(idCotizacion);
  });

  // -----------------------------------------------------------------
  // 9. Cliente acepta cotización → solicitud ASIGNADA (HU-12)
  // -----------------------------------------------------------------
  it('cliente acepta cotización → solicitud ASIGNADA', async () => {
    const res = await request(app)
      .put(`/api/cotizaciones/${idCotizacion}/aceptar`)
      .set('Authorization', `Bearer ${tokenCliente}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.solicitud.id_estado).toBe(4); // ASIGNADA
  });

  // -----------------------------------------------------------------
  // 10. Técnico inicia servicio (HU-16)
  // -----------------------------------------------------------------
  let idServicio;

  it('técnico inicia servicio → 201 EN_PROCESO', async () => {
    const res = await request(app)
      .put(`/api/servicios/iniciar/${idSolicitud}`)
      .set('Authorization', `Bearer ${tokenTecnico}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id_estado).toBe(5); // EN_PROCESO
    idServicio = res.body.data.id_servicio;
  });

  // -----------------------------------------------------------------
  // 11. Técnico finaliza servicio con pago (HU-16)
  // -----------------------------------------------------------------
  it('técnico finaliza servicio → transacción con 15% comisión', async () => {
    const res = await request(app)
      .put(`/api/servicios/${idServicio}/finalizar`)
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({
        id_medioPago: 1, // EFECTIVO
        valor_total: 150000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id_estado).toBe(6); // COMPLETADA
    expect(res.body.data.transaccion.monto_total).toBe(150000);
    expect(res.body.data.transaccion.comision_plataforma).toBe(22500);  // 15%
    expect(res.body.data.transaccion.monto_tecnico).toBe(127500);       // 85%
    expect(res.body.data.transaccion.estado_pago).toBe('PENDIENTE');
  });

  // -----------------------------------------------------------------
  // 12. Cliente califica servicio (HU-17)
  // -----------------------------------------------------------------
  it('cliente califica servicio → 201', async () => {
    const res = await request(app)
      .post('/api/calificaciones')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({
        id_servicio: idServicio,
        puntuacion: 5,
        comentario: 'Excelente trabajo, muy profesional y puntual.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.calificacion.puntuacion).toBe(5);
    expect(res.body.data.nuevo_promedio_tecnico).toBe(5);
    expect(res.body.data.total_calificaciones).toBe(1);
  });

  // -----------------------------------------------------------------
  // 13. No se puede calificar el mismo servicio dos veces
  // -----------------------------------------------------------------
  it('calificación duplicada → 409', async () => {
    const res = await request(app)
      .post('/api/calificaciones')
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({
        id_servicio: idServicio,
        puntuacion: 4,
      });

    expect(res.status).toBe(409);
  });
});

// =============================================================================
// Flujo: Cancelación de solicitud (HU-13)
// =============================================================================
describe('Flujo: Cancelación de solicitud', () => {
  let tokenCliente2;

  it('registrar cliente para cancelación → 201', async () => {
    const res = await request(app)
      .post('/api/clientes/registro')
      .send({
        nombre: 'Diana Carolina',
        apellido: 'Mendez Torres',
        correo_electronico: 'diana.cancel@example.com',
        telefono: '3151234567',
        'contraseña': 'CancelTest1!',
        'confirmar_contraseña': 'CancelTest1!',
        num_identificacion: '3333333333',
        id_tipoDoc: 1,
        fecha_nacimiento: '1993-11-22',
        acepta_terminos: true,
        id_ciudad: 1,
      });

    expect(res.status).toBe(201);
  });

  it('login cliente cancelación → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: 'diana.cancel@example.com',
        'contraseña': 'CancelTest1!',
      });

    expect(res.status).toBe(200);
    tokenCliente2 = res.body.token;
  });

  let solicitudCancelId;

  it('crear solicitud inmediata (subcategoría sin técnicos → PENDIENTE)', async () => {
    const res = await request(app)
      .post('/api/solicitudes/inmediata')
      .set('Authorization', `Bearer ${tokenCliente2}`)
      .send({
        id_subcategoria: 3, // Destape de cañerías — ningún técnico tiene esta especialidad
        descripcion: 'Necesito instalar un nuevo punto de luz en la sala principal.',
        latitud: 4.7110,
        longitud: -74.0721,
        prioridad: 'BAJA',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id_estado).toBe(1); // PENDIENTE (no technicians found)
    expect(res.body.data.tecnicos_notificados).toBe(0);
    solicitudCancelId = res.body.data.id_solicitud;
  });

  it('cancelar solicitud con motivo → 200', async () => {
    const res = await request(app)
      .put(`/api/solicitudes/${solicitudCancelId}/cancelar`)
      .set('Authorization', `Bearer ${tokenCliente2}`)
      .send({
        id_motivo_cancelacion: 1,
        motivo_adicional: 'Ya no necesito el servicio',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id_estado).toBe(7); // CANCELADA
  });

  it('no se puede cancelar solicitud ya cancelada → 400', async () => {
    const res = await request(app)
      .put(`/api/solicitudes/${solicitudCancelId}/cancelar`)
      .set('Authorization', `Bearer ${tokenCliente2}`);

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Flujo: Admin gestión de técnicos (HU-24, HU-25)
// =============================================================================
describe('Flujo: Admin gestión de técnicos', () => {
  let tokenAdmin;

  it('login como admin → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: 'admin@geoapi.test',
        'contraseña': 'AdminPass123!',
      });

    expect(res.status).toBe(200);
    tokenAdmin = res.body.token;
  });

  it('registrar técnico para rechazar', async () => {
    const res = await request(app)
      .post('/api/tecnicos/registro')
      .send({
        nombre: 'Pedro Alejandro',
        apellido: 'Garcia Muñoz',
        correo_electronico: 'pedro.reject@example.com',
        telefono: '3189876543',
        'contraseña': 'Reject123!',
        'confirmar_contraseña': 'Reject123!',
        num_identificacion: '4444444444',
        id_tipoDoc: 1,
        fecha_nacimiento: '1985-12-01',
        acepta_terminos: true,
        id_ciudad: 2,
      });

    expect(res.status).toBe(201);
  });

  it('admin lista técnicos pendientes → al menos 1', async () => {
    const res = await request(app)
      .get('/api/tecnicos/pendientes')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('admin lista todos los técnicos → incluye lista', async () => {
    const res = await request(app)
      .get('/api/tecnicos/admin/todos')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('admin rechaza técnico → RECHAZADO', async () => {
    // Find the pending technician (pedro.reject)
    const listRes = await request(app)
      .get('/api/tecnicos/pendientes')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    const pendiente = listRes.body.data.find(
      (t) => t.correo_electronico === 'pedro.reject@example.com'
    );
    expect(pendiente).toBeDefined();

    const res = await request(app)
      .put(`/api/tecnicos/${pendiente.id_tecnico}/rechazar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ motivo_rechazo: 'Documentación incompleta. Falta cédula y certificados profesionales requeridos.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('cliente no puede acceder a endpoints de admin → 403', async () => {
    // Login as an existing client
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: 'laura.flow@example.com',
        'contraseña': 'ClienteFlow1!',
      });

    const res = await request(app)
      .get('/api/tecnicos/pendientes')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// Flujo: Toggle de jornada (disponible_inmediato)
// =============================================================================
describe('Flujo: Toggle de jornada técnico', () => {
  let tokenTecnico;

  it('login como técnico del flujo principal', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        correo_electronico: 'carlos.flow@example.com',
        'contraseña': 'TecFlow123!',
      });

    expect(res.status).toBe(200);
    tokenTecnico = res.body.token;
  });

  it('técnico puede desactivar jornada (disponible_inmediato: false) → 200', async () => {
    const res = await request(app)
      .put('/api/tecnicos/perfil')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ disponible_inmediato: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.disponible_inmediato).toBe(false);
  });

  it('técnico puede activar jornada (disponible_inmediato: true) → 200', async () => {
    const res = await request(app)
      .put('/api/tecnicos/perfil')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ disponible_inmediato: true });

    expect(res.status).toBe(200);
    expect(res.body.data.disponible_inmediato).toBe(true);
  });

  it('disponible_inmediato inválido → 400', async () => {
    const res = await request(app)
      .put('/api/tecnicos/perfil')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ disponible_inmediato: 'si' });

    expect(res.status).toBe(400);
  });

  it('técnico no puede cambiar estado_validacion → se ignora', async () => {
    const res = await request(app)
      .put('/api/tecnicos/perfil')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ estado_validacion: 'SUSPENDIDO', disponible_inmediato: true });

    expect(res.status).toBe(200);
    // estado_validacion no aparece en los campos editables, se ignora
    expect(res.body.data.disponible_inmediato).toBe(true);
  });
});
