import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

// Mock de namespace (retornado por io.of())
function makeNspMock() {
  return { use: jest.fn(), on: jest.fn() };
}

const solicitudesNsp  = makeNspMock();
const cotizacionesNsp = makeNspMock();
const serviciosNsp    = makeNspMock();
const trackingNsp     = makeNspMock();

const mockIo = {
  of: jest.fn((path) => {
    if (path === '/solicitudes')  return solicitudesNsp;
    if (path === '/cotizaciones') return cotizacionesNsp;
    if (path === '/servicios')    return serviciosNsp;
    if (path === '/tracking')     return trackingNsp;
  }),
};

const MockServer = jest.fn().mockImplementation(() => mockIo);

const mockSetIO                     = jest.fn();
const mockAuthenticateSocket        = jest.fn();
const mockRegisterSolicitudHandlers    = jest.fn();
const mockRegisterCotizacionHandlers   = jest.fn();
const mockRegisterServicioHandlers     = jest.fn();
const mockRegisterTrackingHandlers     = jest.fn();

jest.unstable_mockModule('socket.io', () => ({ Server: MockServer }));
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../../../sockets/auth/socketAuth.js', () => ({ authenticateSocket: mockAuthenticateSocket }));
jest.unstable_mockModule('../../../sockets/services/socketEmitter.js', () => ({ setIO: mockSetIO }));
jest.unstable_mockModule('../../../sockets/namespaces/solicitudNamespace.js',  () => ({ registerSolicitudHandlers:  mockRegisterSolicitudHandlers }));
jest.unstable_mockModule('../../../sockets/namespaces/cotizacionNamespace.js', () => ({ registerCotizacionHandlers: mockRegisterCotizacionHandlers }));
jest.unstable_mockModule('../../../sockets/namespaces/servicioNamespace.js',   () => ({ registerServicioHandlers:   mockRegisterServicioHandlers }));
jest.unstable_mockModule('../../../sockets/namespaces/trackingNamespace.js',   () => ({ registerTrackingHandlers:   mockRegisterTrackingHandlers }));

const { initializeSocket } = await import('../../../sockets/index.js');

// ── Tests ─────────────────────────────────────────────────────────────────

describe('sockets/index.js — initializeSocket', () => {
  const mockHttpServer = {};
  const corsOptions = { origin: ['http://localhost:3000'], credentials: true };

  beforeEach(() => {
    jest.clearAllMocks();
    // Restaurar mockIo.of
    mockIo.of.mockImplementation((path) => {
      if (path === '/solicitudes')  return solicitudesNsp;
      if (path === '/cotizaciones') return cotizacionesNsp;
      if (path === '/servicios')    return serviciosNsp;
      if (path === '/tracking')     return trackingNsp;
    });
  });

  it('crea una instancia de Server con las opciones CORS', () => {
    initializeSocket(mockHttpServer, corsOptions);
    expect(MockServer).toHaveBeenCalledWith(
      mockHttpServer,
      expect.objectContaining({
        cors: expect.objectContaining({ origin: corsOptions.origin }),
      })
    );
  });

  it('registra el singleton io con setIO', () => {
    initializeSocket(mockHttpServer, corsOptions);
    expect(mockSetIO).toHaveBeenCalledWith(mockIo);
  });

  it('crea 4 namespaces: /solicitudes, /cotizaciones, /servicios, /tracking', () => {
    initializeSocket(mockHttpServer, corsOptions);
    expect(mockIo.of).toHaveBeenCalledWith('/solicitudes');
    expect(mockIo.of).toHaveBeenCalledWith('/cotizaciones');
    expect(mockIo.of).toHaveBeenCalledWith('/servicios');
    expect(mockIo.of).toHaveBeenCalledWith('/tracking');
  });

  it('aplica authenticateSocket como middleware en todos los namespaces', () => {
    initializeSocket(mockHttpServer, corsOptions);
    expect(solicitudesNsp.use).toHaveBeenCalledWith(mockAuthenticateSocket);
    expect(cotizacionesNsp.use).toHaveBeenCalledWith(mockAuthenticateSocket);
    expect(serviciosNsp.use).toHaveBeenCalledWith(mockAuthenticateSocket);
    expect(trackingNsp.use).toHaveBeenCalledWith(mockAuthenticateSocket);
  });

  it('registra los handlers de cada namespace', () => {
    initializeSocket(mockHttpServer, corsOptions);
    expect(mockRegisterSolicitudHandlers).toHaveBeenCalledWith(solicitudesNsp);
    expect(mockRegisterCotizacionHandlers).toHaveBeenCalledWith(cotizacionesNsp);
    expect(mockRegisterServicioHandlers).toHaveBeenCalledWith(serviciosNsp);
    expect(mockRegisterTrackingHandlers).toHaveBeenCalledWith(trackingNsp);
  });

  it('retorna la instancia de io', () => {
    const result = initializeSocket(mockHttpServer, corsOptions);
    expect(result).toBe(mockIo);
  });

  it('usa credentials:true por defecto si corsOptions.credentials no está definido', () => {
    initializeSocket(mockHttpServer, { origin: ['http://localhost:3000'] });
    expect(MockServer).toHaveBeenCalledWith(
      mockHttpServer,
      expect.objectContaining({
        cors: expect.objectContaining({ credentials: true }),
      })
    );
  });
});
