'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Calificacion', {
      id_calificacion: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Servicio
      id_servicio: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true, // Un servicio solo tiene una calificación
        references: {
          model: 'Servicio',
          key: 'id_servicio'
        },
        onDelete: 'CASCADE'
      },
      id_cliente: {
         type: Sequelize.INTEGER,
         references: { model: 'Cliente', key: 'id_cliente' }
      },
      id_tecnico: {
         type: Sequelize.INTEGER,
         references: { model: 'Tecnico', key: 'id_tecnico' }
      },
      puntuacion: {
        type: Sequelize.INTEGER, // 1 a 5
        allowNull: false
      },
      comentario: {
        type: Sequelize.TEXT
      },
      fecha_calificacion: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Calificacion');
  }
};