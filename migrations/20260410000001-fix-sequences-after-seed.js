'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface) {
    // Resetea las secuencias de las tablas que recibieron IDs explícitos en seeders.
    // PostgreSQL no avanza la secuencia cuando se inserta con ID explícito,
    // lo que provoca colisión de PK al crear registros nuevos.
    const sequences = [
      { table: 'Categoria',       column: 'id_categoria' },
      { table: 'Rol',             column: 'id_rol'       },
      { table: 'TipoDoc',         column: 'id_tipoDoc'   },
      { table: 'Pais',            column: 'id_pais'      },
      { table: 'EstadoSolicitud', column: 'id_estado'    },
    ];

    for (const { table, column } of sequences) {
      await queryInterface.sequelize.query(`
        SELECT setval(
          pg_get_serial_sequence('"${table}"', '${column}'),
          COALESCE(MAX("${column}"), 0)
        )
        FROM "${table}";
      `);
    }
  },

  async down() {
    // No hay forma segura de revertir esto sin conocer el valor previo.
    // Los seeders de down se encargan de eliminar los registros.
  }
};
