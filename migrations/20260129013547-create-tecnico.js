'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Tecnico', {
      id_tecnico: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_usuario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'Usuario',
          key: 'id_usuario'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      ciudad_base: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: 'Ciudad',
            key: 'id_ciudad'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      url_foto: {
        type: Sequelize.STRING
      },
      url_docId: {
        type: Sequelize.STRING
      },
      // POSTGIS: Ubicacion base del tecnico
      ubicacion_base: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: true
      },
      // Radio de cobertura en kilómetros
      radio_cobertura_km: {
        type: Sequelize.INTEGER,
        defaultValue: 10,
        comment: 'Radio máximo en km que el técnico acepta viajar'
      },
      // Disponibilidad horaria (JSON)
      disponibilidad_horaria: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Ej: {"lunes": ["08:00-12:00", "14:00-18:00"], "martes": ["09:00-17:00"]}'
      },
      // ¿Acepta servicios inmediatos? (en 1-2 horas)
      disponible_inmediato: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      // Promedio de calificaciones
      prom_calificacion: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      // Estado de validación del técnico por admin
      estado_validacion: {
        type: Sequelize.ENUM('PENDIENTE_VALIDACION', 'ACTIVO', 'SUSPENDIDO', 'RECHAZADO'),
        allowNull: false,
        defaultValue: 'PENDIENTE_VALIDACION'
      },
      // Fecha en que fue validado por admin
      fecha_validacion: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Admin que validó al técnico
      validado_por: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Usuario',
          key: 'id_usuario'
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
    await queryInterface.dropTable('Tecnico');
  }
};