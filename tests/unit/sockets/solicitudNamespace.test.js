import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockMarkOnline  = jest.fn();
const mockMarkOffline = jest.fn();

jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../../../sockets/services/presenceManager.js', () => ({
  markOnline:  mockMarkOnline,
  markOffline: mockMarkOffline,
}));

const { CLIENT_EVENTS, SERVER_EVENTS } = await import('../../../sockets/constants/events.js');
const { registerSolicitudHandlers } = await import('../../../sockets/namespaces/solicitudNamespace.js');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeSocket(usuarioOverrides = {}, perfilOverride = null) {
  const handlers = {};
  const socket = {
    id: 'socket-sol-1',
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
  const nsp = {
    on:   jest.fn((event, cb) => { if (event === 'connection') cb(socket); }),
    emit: jest.fn(),
  };
  return nsp;
}

// ---------------------------------------------------------------------------

describe('solicitudNamespace — registerSolicitudHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── connection ────────────────────────────────────────────────────────────

  describe('connection — CLIENTE', () => {
    it('auto-join user room', () => {
      const { socket } = makeSocket();
      registerSolicitudHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
    });

    it('NO llama a markOnline para CLIENTE', () => {
      const { socket } = makeSocket();
      registerSolicitudHandlers(makeNsp(socket));
      expect(mockMarkOnline).not.toHaveBeenCalled();
    });
  });

  describe('connection — TECNICO', () => {
    it('auto-join user room y tecnico room', () => {
      const { socket } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 5 });
      registerSolicitudHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
      expect(socket.join).toHaveBeenCalledWith('tecnico:5');
    });

    it('emite TECNICO_ONLINE cuando markOnline devuelve true', () => {
      mockMarkOnline.mockReturnValue(true);
      const { socket } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 5 });
      const nsp = makeNsp(socket);
      registerSolicitudHandlers(nsp);
      expect(nsp.emit).toHaveBeenCalledWith(SERVER_EVENTS.TECNICO_ONLINE, { id_tecnico: 5 });
    });

    it('NO emite TECNICO_ONLINE cuando markOnline devuelve false', () => {
      mockMarkOnline.mockReturnValue(false);
      const { socket } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 5 });
      const nsp = makeNsp(socket);
      registerSolicitudHandlers(nsp);
      expect(nsp.emit).not.toHaveBeenCalled();
    });

    it('NO llama a markOnline si perfil es null', () => {
      const { socket } = makeSocket({ rol: 'TECNICO' }, null);
      registerSolicitudHandlers(makeNsp(socket));
      expect(mockMarkOnline).not.toHaveBeenCalled();
    });
  });

  // ── JOIN_SOLICITUD_ROOM ───────────────────────────────────────────────────

  describe(`evento ${CLIENT_EVENTS.JOIN_SOLICITUD_ROOM}`, () => {
    it('join room solicitud:{id} con id válido', () => {
      const { socket, handlers } = makeSocket();
      registerSolicitudHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.JOIN_SOLICITUD_ROOM]({ id_solicitud: 15 });

      expect(socket.join).toHaveBeenCalledWith('solicitud:15');
    });

    it('emite server:error si id_solicitud falta', () => {
      const { socket, handlers } = makeSocket();
      registerSolicitudHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.JOIN_SOLICITUD_ROOM]({});

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, { message: 'id_solicitud requerido' });
    });
  });

  // ── LEAVE_SOLICITUD_ROOM ─────────────────────────────────────────────────

  describe(`evento ${CLIENT_EVENTS.LEAVE_SOLICITUD_ROOM}`, () => {
    it('leave room solicitud:{id} con id válido', () => {
      const { socket, handlers } = makeSocket();
      registerSolicitudHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.LEAVE_SOLICITUD_ROOM]({ id_solicitud: 15 });

      expect(socket.leave).toHaveBeenCalledWith('solicitud:15');
    });

    it('NO hace nada si id_solicitud falta', () => {
      const { socket, handlers } = makeSocket();
      registerSolicitudHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.LEAVE_SOLICITUD_ROOM]({});

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  describe('evento disconnect', () => {
    it('TECNICO: emite TECNICO_OFFLINE cuando markOffline devuelve true', () => {
      mockMarkOffline.mockReturnValue(true);
      const { socket, handlers } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 5 });
      const nsp = makeNsp(socket);
      registerSolicitudHandlers(nsp);

      handlers['disconnect']();

      expect(mockMarkOffline).toHaveBeenCalledWith(5, 'socket-sol-1');
      expect(nsp.emit).toHaveBeenCalledWith(SERVER_EVENTS.TECNICO_OFFLINE, { id_tecnico: 5 });
    });

    it('TECNICO: NO emite TECNICO_OFFLINE cuando markOffline devuelve false', () => {
      mockMarkOffline.mockReturnValue(false);
      const { socket, handlers } = makeSocket({ rol: 'TECNICO' }, { id_tecnico: 5 });
      const nsp = makeNsp(socket);
      registerSolicitudHandlers(nsp);

      handlers['disconnect']();

      expect(nsp.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.TECNICO_OFFLINE, expect.anything());
    });

    it('CLIENTE: NO llama a markOffline', () => {
      const { socket, handlers } = makeSocket({ rol: 'CLIENTE' }, null);
      registerSolicitudHandlers(makeNsp(socket));

      handlers['disconnect']();

      expect(mockMarkOffline).not.toHaveBeenCalled();
    });

    it('TECNICO sin perfil: NO llama a markOffline', () => {
      const { socket, handlers } = makeSocket({ rol: 'TECNICO' }, null);
      registerSolicitudHandlers(makeNsp(socket));

      handlers['disconnect']();

      expect(mockMarkOffline).not.toHaveBeenCalled();
    });
  });
});
