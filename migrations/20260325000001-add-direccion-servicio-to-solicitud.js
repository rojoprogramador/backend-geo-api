'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Solicitud', 'direccion_servicio', {
      type: Sequelize.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: 'Dirección legible del servicio proporcionada por el cliente (opcional)',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Solicitud', 'direccion_servicio');
  }
};
