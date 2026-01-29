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
      // 2. Relación con CLIENTE (Tabla Cliente)
      id_cliente: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Cliente', 
          key: 'id_cliente'
        },
        onUpdate: 'CASCADE'
      },
      // 3. Relación con TÉCNICO (Tabla Tecnico)
      id_tecnico: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Tecnico', 
          key: 'id_tecnico'
        },
        onUpdate: 'CASCADE'
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