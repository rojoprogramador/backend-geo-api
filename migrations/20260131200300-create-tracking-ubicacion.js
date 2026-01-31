'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TrackingUbicacion', {
      id_tracking: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Cita (el tracking es para citas confirmadas)
      id_cita: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Cita',
          key: 'id_cita'
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
      // POSTGIS: Ubicación actual del técnico
      ubicacion_actual: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: false,
        comment: 'Ubicación GPS en tiempo real del técnico'
      },
      // Datos del movimiento
      velocidad_kmh: {
        type: Sequelize.FLOAT,
        allowNull: true,
        comment: 'Velocidad actual en km/h'
      },
      en_movimiento: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Si está en movimiento o detenido'
      },
      // Timestamp del punto
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
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

    // Índice para consultas rápidas por cita
    await queryInterface.addIndex('TrackingUbicacion', ['id_cita', 'timestamp']);
    // Índice espacial para búsquedas geográficas
    await queryInterface.addIndex('TrackingUbicacion', ['ubicacion_actual'], {
      using: 'GIST'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('TrackingUbicacion');
  }
};
