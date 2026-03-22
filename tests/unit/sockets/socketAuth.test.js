/**
 * @fileoverview Tests para socketAuth — middleware de autenticación JWT para Socket.IO.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger
jest.unstable_mockModule('../../../utils/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

// Mock jwtUtils
const mockVerifyToken = jest.fn();
const mockExtractTokenFromHeader = jest.fn();

jest.unstable_mockModule('../../../utils/jwtUtils.js', () => ({
    verifyToken: mockVerifyToken,
    extractTokenFromHeader: mockExtractTokenFromHeader,
}));

// Mock models
const mockClienteFindOne = jest.fn();
const mockTecnicoFindOne = jest.fn();

jest.unstable_mockModule('../../../models/index.js', () => ({
    Cliente: { findOne: mockClienteFindOne },
    Tecnico: { findOne: mockTecnicoFindOne },
}));

const { authenticateSocket } = await import('../../../sockets/auth/socketAuth.js');

/**
 * Helper: crea un mock de socket con handshake configurable.
 */
function createMockSocket(overrides = {}) {
    return {
        id: 'test-socket-id',
        handshake: {
            auth: {},
            headers: {},
        },
        usuario: null,
        perfil: null,
        ...overrides,
    };
}

describe('sockets/auth/socketAuth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('extracción de token', () => {
        it('usa token de handshake.auth.token (preferido)', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'jwt-token-auth' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockReturnValue({ id_usuario: 1, rol: 'ADMIN' });

            await authenticateSocket(socket, next);

            expect(mockVerifyToken).toHaveBeenCalledWith('jwt-token-auth');
            expect(next).toHaveBeenCalledWith();
        });

        it('usa Authorization header como fallback', async () => {
            const socket = createMockSocket({
                handshake: {
                    auth: {},
                    headers: { authorization: 'Bearer jwt-token-header' },
                },
            });
            const next = jest.fn();

            mockExtractTokenFromHeader.mockReturnValue('jwt-token-header');
            mockVerifyToken.mockReturnValue({ id_usuario: 1, rol: 'ADMIN' });

            await authenticateSocket(socket, next);

            expect(mockExtractTokenFromHeader).toHaveBeenCalledWith('Bearer jwt-token-header');
            expect(mockVerifyToken).toHaveBeenCalledWith('jwt-token-header');
            expect(next).toHaveBeenCalledWith();
        });

        it('rechaza conexión sin token', async () => {
            const socket = createMockSocket();
            const next = jest.fn();

            mockExtractTokenFromHeader.mockReturnValue(null);

            await authenticateSocket(socket, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toMatch(/token/i);
        });
    });

    describe('token inválido', () => {
        it('rechaza con token expirado', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'expired-token' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockImplementation(() => {
                throw new Error('Token expirado');
            });

            await authenticateSocket(socket, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toBe('Token expirado');
        });

        it('rechaza con token inválido', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'bad-token' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockImplementation(() => {
                throw new Error('Token inválido');
            });

            await authenticateSocket(socket, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('resolución de perfil', () => {
        it('resuelve id_cliente para rol CLIENTE', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'valid' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockReturnValue({ id_usuario: 1, rol: 'CLIENTE' });
            mockClienteFindOne.mockResolvedValue({ id_cliente: 42 });

            await authenticateSocket(socket, next);

            expect(socket.usuario).toEqual({ id_usuario: 1, rol: 'CLIENTE' });
            expect(socket.perfil).toEqual({ id_cliente: 42 });
            expect(mockClienteFindOne).toHaveBeenCalledWith({
                where: { id_usuario: 1 },
                attributes: ['id_cliente'],
            });
            expect(next).toHaveBeenCalledWith();
        });

        it('resuelve id_tecnico para rol TECNICO', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'valid' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockReturnValue({ id_usuario: 2, rol: 'TECNICO' });
            mockTecnicoFindOne.mockResolvedValue({ id_tecnico: 77 });

            await authenticateSocket(socket, next);

            expect(socket.usuario).toEqual({ id_usuario: 2, rol: 'TECNICO' });
            expect(socket.perfil).toEqual({ id_tecnico: 77 });
            expect(mockTecnicoFindOne).toHaveBeenCalledWith({
                where: { id_usuario: 2 },
                attributes: ['id_tecnico'],
            });
            expect(next).toHaveBeenCalledWith();
        });

        it('perfil vacío si no se encuentra el cliente', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'valid' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockReturnValue({ id_usuario: 99, rol: 'CLIENTE' });
            mockClienteFindOne.mockResolvedValue(null);

            await authenticateSocket(socket, next);

            expect(socket.perfil).toEqual({});
            expect(next).toHaveBeenCalledWith();
        });

        it('perfil vacío para rol ADMIN (ni cliente ni técnico)', async () => {
            const socket = createMockSocket({
                handshake: { auth: { token: 'valid' }, headers: {} },
            });
            const next = jest.fn();

            mockVerifyToken.mockReturnValue({ id_usuario: 1, rol: 'ADMIN' });

            await authenticateSocket(socket, next);

            expect(socket.perfil).toEqual({});
            expect(mockClienteFindOne).not.toHaveBeenCalled();
            expect(mockTecnicoFindOne).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith();
        });
    });
});
