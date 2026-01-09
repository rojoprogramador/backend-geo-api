import express from 'express';
import cors from 'cors';
import sequelize from './config/database.js';


// 1. IMPORTAMOS LOS MODELOS
// Al importarlos así, obtenemos la variable para hacer las relaciones
import Rol from './models/Rol.js';
import Usuario from './models/Usuario.js';
import TipoDoc from './models/TipoDoc.js';

// 2. IMPORTAMOS LAS RUTAS
import usuarioRoutes from './routes/usuarioRoutes.js';
import authRoutes from './routes/authRoutes.js';

//Definir relaciones
Rol.hasMany(Usuario, { foreignKey: 'id_rol' });
Usuario.belongsTo(Rol, { foreignKey: 'id_rol' });

TipoDoc.hasMany(Usuario, { foreignKey: 'id_tipoDoc' });
Usuario.belongsTo(TipoDoc, { foreignKey: 'id_tipoDoc' });

const app = express();
const PORT = 3000;

//Middlewares
app.use(cors());
app.use(express.json());

// 3. USAMOS LAS RUTAS
// Esto significa que todas las rutas de usuario empezarán por /api/usuarios
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/auth', authRoutes);

// 4. RUTA DE PRUEBA
app.get('/', (req, res) => {
    res.json({ message: '¡Bienvenido a la Geo-API funcionando!' });
});

//Sincronizar modelos con la base de datos
async function main() {
    try {
        //conexión a la base de datos
        await sequelize.authenticate();
        console.log('✅ Connection has been established successfully. ✅');
        //sincronizar modelos
        //await sequelize.sync({ force: false });
        // console.log('✅ Tablas sincronizadas correctamente ✅');
        //Iniciar servidor
        app.listen(PORT, () =>{
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT} 🚀`);
        }); 
    } catch (error) {
        console.error('❌ error al iniciar el servidor: ❌', error);
    }
}

main();