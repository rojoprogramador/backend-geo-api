'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Tecnico', 'disponible_inmediato', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Tecnico', 'disponible_inmediato', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    });
  }
};
