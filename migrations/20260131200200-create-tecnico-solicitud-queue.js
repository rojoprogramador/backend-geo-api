'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TecnicoSolicitudQueue', {
      id_cola: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Solicitud
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
      // FK Tecnico
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
      // Fechas de seguimiento
      fecha_notificacion: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      fecha_respuesta: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Estado de la respuesta del técnico
      estado_respuesta: {
        type: Sequelize.ENUM(
          'NOTIFICADO',      // Se le notificó pero aún no ha visto
          'VISTO',           // Vio la solicitud pero no respondió
          'COTIZADO',        // Envió cotización
          'RECHAZADO',       // Rechazó explícitamente
          'IGNORADO'         // No respondió en tiempo límite
        ),
        allowNull: false,
        defaultValue: 'NOTIFICADO'
      },
      // Motivo de rechazo (si aplica)
      motivo_rechazo: {
        type: Sequelize.STRING,
        allowNull: true
      },
      // Score de prioridad (para algoritmo de asignación)
      priority_score: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Score calculado basado en distancia, calificación, disponibilidad'
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

    // Índice compuesto para consultas rápidas
    await queryInterface.addIndex('TecnicoSolicitudQueue', ['id_solicitud', 'estado_respuesta']);
    // Índice para encontrar técnicos por solicitud
    await queryInterface.addIndex('TecnicoSolicitudQueue', ['id_tecnico', 'estado_respuesta']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('TecnicoSolicitudQueue');
  }
};
