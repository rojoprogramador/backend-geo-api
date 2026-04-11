'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. ROLES
    await queryInterface.bulkInsert('Rol', [
      { id_rol: 1, descripcion: 'ADMIN', createdAt: new Date(), updatedAt: new Date() },
      { id_rol: 2, descripcion: 'CLIENTE', createdAt: new Date(), updatedAt: new Date() },
      { id_rol: 3, descripcion: 'TECNICO', createdAt: new Date(), updatedAt: new Date() }
    ], { ignoreDuplicates: true });

    // 2. TIPO DE DOCUMENTO
    await queryInterface.bulkInsert('TipoDoc', [
      { id_tipoDoc: 1, descripcion: 'CEDULA', createdAt: new Date(), updatedAt: new Date() },
      { id_tipoDoc: 2, descripcion: 'PASAPORTE', createdAt: new Date(), updatedAt: new Date() },
      { id_tipoDoc: 3, descripcion: 'CARNET_EXTRANJERIA', createdAt: new Date(), updatedAt: new Date() }
    ], { ignoreDuplicates: true });

    // 3. PAIS
    await queryInterface.bulkInsert('Pais', [
      { id_pais: 1, nombre_pais: 'Colombia', activo: true, createdAt: new Date(), updatedAt: new Date() }
    ], { ignoreDuplicates: true });

    // 4. CIUDAD
    const [ciudades] = await queryInterface.sequelize.query('SELECT COUNT(*) AS total FROM "Ciudad"');
    if (Number.parseInt(ciudades[0].total) === 0) {
      await queryInterface.bulkInsert('Ciudad', [
        { nombre_ciudad: 'Cali', id_pais: 1, activo: true, createdAt: new Date(), updatedAt: new Date() },
        { nombre_ciudad: 'Bogotá', id_pais: 1, activo: true, createdAt: new Date(), updatedAt: new Date() },
        { nombre_ciudad: 'Medellín', id_pais: 1, activo: true, createdAt: new Date(), updatedAt: new Date() }
      ]);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Ciudad', null, {});
    await queryInterface.bulkDelete('Pais', null, {});
    await queryInterface.bulkDelete('TipoDoc', null, {});
    await queryInterface.bulkDelete('Rol', null, {});
  }
};
