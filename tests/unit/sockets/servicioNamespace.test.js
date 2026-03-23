import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));

const { registerServicioHandlers } = await import('../../../sockets/namespaces/servicioNamespace.js');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeSocket(usuarioOverrides = {}, perfilOverride = null) {
  const handlers = {};
  const socket = {
    id: 'socket-srv-1',
    usuario: { id_usuario: 10, rol: 'CLIENTE', ...usuarioOverrides },
    perfil: perfilOverride,
    join:  jest.fn(),
    leave: jest.fn(),
    emit:  jest.fn(),
    on:    jest.fn((event, cb) => { handlers[event] = cb; }),
  };
  return { socket, handlers };
}

function makeNsp(socket) {
  return {
    on:   jest.fn((event, cb) => { if (event === 'connection') cb(socket); }),
    emit: jest.fn(),
  };
}

// ---------------------------------------------------------------------------

describe('servicioNamespace — registerServicioHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connection — CLIENTE', () => {
    it('auto-join user room', () => {
      const { socket } = makeSocket();
      registerServicioHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
    });

    it('NO auto-join tecnico room si rol es CLIENTE', () => {
      const { socket } = makeSocket();
      registerServicioHandlers(makeNsp(socket));
      expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining('tecnico:'));
    });

    it('loguea la conexión', () => {
      const { socket } = makeSocket();
      registerServicioHandlers(makeNsp(socket));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Conectado'));
    });
  });

  describe('connection — TECNICO', () => {
    it('auto-join user room y tecnico room si tiene perfil', () => {
      const { socket } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 7 });
      registerServicioHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
      expect(socket.join).toHaveBeenCalledWith('tecnico:7');
    });

    it('NO auto-join tecnico room si perfil es null', () => {
      const { socket } = makeSocket({ rol: 'TECNICO' }, null);
      registerServicioHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
      expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining('tecnico:'));
    });
  });

  describe('evento disconnect', () => {
    it('loguea desconexión', () => {
      const { socket, handlers } = makeSocket();
      registerServicioHandlers(makeNsp(socket));

      handlers['disconnect']();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Desconectado'));
    });
  });
});
