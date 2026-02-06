'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CuentaTecnico', {
      id_cuenta: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Tecnico (Relación 1:1)
      id_tecnico: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'Tecnico',
          key: 'id_tecnico'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Saldos
      saldo_disponible: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Saldo que el técnico puede retirar'
      },
      saldo_pendiente: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Trabajos completados pero pago aún no liberado'
      },
      total_ganado: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Total histórico ganado'
      },
      total_comisiones_plataforma: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00,
        comment: 'Total histórico de comisiones pagadas a la plataforma'
      },
      // Datos bancarios
      cuenta_bancaria: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Número de cuenta para transferencias'
      },
      tipo_cuenta: {
        type: Sequelize.ENUM('AHORROS', 'CORRIENTE'),
        allowNull: true
      },
      banco: {
        type: Sequelize.STRING,
        allowNull: true
      },
      titular_cuenta: {
        type: Sequelize.STRING,
        allowNull: true
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
    await queryInterface.dropTable('CuentaTecnico');
  }
};
