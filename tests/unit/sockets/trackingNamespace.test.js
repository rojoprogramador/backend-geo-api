import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockLogger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

const mockTrackingUbicacionCreate = jest.fn().mockResolvedValue({});
const mockCitaFindOne             = jest.fn();
const mockSequelizeQuery          = jest.fn();

const mockModels = {
  sequelize:         { query: mockSequelizeQuery },
  TrackingUbicacion: { create: mockTrackingUbicacionCreate },
  Cita:              { findOne: mockCitaFindOne },
};

jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../../../models/index.js', () => mockModels);

const { CLIENT_EVENTS, SERVER_EVENTS } = await import('../../../sockets/constants/events.js');
const { registerTrackingHandlers } = await import('../../../sockets/namespaces/trackingNamespace.js');

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Cada test que envía una ubicación DEBE usar un id_tecnico único para
 * evitar que el throttle de módulo interfiera entre tests.
 */
let tecnicoIdCounter = 1000;
function nextTecnicoId() { return tecnicoIdCounter++; }

function makeSocket(id_tecnico, usuarioOverrides = {}) {
  const handlers = {};
  const toEmit   = jest.fn();
  const socket   = {
    id: `socket-trk-${id_tecnico}`,
    usuario: { id_usuario: 10, rol: 'TECNICO', ...usuarioOverrides },
    perfil:  { id_tecnico },
    join:    jest.fn(),
    leave:   jest.fn(),
    emit:    jest.fn(),
    to:      jest.fn().mockReturnValue({ emit: toEmit }),
    on:      jest.fn((event, cb) => { handlers[event] = cb; }),
    _toEmit: toEmit,
  };
  return { socket, handlers };
}

function makeNsp(socket) {
  return {
    on:   jest.fn((event, cb) => { if (event === 'connection') cb(socket); }),
    emit: jest.fn(),
  };
}

const BASE_LOCATION = {
  id_solicitud:  15,
  latitud:       3.45,
  longitud:      -76.53,
  velocidad_kmh: 30,
  en_movimiento: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('trackingNamespace — registerTrackingHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCitaFindOne.mockResolvedValue({ id_cita: 5 });
    mockSequelizeQuery.mockResolvedValue([{ distancia: '800' }]);
    mockTrackingUbicacionCreate.mockResolvedValue({});
  });

  // ── connection ────────────────────────────────────────────────────────────

  describe('connection', () => {
    it('auto-join user room', () => {
      const { socket } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));
      expect(socket.join).toHaveBeenCalledWith('user:10');
    });
  });

  // ── JOIN_TRACKING_ROOM ────────────────────────────────────────────────────

  describe(`evento ${CLIENT_EVENTS.JOIN_TRACKING_ROOM}`, () => {
    it('join tracking:{id} con id válido', () => {
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.JOIN_TRACKING_ROOM]({ id_solicitud: 15 });

      expect(socket.join).toHaveBeenCalledWith('tracking:15');
    });

    it('emite server:error si id_solicitud falta', () => {
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.JOIN_TRACKING_ROOM]({});

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, { message: 'id_solicitud requerido' });
    });
  });

  // ── LEAVE_TRACKING_ROOM ───────────────────────────────────────────────────

  describe(`evento ${CLIENT_EVENTS.LEAVE_TRACKING_ROOM}`, () => {
    it('leave tracking:{id} con id válido', () => {
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.LEAVE_TRACKING_ROOM]({ id_solicitud: 15 });

      expect(socket.leave).toHaveBeenCalledWith('tracking:15');
    });

    it('NO hace nada si id_solicitud falta', () => {
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      handlers[CLIENT_EVENTS.LEAVE_TRACKING_ROOM]({});

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  // ── TECNICO_SEND_LOCATION ─────────────────────────────────────────────────

  describe(`evento ${CLIENT_EVENTS.TECNICO_SEND_LOCATION}`, () => {
    it('emite server:error si rol no es TECNICO', async () => {
      const { socket, handlers } = makeSocket(nextTecnicoId(), { rol: 'CLIENTE' });
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, {
        message: 'Solo técnicos pueden enviar ubicación',
      });
    });

    it('retorna sin hacer nada si id_tecnico no está en perfil', async () => {
      const handlers = {};
      const socket = {
        id: 'socket-no-perfil',
        usuario: { id_usuario: 10, rol: 'TECNICO' },
        perfil:  null,  // sin perfil
        join:    jest.fn(),
        leave:   jest.fn(),
        emit:    jest.fn(),
        to:      jest.fn().mockReturnValue({ emit: jest.fn() }),
        on:      jest.fn((event, cb) => { handlers[event] = cb; }),
      };
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(mockCitaFindOne).not.toHaveBeenCalled();
    });

    it('emite server:error con latitud fuera de rango', async () => {
      const id_tecnico = nextTecnicoId();
      const { socket, handlers } = makeSocket(id_tecnico);
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION]({ ...BASE_LOCATION, latitud: 200 });

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, { message: 'Coordenadas inválidas' });
    });

    it('emite server:error con coordenadas NaN', async () => {
      const id_tecnico = nextTecnicoId();
      const { socket, handlers } = makeSocket(id_tecnico);
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION]({
        ...BASE_LOCATION, latitud: 'abc', longitud: 'xyz',
      });

      expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ERROR, { message: 'Coordenadas inválidas' });
    });

    it('procesa ubicación correctamente y relay al cliente → TECNICO_UBICACION', async () => {
      mockSequelizeQuery.mockResolvedValue([{ distancia: '800' }]);
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(socket.to).toHaveBeenCalledWith('tracking:15');
      expect(socket._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.TECNICO_UBICACION,
        expect.objectContaining({ id_solicitud: 15, latitud: 3.45, longitud: -76.53 })
      );
    });

    it('guarda TrackingUbicacion en BD (fire-and-forget)', async () => {
      const id_tecnico = nextTecnicoId();
      const { socket, handlers } = makeSocket(id_tecnico);
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(mockTrackingUbicacionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ id_tecnico, id_solicitud: 15 })
      );
    });

    it('usa id_cita null si Cita.findOne devuelve null', async () => {
      mockCitaFindOne.mockResolvedValue(null);
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(mockTrackingUbicacionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ id_cita: null })
      );
    });

    it('emite TECNICO_CERCA cuando distancia ≤ 500m y > 50m', async () => {
      mockSequelizeQuery.mockResolvedValue([{ distancia: '300' }]);
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(socket._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.TECNICO_CERCA,
        expect.objectContaining({ id_solicitud: 15, distancia_metros: 300 })
      );
    });

    it('emite TECNICO_LLEGO cuando distancia ≤ 50m y velocidad < 5 km/h', async () => {
      mockSequelizeQuery.mockResolvedValue([{ distancia: '20' }]);
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION]({ ...BASE_LOCATION, velocidad_kmh: 2 });

      expect(socket._toEmit).toHaveBeenCalledWith(
        SERVER_EVENTS.TECNICO_LLEGO,
        expect.objectContaining({ id_solicitud: 15 })
      );
    });

    it('continúa con relay cuando la query PostGIS falla (distancia null)', async () => {
      mockSequelizeQuery.mockRejectedValue(new Error('DB error'));
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      // Debe emitir ubicación aunque no haya distancia
      expect(socket._toEmit).toHaveBeenCalledWith(SERVER_EVENTS.TECNICO_UBICACION, expect.any(Object));
      // NO emite alertas de proximidad
      expect(socket._toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.TECNICO_CERCA, expect.anything());
      expect(socket._toEmit).not.toHaveBeenCalledWith(SERVER_EVENTS.TECNICO_LLEGO, expect.anything());
    });

    it('throttle: segunda ubicación inmediata para el mismo técnico es ignorada', async () => {
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      // Primera llamada → se procesa
      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);
      const firstCallCount = mockCitaFindOne.mock.calls.length;

      // Segunda inmediata → throttled
      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);

      expect(mockCitaFindOne.mock.calls.length).toBe(firstCallCount); // no hubo llamada extra
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  describe('evento disconnect', () => {
    it('loguea desconexión', () => {
      const { socket, handlers } = makeSocket(nextTecnicoId());
      registerTrackingHandlers(makeNsp(socket));

      handlers['disconnect']();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Desconectado'));
    });

    it('TECNICO: limpia throttle en disconnect para que siguiente ubicación se procese', async () => {
      const id_tecnico = nextTecnicoId();
      const { socket, handlers } = makeSocket(id_tecnico);
      registerTrackingHandlers(makeNsp(socket));

      // Primera ubicación → crea entrada throttle
      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);
      const callsAfterFirst = mockCitaFindOne.mock.calls.length;

      // Disconnect → borra entrada throttle
      handlers['disconnect']();

      // Ahora puede enviar de nuevo
      await handlers[CLIENT_EVENTS.TECNICO_SEND_LOCATION](BASE_LOCATION);
      expect(mockCitaFindOne.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('socket sin perfil: no lanza error en disconnect', () => {
      const handlers = {};
      const socket = {
        id: 'socket-no-perfil-dc',
        usuario: { id_usuario: 99, rol: 'CLIENTE' },
        perfil:  null,
        join:    jest.fn(),
        leave:   jest.fn(),
        emit:    jest.fn(),
        to:      jest.fn().mockReturnValue({ emit: jest.fn() }),
        on:      jest.fn((event, cb) => { handlers[event] = cb; }),
      };
      registerTrackingHandlers(makeNsp(socket));
      expect(() => handlers['disconnect']()).not.toThrow();
    });
  });
});
