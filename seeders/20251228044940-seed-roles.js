'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    //Insertamos los roles iniciales
    await queryInterface.bulkInsert('Rol', [
      { descripcion: 'Administrador' },
      { descripcion: 'Tecnico' },
      { descripcion: 'Cliente' }
    ], {});
  },

  async down (queryInterface, Sequelize) {
    //Eliminamos los roles insertados
   await queryInterface.bulkDelete('Rol', null, {});
  }
};
