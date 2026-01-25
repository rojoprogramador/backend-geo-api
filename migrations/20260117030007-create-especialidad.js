'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Especialidad', {
      id_especialidad: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_tecnico: {
        type: Sequelize.INTEGER
      },
      id_subcategoria: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Subcategoria',
          key: 'id_subcategoria'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      experiencia: {
        type: Sequelize.STRING
      },
      precio_estimado: {
        type: Sequelize.DECIMAL
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Especialidad');
  }
};