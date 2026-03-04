import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createReqMock, createResMock } from '../../mocks/models.js';

// Mock jwt y dotenv antes de importar el middleware
const mockVerify = jest.fn();
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { verify: mockVerify },
}));
jest.unstable_mockModule('dotenv', () => ({
  default: { config: jest.fn() },
}));

// Importar después de mockear
const { verifyToken, permitirRoles } = await import(
  '../../../middleware/authMiddleware.js'
);

describe('Middleware: verifyToken', () => {
  let req, res, next;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    next = jest.fn();
    mockVerify.mockReset();
    process.env.JWT_SECRET = 'test_secret';
  });

  it('debe retornar 401 si no hay header Authorization', () => {
    req.headers = {};

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.jsonData.message).toBe(
      'No se proporcionó token de autenticación'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('debe retornar 401 si el formato del token es inválido (sin Bearer)', () => {
    req.headers = { authorization: 'InvalidFormat' };

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.jsonData.message).toBe('Formato de token invalido');
    expect(next).not.toHaveBeenCalled();
  });

  it('debe retornar 401 si jwt.verify lanza error (token expirado/inválido)', () => {
    req.headers = { authorization: 'Bearer token_invalido' };
    mockVerify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.jsonData.message).toBe('Token inválido o expirado');
    expect(next).not.toHaveBeenCalled();
  });

  it('debe llamar next() y asignar req.usuario con token válido', () => {
    const payload = { id_usuario: 1, rol: 'CLIENTE' };
    req.headers = { authorization: 'Bearer token_valido' };
    mockVerify.mockReturnValue(payload);

    verifyToken(req, res, next);

    expect(mockVerify).toHaveBeenCalledWith('token_valido', 'test_secret');
    expect(req.usuario).toEqual(payload);
    expect(next).toHaveBeenCalled();
  });
});

describe('Middleware: permitirRoles', () => {
  let req, res, next;

  beforeEach(() => {
    req = createReqMock();
    res = createResMock();
    next = jest.fn();
  });

  it('debe retornar 500 si req.usuario no existe', () => {
    req.usuario = null;

    const middleware = permitirRoles('ADMIN');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('debe retornar 500 si req.usuario.rol no existe', () => {
    req.usuario = { id_usuario: 1 };

    const middleware = permitirRoles('ADMIN');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('debe retornar 403 si el rol no está en la lista de permitidos', () => {
    req.usuario = { id_usuario: 1, rol: 'CLIENTE' };

    const middleware = permitirRoles('ADMIN');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.jsonData.message).toContain('Acceso denegado');
    expect(next).not.toHaveBeenCalled();
  });

  it('debe llamar next() si el rol está en la lista de permitidos', () => {
    req.usuario = { id_usuario: 1, rol: 'ADMIN' };

    const middleware = permitirRoles('ADMIN');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('debe aceptar múltiples roles permitidos', () => {
    req.usuario = { id_usuario: 1, rol: 'TECNICO' };

    const middleware = permitirRoles('ADMIN', 'TECNICO');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('debe rechazar si el rol no está entre los múltiples permitidos', () => {
    req.usuario = { id_usuario: 1, rol: 'CLIENTE' };

    const middleware = permitirRoles('ADMIN', 'TECNICO');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
