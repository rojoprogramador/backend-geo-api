'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Cita', {
      id_cita: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
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
      fecha_cita: {
        type: Sequelize.DATE,
        allowNull: false
      },
      // 4. Ubicación (PostGIS)
      ubicacion_cita: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: true
      },
      // 5. Estado
      id_estado: {
        type: Sequelize.INTEGER,
        references: {
          model: 'EstadoSolicitud',
          key: 'id_estado'
        },
        onUpdate: 'CASCADE'
      },
      // 6. Motivo de cancelación (opcional)
      id_motivo_cancelacion: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'MotivoCancelacion',
          key: 'id_motivo'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
    await queryInterface.dropTable('Cita');
  }
};