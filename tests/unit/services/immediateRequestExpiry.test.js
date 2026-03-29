import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mock setup BEFORE imports ---
const mockModels = {
  sequelize: {
    transaction: jest.fn(),
  },
  Solicitud: {
    findAll: jest.fn(),
    update: jest.fn(),
  },
  TecnicoSolicitudQueue: {
    update: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const mockOp = {
  in: Symbol('in'),
  lte: Symbol('lte'),
};

jest.unstable_mockModule('../../../models/index.js', () => mockModels);
jest.unstable_mockModule('../../../utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('sequelize', () => ({ Op: mockOp }));

const {
  getInmediataCutoffDate,
  startInmediataExpirySweeper,
  __resetInmediataExpirySweeperForTests,
} = await import('../../../services/immediateRequestExpiryService.js');

describe('immediateRequestExpiryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetInmediataExpirySweeperForTests();
    process.env.INMEDIATA_TTL_MIN = '20';
    process.env.INMEDIATA_EXPIRY_SWEEP_SEC = '60';
  });

  afterEach(() => {
    __resetInmediataExpirySweeperForTests();
    jest.useRealTimers();
    jest.clearAllTimers();
    delete process.env.INMEDIATA_TTL_MIN;
    delete process.env.INMEDIATA_EXPIRY_SWEEP_SEC;
  });

  describe('getInmediataCutoffDate', () => {
    it('should return a date 20 minutes in the past (default TTL)', () => {
      const now = new Date();
      jest.setSystemTime(now);

      const cutoff = getInmediataCutoffDate();
      const expectedCutoff = new Date(now.getTime() - 20 * 60 * 1000);

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });

    it('should return a date based on INMEDIATA_TTL_MIN env var', () => {
      process.env.INMEDIATA_TTL_MIN = '10';
      const now = new Date();
      jest.setSystemTime(now);

      const cutoff = getInmediataCutoffDate();
      const expectedCutoff = new Date(now.getTime() - 10 * 60 * 1000);

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });

    it('should use default TTL (20 min) if env var is invalid', () => {
      process.env.INMEDIATA_TTL_MIN = 'invalid';
      const now = new Date();
      jest.setSystemTime(now);

      const cutoff = getInmediataCutoffDate();
      const expectedCutoff = new Date(now.getTime() - 20 * 60 * 1000);

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });

    it('should use default TTL (20 min) if env var is negative', () => {
      process.env.INMEDIATA_TTL_MIN = '-5';
      const now = new Date();
      jest.setSystemTime(now);

      const cutoff = getInmediataCutoffDate();
      const expectedCutoff = new Date(now.getTime() - 20 * 60 * 1000);

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });
  });

  describe('startInmediataExpirySweeper', () => {
    it('should call startInmediataExpirySweeper without error', () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([]);

      expect(() => startInmediataExpirySweeper()).not.toThrow();
    });

    it('should not create multiple timers if called twice', () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([]);

      startInmediataExpirySweeper();
      startInmediataExpirySweeper();

      jest.advanceTimersByTime(60000);

      expect(mockModels.Solicitud.findAll).toHaveBeenCalledTimes(1);
    });

    it('should execute sweep after interval time', async () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([]);

      startInmediataExpirySweeper();

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockModels.Solicitud.findAll).toHaveBeenCalled();
    });

    it('should use INMEDIATA_EXPIRY_SWEEP_SEC env var for interval', async () => {
      process.env.INMEDIATA_EXPIRY_SWEEP_SEC = '30';

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([]);

      startInmediataExpirySweeper();

      await jest.advanceTimersByTimeAsync(30000);

      expect(mockModels.Solicitud.findAll).toHaveBeenCalled();
    });
  });

  describe('sweep expired requests (integration)', () => {
    it('should handle successful sweep with expired solicitudes', async () => {
      const expiredSolicitud = {
        id_solicitud: 1,
      };

      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };

      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([expiredSolicitud]);
      mockModels.TecnicoSolicitudQueue.update.mockResolvedValue([1]);
      mockModels.Solicitud.update.mockResolvedValue([1]);

      startInmediataExpirySweeper();
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockModels.Solicitud.findAll).toHaveBeenCalled();
      expect(mockModels.TecnicoSolicitudQueue.update).toHaveBeenCalled();
      expect(mockModels.Solicitud.update).toHaveBeenCalled();
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should handle transaction rollback on error', async () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };

      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([{ id_solicitud: 1 }]);
      mockModels.TecnicoSolicitudQueue.update.mockRejectedValue(new Error('DB Error'));

      startInmediataExpirySweeper();
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip sweep if no expired solicitudes found', async () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };

      mockModels.sequelize.transaction.mockResolvedValue(mockTransaction);
      mockModels.Solicitud.findAll.mockResolvedValue([]);

      startInmediataExpirySweeper();
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockModels.Solicitud.findAll).toHaveBeenCalled();
      expect(mockModels.TecnicoSolicitudQueue.update).not.toHaveBeenCalled();
      expect(mockTransaction.commit).not.toHaveBeenCalled();
    });
  });
});
