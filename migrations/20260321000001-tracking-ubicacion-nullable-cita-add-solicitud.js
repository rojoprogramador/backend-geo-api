'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. Hacer id_cita nullable (soportar servicios inmediatos sin cita previa)
    await queryInterface.changeColumn('TrackingUbicacion', 'id_cita', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Cita',
        key: 'id_cita',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 2. Agregar columna id_solicitud para vincular tracking a la solicitud
    await queryInterface.addColumn('TrackingUbicacion', 'id_solicitud', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Solicitud',
        key: 'id_solicitud',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 3. Índice para consultas por solicitud + timestamp
    await queryInterface.addIndex('TrackingUbicacion', ['id_solicitud', 'timestamp'], {
      name: 'idx_tracking_solicitud_timestamp',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('TrackingUbicacion', 'idx_tracking_solicitud_timestamp');

    await queryInterface.removeColumn('TrackingUbicacion', 'id_solicitud');

    await queryInterface.changeColumn('TrackingUbicacion', 'id_cita', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'Cita',
        key: 'id_cita',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },
};
