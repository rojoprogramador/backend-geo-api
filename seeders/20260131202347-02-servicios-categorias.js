'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. CATEGORIAS PRINCIPALES
    await queryInterface.bulkInsert('Categoria', [
      { id_categoria: 1, descripcion: 'Plomería', createdAt: new Date(), updatedAt: new Date() },
      { id_categoria: 2, descripcion: 'Electricidad', createdAt: new Date(), updatedAt: new Date() },
      { id_categoria: 3, descripcion: 'Carpintería', createdAt: new Date(), updatedAt: new Date() }
    ]);

    // 2. SUBCATEGORIA
    await queryInterface.bulkInsert('Subcategoria', [
      // Plomería (ID 1)
      { descripcion: 'Reparación de tuberías', id_categoria: 1, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Instalación de grifos', id_categoria: 1, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Destape de cañerías', id_categoria: 1, createdAt: new Date(), updatedAt: new Date() },
      
      // Electricidad (ID 2)
      { descripcion: 'Instalación eléctrica', id_categoria: 2, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Reparación de tomas', id_categoria: 2, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Cambio de luminarias', id_categoria: 2, createdAt: new Date(), updatedAt: new Date() },

      // Carpintería (ID 3)
      { descripcion: 'Reparación de puertas', id_categoria: 3, createdAt: new Date(), updatedAt: new Date() },
      { descripcion: 'Armado de muebles', id_categoria: 3, createdAt: new Date(), updatedAt: new Date() }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Subcategoria', null, {});
    await queryInterface.bulkDelete('Categoria', null, {});
  }
};