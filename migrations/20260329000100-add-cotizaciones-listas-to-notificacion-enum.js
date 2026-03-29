'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_Notificacion_tipo\" ADD VALUE IF NOT EXISTS 'COTIZACIONES_LISTAS';"
    );
  },

  async down() {
    // PostgreSQL no permite eliminar valores de ENUM fácilmente sin recrear el tipo.
    // Se deja no-op para rollback seguro.
    return;
  }
};
