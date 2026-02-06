'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Ciudad', {
      id_ciudad: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      nombre_ciudad: {
        type: Sequelize.STRING,
        allowNull: false
      },
      // RELACIÓN CON PAIS
      id_pais: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
            model: 'Pais',
            key: 'id_pais'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
        },
      activo: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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
    await queryInterface.dropTable('Ciudad');
  }
};