'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Servicio', {
      id_servicio: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      // FK Cliente
      id_cliente: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Cliente',
          key: 'id_cliente'
        }
      },
      // FK Tecnico
      id_tecnico: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Tecnico',
          key: 'id_tecnico'
        }
      },
      // FK Subcategoria
      id_subcategoria: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Subcategoria',
          key: 'id_subcategoria'
        }
      },
      // FK Medio Pago
      id_medioPago: {
        type: Sequelize.INTEGER,
        references: {
          model: 'MedioPago',
          key: 'id_medioPago'
        }
      },
      // FK Estado
      id_estado: {
        type: Sequelize.INTEGER,
        references: {
          model: 'EstadoSolicitud',
          key: 'id_estado'
        }
      },
      // POSTGIS: Ubicación del servicio
      ubicacion_servicio: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: true
      },   
      imagenes: { 
        type: Sequelize.TEXT //guardar URLs de fotos de evidencia
      },
      valor_total: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      fecha_servicio: {
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
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Servicio');
  }
};