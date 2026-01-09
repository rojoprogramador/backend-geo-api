'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    //Insertar tipos de documentos iniciales
    await queryInterface.bulkInsert('TipoDoc', [
      { descripcion: 'Cédula de Ciudadanía' },
      { descripcion: 'Cédula de Extranjería' },
      { descripcion: 'Pasaporte' },
      {descripcion: 'NIT' }
    ],{})
  },

  async down (queryInterface, Sequelize) {
    // Si deshacemos, borramos todo de la tabla
    await queryInterface.bulkDelete('TipoDoc', null, {});
  }
};
