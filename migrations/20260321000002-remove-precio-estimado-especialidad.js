/** @type {import('sequelize-cli').Migration} */
export default {
    async up(queryInterface, _Sequelize) {
        await queryInterface.removeColumn('Especialidad', 'precio_estimado');
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.addColumn('Especialidad', 'precio_estimado', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
    },
};
