import type { RedactionConfig } from '@ui-atlas/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const DEFAULT_REDACTION: RedactionConfig = {
  headers: ['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-api-key'],
  fields: ['password', 'token', 'secret', 'apiKey', 'accessToken', 'refreshToken'],
};

/**
 * Redact configured fields and common auth headers before anything is printed.
 * Applied recursively and depth-bounded so a cyclic or huge object cannot hang
 * the logger.
 */
export function redact(value: unknown, config: RedactionConfig = DEFAULT_REDACTION, depth = 0): unknown {
  if (depth > 6) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, config, depth + 1));
  if (value === null || typeof value !== 'object') return value;

  const sensitive = new Set(
    [...config.headers, ...config.fields].map((name) => name.toLowerCase()),
  );
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = sensitive.has(key.toLowerCase()) ? '[redacted]' : redact(item, config, depth + 1);
  }
  return out;
}

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  redaction?: RedactionConfig;
  write?: (line: string) => void;
}

export function createLogger(options: ConsoleLoggerOptions = {}): Logger {
  const minimum = LEVEL_ORDER[options.level ?? 'info'];
  const redaction = options.redaction ?? DEFAULT_REDACTION;
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));

  const emit = (level: LogLevel, message: string, detail?: unknown): void => {
    if (LEVEL_ORDER[level] < minimum) return;
    const prefix = { debug: '  ·', info: '  ', warn: ' !', error: ' ✖' }[level];
    if (detail === undefined) {
      write(`${prefix} ${message}`);
      return;
    }
    write(`${prefix} ${message} ${JSON.stringify(redact(detail, redaction))}`);
  };

  return {
    debug: (message, detail) => emit('debug', message, detail),
    info: (message, detail) => emit('info', message, detail),
    warn: (message, detail) => emit('warn', message, detail),
    error: (message, detail) => emit('error', message, detail),
  };
}
