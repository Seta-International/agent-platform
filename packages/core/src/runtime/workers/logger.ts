import { type LogFunctionFactory, Logger } from 'graphile-worker';

export interface WorkerLogger {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
  debug?: (obj: unknown, msg?: string) => void;
}

// graphile-worker defaults to a plain-text console logger (no timestamp, not
// NDJSON — FUT-651); route it through the app's structured logger instead.
export function graphileWorkerLogger(log: WorkerLogger): Logger {
  const factory: LogFunctionFactory = (scope) => (level, message, meta) => {
    const fields = meta === undefined ? { ...scope } : { ...scope, meta };
    // LogLevel is a string enum ('error' | 'warning' | 'info' | 'debug'), but
    // the enum object is not reachable at runtime through graphile-worker's
    // re-export — compare the string values.
    switch (level as string) {
      case 'error':
        log.error(fields, message);
        break;
      case 'warning':
        log.warn(fields, message);
        break;
      case 'debug':
        log.debug?.(fields, message);
        break;
      default:
        log.info?.(fields, message);
    }
  };
  return new Logger(factory);
}
