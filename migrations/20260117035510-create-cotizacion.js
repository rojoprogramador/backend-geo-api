'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Cotizacion', {
      id_cotizacion: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      valor_cotizacion: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      tiempo_estimado: {
        type: Sequelize.STRING
      },
      incluye_materiales: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      dias_garantia: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      descripcion: {
        type: Sequelize.TEXT
      },
      id_solicitud: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Solicitud',
          key: 'id_solicitud'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      id_tecnico: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Usuario',
          key: 'id_usuario'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      estado: {
        type: Sequelize.STRING
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
    await queryInterface.dropTable('Cotizacion');
  }
};