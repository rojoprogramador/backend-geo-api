'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Certificado_Tecnico', {
      id_cert: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK a Tecnico
      id_tecnico: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Tecnico',
          key: 'id_tecnico'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      ruta: { // URL del archivo PDF/Imagen
        type: Sequelize.STRING,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Certificado_Tecnico');
  }
};