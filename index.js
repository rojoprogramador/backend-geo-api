import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { sequelize } from './models/index.js';
import { swaggerSpec } from './docs/swagger/swagger.js';

// 2. IMPORTAMOS LAS RUTAS
import usuarioRoutes from './routes/usuarioRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();
const PORT = 3000;

//Middlewares
app.use(cors());
app.use(express.json());

// 📚 DOCUMENTACIÓN SWAGGER
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Geo-API Docs',
    swaggerOptions: {
        persistAuthorization: true, // Mantener token JWT entre recargas
        docExpansion: 'none',        // Collapsar secciones por defecto
        filter: true,                // Habilitar barra de búsqueda
        tagsSorter: 'alpha'          // Ordenar tags alfabéticamente
    }
}));

// Endpoint JSON de Swagger (para importar en Postman/Insomnia)
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// 3. USAMOS LAS RUTAS
// Esto significa que todas las rutas de usuario empezarán por /api/usuarios
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/auth', authRoutes);

// 4. RUTA DE PRUEBA
app.get('/', (req, res) => {
    res.json({
        message: '¡Bienvenido a Geo-API!',
        version: '1.0.0',
        docs: `http://localhost:${PORT}/api-docs`,
        status: 'online'
    });
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
            console.log(`📚 Documentación Swagger en http://localhost:${PORT}/api-docs`);
        }); 
    } catch (error) {
        console.error('❌ error al iniciar el servidor: ❌', error);
    }
}

main();