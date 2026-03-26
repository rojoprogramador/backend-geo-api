'use strict';
/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // Centro geográfico de la ciudad (POINT 4326)
    await queryInterface.addColumn('Ciudad', 'ubicacion_centro', {
      type: Sequelize.DataTypes.GEOMETRY('POINT', 4326),
      allowNull: true,
      comment: 'Centro geográfico de la ciudad para búsqueda por cobertura',
    });

    // Radio de cobertura de la ciudad en km
    await queryInterface.addColumn('Ciudad', 'radio_ciudad_km', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 25,
      comment: 'Radio en km que define el área de la ciudad',
    });

    // Seed ciudades principales de Colombia
    await queryInterface.sequelize.query(`
      UPDATE "Ciudad" SET
        ubicacion_centro = ST_SetSRID(ST_MakePoint(-76.532, 3.4516), 4326),
        radio_ciudad_km = 25
      WHERE nombre_ciudad = 'Cali';
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Ciudad" SET
        ubicacion_centro = ST_SetSRID(ST_MakePoint(-74.0721, 4.711), 4326),
        radio_ciudad_km = 30
      WHERE nombre_ciudad = 'Bogotá';
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Ciudad" SET
        ubicacion_centro = ST_SetSRID(ST_MakePoint(-75.5812, 6.2442), 4326),
        radio_ciudad_km = 25
      WHERE nombre_ciudad = 'Medellín';
    `);
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Ciudad', 'radio_ciudad_km');
    await queryInterface.removeColumn('Ciudad', 'ubicacion_centro');
  }
};
