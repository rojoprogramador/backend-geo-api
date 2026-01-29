'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Solicitud', {
      id_solicitud: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      descripcion: {
        type: Sequelize.TEXT
      },
      imagenes: {
        type: Sequelize.TEXT
      },
      ubicacion_solicitud: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: false
      },
      valor_solicitud: {
        type: Sequelize.DECIMAL(10, 2)
      },
      num_rechazos: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      fecha_solicitud: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      id_cliente: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Cliente',
          key: 'id_cliente'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      id_tecnico: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Tecnico',
          key: 'id_tecnico'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      id_subcategoria: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Subcategoria',
          key: 'id_subcategoria'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      id_estado: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        references: {
          model: 'EstadoSolicitud',
          key: 'id_estado'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      prioridad: {
        type: Sequelize.STRING,
        defaultValue: 'MEDIA'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Solicitud');
  }
};