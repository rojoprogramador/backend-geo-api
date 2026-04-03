
import { Servicio, Transaccion, Garantia, MedioPago, Solicitud, Cliente, Tecnico, Subcategoria, EstadoSolicitud, Usuario } from './models/index.js';
import logger from './utils/logger.js';

async function testInclude() {
    try {
        console.log('--- Iniciando prueba de asociaciones ---');
        
        // Buscamos cualquier servicio existente para probar
        const servicio = await Servicio.findOne({
            include: [
                {
                    model: Transaccion,
                    as: 'transaccion',
                    include: [
                        {
                            model: MedioPago,
                            as: 'medio_pago',
                        }
                    ]
                },
                {
                    model: Garantia,
                    as: 'garantia',
                }
            ]
        });

        if (servicio) {
            console.log('✅ Éxito: Se pudo consultar el servicio con Transaccion y Garantia as siblings.');
            console.log('ID Servicio:', servicio.id_servicio);
            console.log('Tiene Transaccion:', !!servicio.transaccion);
            console.log('Tiene Garantia:', !!servicio.garantia);
        } else {
            console.log('ℹ️ No se encontraron servicios en la DB, pero la consulta no falló por error de asociación.');
        }

    } catch (error) {
        console.error('❌ Error detectado en las asociaciones:');
        console.error(error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

testInclude();
