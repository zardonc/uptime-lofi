/**
 * Development-only logger utility
 * In production, all logging is suppressed to avoid console output.
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error';

function createLoggerMethod(level: LogLevel) {
  return (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console[level](`[${level.toUpperCase()}]`, ...args);
    }
  };
}

export const logger = {
  log: createLoggerMethod('log'),
  info: createLoggerMethod('info'),
  warn: createLoggerMethod('warn'),
  error: createLoggerMethod('error'),
} as const;
