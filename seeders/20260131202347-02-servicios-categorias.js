'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    // 1. CATEGORIAS PRINCIPALES
    await queryInterface.bulkInsert('Categoria', [
      { 
        id_categoria: 1, 
        nombre: 'Plomería',       // <--- AQUI VA EL TÍTULO CORTO
        descripcion: 'Servicios de fontanería, tuberías y desagües', // <--- DESCRIPCIÓN DETALLADA
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        id_categoria: 2, 
        nombre: 'Electricidad', 
        descripcion: 'Instalaciones eléctricas, reparaciones y mantenimiento', 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        id_categoria: 3, 
        nombre: 'Carpintería', 
        descripcion: 'Trabajos en madera, muebles y estructuras', 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      }
    ]);

    // 2. SUBCATEGORIAS
    await queryInterface.bulkInsert('Subcategoria', [
      // --- Plomería (ID 1) ---
      { 
        nombre: 'Reparación de tuberías', 
        descripcion: 'Arreglo de fugas, goteos y tuberías rotas',
        id_categoria: 1, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        nombre: 'Instalación de grifos', 
        descripcion: 'Montaje y cambio de grifería para baños y cocinas',
        id_categoria: 1, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        nombre: 'Destape de cañerías', 
        descripcion: 'Desobstrucción de desagües, sifones y cañerías',
        id_categoria: 1, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      
      // --- Electricidad (ID 2) ---
      { 
        nombre: 'Instalación eléctrica', 
        descripcion: 'Cableado nuevo, puntos de luz y acometidas',
        id_categoria: 2, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        nombre: 'Reparación de tomas', 
        descripcion: 'Arreglo de enchufes, interruptores y cortos',
        id_categoria: 2, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        nombre: 'Cambio de luminarias', 
        descripcion: 'Instalación de lámparas, bombillos LED y reflectores',
        id_categoria: 2, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },

      // --- Carpintería (ID 3) ---
      { 
        nombre: 'Reparación de puertas', 
        descripcion: 'Ajuste de puertas caídas, chapas y bisagras',
        id_categoria: 3, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      },
      { 
        nombre: 'Armado de muebles', 
        descripcion: 'Ensamblaje de muebles modulares, closets y escritorios',
        id_categoria: 3, 
        activo: true,
        createdAt: new Date(), 
        updatedAt: new Date() 
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Subcategoria', null, {});
    await queryInterface.bulkDelete('Categoria', null, {});
  }
};