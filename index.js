import express from 'express';
import cors from 'cors';
import { sequelize } from './models/index.js';

// 2. IMPORTAMOS LAS RUTAS
import usuarioRoutes from './routes/usuarioRoutes.js';
import authRoutes from './routes/authRoutes.js';

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