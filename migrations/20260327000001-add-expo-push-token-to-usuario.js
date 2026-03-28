'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Usuario', 'expo_push_token', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: 'Token de notificaciones push de Expo',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Usuario', 'expo_push_token');
  }
};
