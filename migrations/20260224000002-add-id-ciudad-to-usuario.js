'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Usuario', 'id_ciudad', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Ciudad',
        key: 'id_ciudad'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Usuario', 'id_ciudad');
  }
};
