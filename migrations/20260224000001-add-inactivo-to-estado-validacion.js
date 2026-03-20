'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // IMPORTANTE: ALTER TYPE ADD VALUE no puede ejecutarse dentro de una transacción
    // PostgreSQL no permite esta operación dentro de un bloque transaccional
    // Por eso NO usamos queryInterface.sequelize.transaction() aquí

    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Tecnico_estado_validacion"
      ADD VALUE IF NOT EXISTS 'INACTIVO';
    `);
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL no soporta eliminar valores de un ENUM directamente
    // La única forma sería recrear el tipo y todas las columnas que lo usan
    // Esto es muy peligroso y puede causar pérdida de datos
    // Por lo tanto, esta migración no es reversible
    console.log('⚠️  No se puede revertir la adición de un valor ENUM en PostgreSQL');
    console.log('⚠️  El valor INACTIVO permanecerá en el tipo enum_Tecnico_estado_validacion');
  }
};
