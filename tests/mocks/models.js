/**
 * Mock factory para modelos Sequelize.
 * Genera mocks de todos los modelos y la instancia sequelize
 * para usar con jest.unstable_mockModule en tests ESM.
 */
import { jest } from '@jest/globals';

/**
 * Crea un mock de modelo Sequelize con todos los métodos comunes.
 * @param {string} name - Nombre del modelo (para debugging)
 * @returns {Object} Mock del modelo
 */
export function createModelMock(name = 'Model') {
  return {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
    increment: jest.fn(),
    bulkCreate: jest.fn(),
    _name: name,
  };
}

/**
 * Crea un mock de instancia de modelo (el objeto retornado por findOne/create).
 * @param {Object} data - Datos del registro
 * @returns {Object} Mock de instancia
 */
export function createInstanceMock(data = {}) {
  return {
    ...data,
    save: jest.fn().mockResolvedValue(data),
    update: jest.fn().mockResolvedValue(data),
    destroy: jest.fn().mockResolvedValue(1),
    reload: jest.fn().mockResolvedValue(data),
    toJSON: jest.fn().mockReturnValue(data),
    get: jest.fn((key) => data[key]),
  };
}

/**
 * Crea un mock de transacción Sequelize.
 * @returns {Object} Mock de transacción
 */
export function createTransactionMock() {
  return {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    finished: undefined,
  };
}

/**
 * Genera todos los mocks de modelos del proyecto.
 * @returns {Object} Objeto con todos los modelos mockeados + sequelize
 */
export function createAllModelMocks() {
  const transaction = createTransactionMock();

  return {
    sequelize: {
      transaction: jest.fn().mockResolvedValue(transaction),
      query: jest.fn(),
      literal: jest.fn((val) => val),
      fn: jest.fn((fnName, ...args) => `${fnName}(${args.join(',')})`),
      col: jest.fn((colName) => colName),
      where: jest.fn(),
    },
    _transaction: transaction,
    Rol: createModelMock('Rol'),
    TipoDoc: createModelMock('TipoDoc'),
    Usuario: createModelMock('Usuario'),
    Cliente: createModelMock('Cliente'),
    Tecnico: createModelMock('Tecnico'),
    Categoria: createModelMock('Categoria'),
    Subcategoria: createModelMock('Subcategoria'),
    Solicitud: createModelMock('Solicitud'),
    Cotizacion: createModelMock('Cotizacion'),
    Cita: createModelMock('Cita'),
    Servicio: createModelMock('Servicio'),
    Calificacion: createModelMock('Calificacion'),
    Transaccion: createModelMock('Transaccion'),
    Garantia: createModelMock('Garantia'),
    Notificacion: createModelMock('Notificacion'),
    TecnicoSolicitudQueue: createModelMock('TecnicoSolicitudQueue'),
    TrackingUbicacion: createModelMock('TrackingUbicacion'),
    CuentaTecnico: createModelMock('CuentaTecnico'),
    Ciudad: createModelMock('Ciudad'),
    Pais: createModelMock('Pais'),
    MedioPago: createModelMock('MedioPago'),
    MotivoCancelacion: createModelMock('MotivoCancelacion'),
    EstadoSolicitud: createModelMock('EstadoSolicitud'),
    Especialidad: createModelMock('Especialidad'),
    CertificadoTecnico: createModelMock('CertificadoTecnico'),
    CiudadTecnico: createModelMock('CiudadTecnico'),
  };
}

/**
 * Crea un mock de req Express.
 * @param {Object} overrides - Propiedades a sobreescribir
 * @returns {Object} Mock de req
 */
export function createReqMock(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    usuario: null,
    ...overrides,
  };
}

/**
 * Crea un mock de res Express con encadenamiento.
 * @returns {Object} Mock de res
 */
export function createResMock() {
  const res = {
    statusCode: null,
    jsonData: null,
  };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data) => {
    res.jsonData = data;
    return res;
  });
  return res;
}

/**
 * Resetea todos los mocks de un objeto de modelos.
 * @param {Object} mocks - Objeto retornado por createAllModelMocks()
 */
export function resetAllMocks(mocks) {
  for (const [key, value] of Object.entries(mocks)) {
    if (key === '_transaction') {
      value.commit.mockClear();
      value.rollback.mockClear();
      continue;
    }
    if (value && typeof value === 'object') {
      for (const fn of Object.values(value)) {
        if (typeof fn === 'function' && fn.mockClear) {
          fn.mockClear();
        }
      }
    }
  }
}
