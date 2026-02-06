'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Notificacion', {
      id_notificacion: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Usuario (puede ser cliente o técnico)
      id_usuario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Usuario',
          key: 'id_usuario'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Tipo de notificación
      tipo: {
        type: Sequelize.ENUM(
          'NUEVA_SOLICITUD',
          'COTIZACION_RECIBIDA',
          'COTIZACION_ACEPTADA',
          'CITA_CONFIRMADA',
          'TECNICO_EN_CAMINO',
          'TECNICO_CERCA',
          'SERVICIO_INICIADO',
          'SERVICIO_COMPLETADO',
          'PAGO_RECIBIDO',
          'CALIFICACION_RECIBIDA',
          'VALIDACION_COMPLETADA'
        ),
        allowNull: false
      },
      // Contenido
      titulo: {
        type: Sequelize.STRING,
        allowNull: false
      },
      mensaje: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      // Datos adicionales en JSON (IDs relacionados)
      datos_adicionales: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Ej: {"id_solicitud": 123, "id_cotizacion": 456}'
      },
      // Estado
      leida: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      push_enviado: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      fecha_envio: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
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

    // Índice para consultas rápidas por usuario
    await queryInterface.addIndex('Notificacion', ['id_usuario', 'leida']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Notificacion');
  }
};
