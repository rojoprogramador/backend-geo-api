'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. ESTADOS DE SOLICITUD
    await queryInterface.bulkInsert('EstadoSolicitud', [
      { id_estado: 1, descripcion: 'PENDIENTE', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { id_estado: 2, descripcion: 'BUSCANDO_TECNICOS', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { id_estado: 3, descripcion: 'COTIZANDO', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { id_estado: 4, descripcion: 'ASIGNADA', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { id_estado: 5, descripcion: 'EN_PROCESO', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { id_estado: 6, descripcion: 'COMPLETADA', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { id_estado: 7, descripcion: 'CANCELADA', activo: true, createdAt: new Date(), updatedAt: new Date() }
    ], { ignoreDuplicates: true });

    // 2. MEDIOS DE PAGO
    await queryInterface.bulkInsert('MedioPago', [
      { descripcion: 'EFECTIVO', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'TARJETA_CREDITO', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'TRANSFERENCIA', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'SALDO_APP', activo: true, createdAt: new Date(), updatedAt: new Date() }
    ], { ignoreDuplicates: true });

    // 3. MOTIVOS DE CANCELACION
    await queryInterface.bulkInsert('MotivoCancelacion', [
      { descripcion: 'Cliente no disponible', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Técnico no pudo asistir', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Cambio de fecha', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Emergencia', activo: true, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Otro', activo: true, createdAt: new Date(), updatedAt: new Date() }
    ], { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('MotivoCancelacion', null, {});
    await queryInterface.bulkDelete('MedioPago', null, {});
    await queryInterface.bulkDelete('EstadoSolicitud', null, {});
  }
};