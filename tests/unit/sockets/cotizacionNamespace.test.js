import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));

const { CLIENT_EVENTS, SERVER_EVENTS } = await import('../../../sockets/constants/events.js');
const { registerCotizacionHandlers } = await import('../../../sockets/namespaces/cotizacionNamespace.js');

// ---------------------------------------------------------------------------
// Helper: crea un socket mock y captura sus handlers
// ---------------------------------------------------------------------------
function makeSocket(usuarioOverrides = {}, perfilOverride = null) {
  const handlers = {};
  const socket = {
    id: 'socket-cot-1',
    usuario: { id_usuario: 10, rol: 'CLIENTE', ...usuarioOverrides },
    perfil: perfilOverride,
    join:  jest.fn(),
    leave: jest.fn(),
    emit:  jest.fn(),
    to:    jest.fn().mockReturnValue({ emit: jest.fn() }),
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

describe('cotizacionNamespace — registerCotizacionHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connection — CLIENTE', () => {
    it('auto-join room personal user:{id}', () => {
      const { socket } = makeSocket();
      registerCotizacionHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
    });

    it('NO auto-join tecnico room si rol es CLIENTE', () => {
      const { socket } = makeSocket();
      registerCotizacionHandlers(makeNsp(socket));
      expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining('tecnico:'));
    });
  });

  describe('connection — TECNICO', () => {
    it('auto-join user room y tecnico room si tiene perfil', () => {
      const { socket } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 5 });
      registerCotizacionHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
      expect(socket.join).toHaveBeenCalledWith('tecnico:5');
    });

    it('NO auto-join tecnico room si perfil es null', () => {
      const { socket } = makeSocket({ rol: 'TECNICO' }, null);
      registerCotizacionHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
      expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining('tecnico:'));
    });
  });

  describe(`evento ${CLIENT_EVENTS.JOIN_COTIZACIONES_ROOM}`, () => {
    it('join room cotizaciones:{id} cuando id_solicitud es válido', () => {
      const { socket, handlers } = makeSocket();
      registerCotizacionHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.JOIN_COTIZACIONES_ROOM]({ id_solicitud: 15 });

      expect(socket.join).toHaveBeenCalledWith('cotizaciones:15');
    });

    it('emite server:error si id_solicitud no es enviado', () => {
      const { socket, handlers } = makeSocket();
      registerCotizacionHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.JOIN_COTIZACIONES_ROOM]({});

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, { message: 'id_solicitud requerido' });
      expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining('cotizaciones:'));
    });
  });

  describe('evento disconnect', () => {
    it('loguea desconexión', () => {
      const { socket, handlers } = makeSocket();
      registerCotizacionHandlers(makeNsp(socket));

      handlers['disconnect']();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Desconectado')
      );
    });
  });
});
