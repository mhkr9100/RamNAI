/**
 * Structured logger for main process. No PII in logs by default.
 * Outputs JSON lines: { timestamp, level, message, ...context }
 */
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const minLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) ?? 'info';
const minIndex = LOG_LEVELS.indexOf(minLevel);

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= minIndex;
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    if (shouldLog('debug')) {
      console.debug(formatEntry('debug', message, context));
    }
  },
  info(message: string, context?: Record<string, unknown>) {
    if (shouldLog('info')) {
      console.info(formatEntry('info', message, context));
    }
  },
  warn(message: string, context?: Record<string, unknown>) {
    if (shouldLog('warn')) {
      console.warn(formatEntry('warn', message, context));
    }
  },
  error(message: string, context?: Record<string, unknown>) {
    if (shouldLog('error')) {
      console.error(formatEntry('error', message, context));
    }
  }
};
