import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// --- Inline Mocks ---
const mockUsuario = {
  findAll: jest.fn(),
  create: jest.fn(),
};
const mockRol = { _name: 'Rol' };
const mockTipoDoc = { _name: 'TipoDoc' };
const mockBcrypt = { hash: jest.fn() };

jest.unstable_mockModule('../../../models/Usuario.js', () => ({
  default: mockUsuario,
}));
jest.unstable_mockModule('../../../models/Rol.js', () => ({
  default: mockRol,
}));
jest.unstable_mockModule('../../../models/TipoDoc.js', () => ({
  default: mockTipoDoc,
}));
jest.unstable_mockModule('bcrypt', () => ({
  default: mockBcrypt,
}));

const { getUsuarios, createUsuario } = await import(
  '../../../controllers/usuarioController.js'
);

// -----------------------------------------------------------------------

describe('usuarioController', () => {
  let req, res;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    jest.clearAllMocks();
  });

  // =====================================================================
  // getUsuarios
  // =====================================================================
  describe('getUsuarios', () => {
    it('debe retornar lista de usuarios → 200', async () => {
      const usuarios = [
        { id_usuario: 1, nombre: 'Admin', Rol: { descripcion: 'ADMIN' } },
        { id_usuario: 2, nombre: 'Juan', Rol: { descripcion: 'CLIENTE' } },
      ];
      mockUsuario.findAll.mockResolvedValue(usuarios);

      await getUsuarios(req, res);

      expect(mockUsuario.findAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(usuarios);
    });

    it('debe retornar 500 si hay error en BD', async () => {
      mockUsuario.findAll.mockRejectedValue(new Error('DB error'));

      await getUsuarios(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.jsonData.message).toBe('Error al obtener usuarios');
    });
  });

  // =====================================================================
  // createUsuario
  // =====================================================================
  describe('createUsuario', () => {
    it('debe crear usuario exitosamente → 201', async () => {
      req.body = {
        nombre: 'María',
        apellido: 'González',
        fecha_nacimiento: '1995-03-20',
        correo_electronico: 'maria@example.com',
        telefono: '3101234567',
        contraseña: 'MiPassword123!',
        id_rol: 2,
        id_tipoDoc: 1,
        num_identificacion: '1098765432',
      };

      mockBcrypt.hash.mockResolvedValue('$2b$10$hashedPassword');
      mockUsuario.create.mockResolvedValue({
        id_usuario: 5,
        nombre: 'María',
        correo_electronico: 'maria@example.com',
      });

      await createUsuario(req, res);

      expect(mockBcrypt.hash).toHaveBeenCalledWith('MiPassword123!', 10);
      expect(mockUsuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'María',
          correo_electronico: 'maria@example.com',
          contraseña: '$2b$10$hashedPassword',
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData.message).toBe('Usuario creado con éxito');
      expect(res.jsonData.usuario.id).toBe(5);
    });

    it('debe retornar 500 si hay error al crear', async () => {
      req.body = {
        nombre: 'Test',
        contraseña: 'pass',
      };

      mockBcrypt.hash.mockRejectedValue(new Error('hash error'));

      await createUsuario(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.jsonData.message).toBe('Error al crear usuario');
    });
  });
});
