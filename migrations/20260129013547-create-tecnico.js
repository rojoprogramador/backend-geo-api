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
      maneja_radio: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      radio_cobertura: {
        type: Sequelize.INTEGER
      },
      //POSTGIS: Ubicacion base del tecnico
      ubicacion_base: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: true
      },
      prom_calificacion: {
        type: Sequelize.FLOAT,
        defaultValue: 0 
      },
      estado: {
        type: Sequelize.STRING,
        defaultValue: 'activo' 
      },
      validado: {
        type: Sequelize.BOOLEAN,
        defaultValue: false 
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