'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Tecnico', 'tipo_cobertura', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'RADIO',
      comment: 'Modo de cobertura del técnico: RADIO (km) o CIUDAD',
    });

    // CHECK constraint para valores válidos
    await queryInterface.sequelize.query(`
      ALTER TABLE "Tecnico"
      ADD CONSTRAINT chk_tipo_cobertura
      CHECK (tipo_cobertura IN ('RADIO', 'CIUDAD'));
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Tecnico" DROP CONSTRAINT IF EXISTS chk_tipo_cobertura;
    `);
    await queryInterface.removeColumn('Tecnico', 'tipo_cobertura');
  }
};
