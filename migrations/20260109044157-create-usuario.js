'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Usuario', {
      id_usuario: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      nombre: {
        type: Sequelize.STRING,
        allowNull: false
      },
      apellido: {
        type: Sequelize.STRING,
        allowNull: false
      },
      fecha_nacimiento: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      correo_electronico: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      telefono: {
        type: Sequelize.STRING,
        allowNull: true
      },
      contraseña: {
        type: Sequelize.STRING,
        allowNull: false
      },
      num_identificacion: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      id_rol: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Rol',
          key: 'id_rol'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      id_tipoDoc: {
        type: Sequelize.INTEGER,
        references: {
          model: 'TipoDoc',
          key: 'id_tipoDoc'
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

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('Usuario');
  }
};
