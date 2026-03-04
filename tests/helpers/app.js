import express from 'express';
import authRoutes from '../../routes/authRoutes.js';
import clienteRoutes from '../../routes/clienteRoutes.js';
import tecnicoRoutes from '../../routes/tecnicoRoutes.js';
import categoriaRoutes from '../../routes/categoriaRoutes.js';
import subcategoriaRoutes from '../../routes/subcategoriaRoutes.js';
import solicitudRoutes from '../../routes/solicitudRoutes.js';
import cotizacionRoutes from '../../routes/cotizacionRoutes.js';
import calificacionRoutes from '../../routes/calificacionRoutes.js';
import servicioRoutes from '../../routes/servicioRoutes.js';
import ciudadRoutes from '../../routes/ciudadRoutes.js';

export function createApp() {
  const app = express();
  app.use(express.json());

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

  return app;
}
