export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('CiudadTecnico', {
            id_ciudad_tecnico: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            id_tecnico: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Tecnico',
                    key: 'id_tecnico',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            id_ciudad: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Ciudad',
                    key: 'id_ciudad',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('NOW()'),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('NOW()'),
            },
        });

        // Índice único para evitar duplicados: un técnico no puede tener la misma ciudad dos veces
        await queryInterface.addIndex('CiudadTecnico', ['id_tecnico', 'id_ciudad'], {
            unique: true,
            name: 'idx_ciudad_tecnico_unique',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('CiudadTecnico');
    }
};
