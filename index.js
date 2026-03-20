import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { sequelize } from './models/index.js';
import { swaggerSpec } from './docs/swagger/swagger.js';

// 2. IMPORTAMOS LAS RUTAS
import usuarioRoutes from './routes/usuarioRoutes.js';
import authRoutes from './routes/authRoutes.js';
import clienteRoutes from './routes/clienteRoutes.js';
import tecnicoRoutes from './routes/tecnicoRoutes.js';
import categoriaRoutes from './routes/categoriaRoutes.js';
import subcategoriaRoutes from './routes/subcategoriaRoutes.js';
import solicitudRoutes from './routes/solicitudRoutes.js';
import cotizacionRoutes from './routes/cotizacionRoutes.js';
import calificacionRoutes from './routes/calificacionRoutes.js';
import servicioRoutes from './routes/servicioRoutes.js';
import ciudadRoutes from './routes/ciudadRoutes.js';

const app = express();
const PORT = 3000;

// Middlewares
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

// Servir archivos estáticos de uploads (fotos de perfil)
app.use('/uploads', express.static('uploads'));

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
app.use('/api/clientes', clienteRoutes);
app.use('/api/tecnicos', tecnicoRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/subcategorias', subcategoriaRoutes);
app.use('/api/solicitudes', solicitudRoutes);
app.use('/api/cotizaciones', cotizacionRoutes);
app.use('/api/calificaciones', calificacionRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/ciudades', ciudadRoutes);

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
        // Validar JWT_SECRET en inicio
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            console.warn('⚠️  ADVERTENCIA: JWT_SECRET debe tener al menos 32 caracteres para producción');
        }

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