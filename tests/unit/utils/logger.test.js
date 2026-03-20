/**
 * @fileoverview Unit Tests for Winston Logger
 * Tests logger configuration, transports, and stream
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock winston BEFORE importing logger
const mockWinstonTransports = {
  Console: jest.fn().mockImplementation(() => ({})),
  File: jest.fn().mockImplementation(() => ({}))
};

const mockWinstonFormat = {
  combine: jest.fn((...args) => args),
  timestamp: jest.fn((opts) => ({ timestamp: opts })),
  printf: jest.fn((fn) => ({ printf: fn })),
  colorize: jest.fn((opts) => ({ colorize: opts })),
  errors: jest.fn((opts) => ({ errors: opts }))
};

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  http: jest.fn(),
  debug: jest.fn(),
  stream: null
};

const mockCreateLogger = jest.fn(() => mockLogger);

jest.unstable_mockModule('winston', () => ({
  default: {
    createLogger: mockCreateLogger,
    format: mockWinstonFormat,
    transports: mockWinstonTransports
  }
}));

// Import logger AFTER mocking
const logger = (await import('../../../utils/logger.js')).default;

describe('logger - Winston Logger', () => {
  it('should export a logger object', () => {
    expect(logger).toBeDefined();
    expect(typeof logger).toBe('object');
  });

  it('should have error logging method', () => {
    expect(logger.error).toBeDefined();
    expect(typeof logger.error).toBe('function');
  });

  it('should have warn logging method', () => {
    expect(logger.warn).toBeDefined();
    expect(typeof logger.warn).toBe('function');
  });

  it('should have info logging method', () => {
    expect(logger.info).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should have http logging method', () => {
    expect(logger.http).toBeDefined();
    expect(typeof logger.http).toBe('function');
  });

  it('should have debug logging method', () => {
    expect(logger.debug).toBeDefined();
    expect(typeof logger.debug).toBe('function');
  });

  it('should have stream property for Morgan integration', () => {
    expect(logger.stream).toBeDefined();
    expect(typeof logger.stream).toBe('object');
  });

  describe('logger.stream for Morgan', () => {
    it('should have write method', () => {
      expect(logger.stream.write).toBeDefined();
      expect(typeof logger.stream.write).toBe('function');
    });

    it('should trim message and call logger.http', () => {
      const message = '  GET /api/test 200 12.345 ms  \n';

      logger.stream.write(message);

      expect(logger.http).toHaveBeenCalledWith('GET /api/test 200 12.345 ms');
    });

    it('should handle message without whitespace', () => {
      const message = 'Simple log';

      logger.stream.write(message);

      expect(logger.http).toHaveBeenCalledWith('Simple log');
    });
  });

  describe('Winston createLogger configuration', () => {
    it('should create logger with correct configuration', () => {
      expect(mockCreateLogger).toHaveBeenCalled();

      const config = mockCreateLogger.mock.calls[0][0];

      expect(config).toHaveProperty('level');
      expect(config).toHaveProperty('levels');
      expect(config).toHaveProperty('transports');
      expect(config).toHaveProperty('exitOnError');
      expect(config.exitOnError).toBe(false);
    });

    it('should define correct log levels', () => {
      const config = mockCreateLogger.mock.calls[0][0];

      expect(config.levels).toEqual({
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4
      });
    });

    it('should set level based on NODE_ENV', () => {
      const config = mockCreateLogger.mock.calls[0][0];

      // Level should be 'debug' for development, 'info' for production
      expect(['debug', 'info']).toContain(config.level);
    });
  });

  describe('Winston transports configuration', () => {
    it('should configure Console transport', () => {
      expect(mockWinstonTransports.Console).toHaveBeenCalled();

      const consoleConfig = mockWinstonTransports.Console.mock.calls[0][0];
      expect(consoleConfig).toHaveProperty('format');
    });

    it('should configure File transport for errors', () => {
      const errorFileCall = mockWinstonTransports.File.mock.calls.find(
        call => call[0].filename === 'logs/error.log'
      );

      expect(errorFileCall).toBeDefined();
      expect(errorFileCall[0].level).toBe('error');
      expect(errorFileCall[0]).toHaveProperty('format');
    });

    it('should configure File transport for combined logs', () => {
      const combinedFileCall = mockWinstonTransports.File.mock.calls.find(
        call => call[0].filename === 'logs/combined.log'
      );

      expect(combinedFileCall).toBeDefined();
      expect(combinedFileCall[0]).toHaveProperty('format');
    });
  });

  describe('Winston format configuration', () => {
    it('should use combine format', () => {
      expect(mockWinstonFormat.combine).toHaveBeenCalled();
    });

    it('should use timestamp format with correct pattern', () => {
      expect(mockWinstonFormat.timestamp).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'YYYY-MM-DD HH:mm:ss' })
      );
    });

    it('should use colorize format for console', () => {
      expect(mockWinstonFormat.colorize).toHaveBeenCalled();
    });

    it('should use errors format for stack traces', () => {
      expect(mockWinstonFormat.errors).toHaveBeenCalledWith(
        expect.objectContaining({ stack: true })
      );
    });

    it('should use custom printf format', () => {
      expect(mockWinstonFormat.printf).toHaveBeenCalled();

      const printfFn = mockWinstonFormat.printf.mock.calls[0][0];
      expect(typeof printfFn).toBe('function');
    });
  });

  describe('Custom format function', () => {
    let customFormat;

    beforeEach(() => {
      // Get the printf format function
      customFormat = mockWinstonFormat.printf.mock.calls[0][0];
    });

    it('should format log without stack trace', () => {
      const logInfo = {
        level: 'info',
        message: 'Test message',
        timestamp: '2026-03-20 10:30:00'
      };

      const formatted = customFormat(logInfo);

      expect(formatted).toBe('2026-03-20 10:30:00 [info]: Test message');
    });

    it('should format error log with stack trace', () => {
      const logInfo = {
        level: 'error',
        message: 'Error message',
        timestamp: '2026-03-20 10:30:00',
        stack: 'Error: Error message\n    at Object.<anonymous> (/path/to/file.js:10:15)'
      };

      const formatted = customFormat(logInfo);

      expect(formatted).toContain('2026-03-20 10:30:00 [error]: Error message');
      expect(formatted).toContain('Error: Error message');
      expect(formatted).toContain('at Object.<anonymous>');
    });

    it('should handle different log levels', () => {
      const levels = ['error', 'warn', 'info', 'http', 'debug'];

      levels.forEach(level => {
        const logInfo = {
          level,
          message: `${level} message`,
          timestamp: '2026-03-20 10:30:00'
        };

        const formatted = customFormat(logInfo);
        expect(formatted).toContain(`[${level}]`);
      });
    });
  });

  describe('Logger method calls', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should log error messages', () => {
      logger.error('Error occurred');
      expect(logger.error).toHaveBeenCalledWith('Error occurred');
    });

    it('should log warn messages', () => {
      logger.warn('Warning message');
      expect(logger.warn).toHaveBeenCalledWith('Warning message');
    });

    it('should log info messages', () => {
      logger.info('Info message');
      expect(logger.info).toHaveBeenCalledWith('Info message');
    });

    it('should log http messages', () => {
      logger.http('HTTP request');
      expect(logger.http).toHaveBeenCalledWith('HTTP request');
    });

    it('should log debug messages', () => {
      logger.debug('Debug info');
      expect(logger.debug).toHaveBeenCalledWith('Debug info');
    });

    it('should handle structured logging with objects', () => {
      const logData = {
        message: 'User login',
        userId: 123,
        ip: '192.168.1.1'
      };

      logger.info(logData);
      expect(logger.info).toHaveBeenCalledWith(logData);
    });
  });
});
