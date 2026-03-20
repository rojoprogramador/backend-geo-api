import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegurarse de que el directorio de uploads existe
const uploadsDir = path.join(__dirname, '..', 'uploads', 'fotos');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generar nombre único: tecnico-{id_usuario}-{timestamp}.{extension}
        const uniqueSuffix = Date.now();
        const allowedExtensions = ['.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = allowedExtensions.includes(ext) ? ext : '.jpg';
        const filename = `tecnico-${req.usuario.id_usuario}-${uniqueSuffix}${safeExt}`;
        cb(null, filename);
    }
});

// Filtro para validar tipos de archivo
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato de imagen no permitido. Solo se aceptan JPG, JPEG o PNG'), false);
    }
};

// Configuración de multer
export const uploadFoto = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // Límite de 5MB
    }
});
