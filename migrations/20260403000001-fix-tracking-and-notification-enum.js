'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. Asegurar que id_cita sea nullable en la tabla TrackingUbicacion
    // Aunque ya existe una migración, forzamos el cambio para corregir estados inconsistentes
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

    // 2. Agregar PAGO_CONFIRMADO al enum de Notificacion
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_Notificacion_tipo\" ADD VALUE IF NOT EXISTS 'PAGO_CONFIRMADO';"
    );
  },

  async down(queryInterface, Sequelize) {
    // Para id_cita, revertimos a NOT NULL
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
    
    // El enum en Postgres no permite remover valores fácilmente.
  },
};
