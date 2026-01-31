'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Garantia', {
      id_garantia: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_servicio: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true, // Relación 1:1 - Un servicio tiene UNA garantía
        references: {
          model: 'Servicio',
          key: 'id_servicio'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tiempo_validez: {
        type: Sequelize.STRING // Ej: "30 días", "6 meses"
      },
      fecha_expiracion: {
        type: Sequelize.DATE
      },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Garantia');
  }
};