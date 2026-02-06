'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Transaccion', {
      id_transaccion: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Servicio (Relación 1:1 - Un servicio tiene UNA transacción)
      id_servicio: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'Servicio',
          key: 'id_servicio'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Montos
      monto_total: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Monto total del servicio'
      },
      monto_tecnico: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Lo que recibe el técnico después de comisión'
      },
      comision_plataforma: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Comisión que se lleva la plataforma'
      },
      // FK Medio de Pago
      id_medioPago: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'MedioPago',
          key: 'id_medioPago'
        },
        onUpdate: 'CASCADE'
      },
      // Método de cobro
      metodo_cobro: {
        type: Sequelize.ENUM('PLATAFORMA', 'EFECTIVO', 'CRUCE_CUENTAS'),
        allowNull: false,
        defaultValue: 'PLATAFORMA',
        comment: 'PLATAFORMA: pago online, EFECTIVO: pago al técnico, CRUCE_CUENTAS: compensación'
      },
      // Estado del pago
      estado_pago: {
        type: Sequelize.ENUM('PENDIENTE', 'COMPLETADO', 'FALLIDO', 'REEMBOLSADO'),
        allowNull: false,
        defaultValue: 'PENDIENTE'
      },
      // Fecha y comprobante
      fecha_pago: {
        type: Sequelize.DATE,
        allowNull: true
      },
      comprobante_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL de imagen del comprobante (si es efectivo)'
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
    await queryInterface.dropTable('Transaccion');
  }
};
