/* eslint-disable @typescript-eslint/no-unused-vars */
// Production-safe logging utilities

// Helper to compute the current URL in a way that can be injected for tests.
// Accepts an optional `win` object for overriding global window (useful in
// unit tests where the JSDOM `window` is always present).
export function getWindowUrl(win?: { location?: { href?: string } } | Window): string | undefined {
  const resolved =
    win === undefined
      ? typeof window !== 'undefined'
        ? window
        : undefined
      : win;
  return resolved && resolved.location ? resolved.location.href : undefined;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

/** CSS styles applied to each log level prefix in browser devtools. */
const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #9ca3af; font-weight: normal',
  info:  'color: #3b82f6; font-weight: bold',
  warn:  'color: #eab308; font-weight: bold',
  error: 'color: #ef4444; font-weight: bold',
};

/**
 * Logger that respects environment settings
 * In production, errors should be sent to a logging service
 * In development, logs to console
 */
class Logger {
  private isDevelopment: boolean;
  private perfBlacklist: Set<string> = new Set(['fetchAgentDetails','fetchWidgetConfig']);
  private context: string;
  private defaultContext: LogContext;

  withContext(extra: LogContext): Logger {
    const child = new Logger(this.context);
    child.defaultContext = { ...this.defaultContext, ...extra };
    return child;
  }

  /** Override the minimum log level at runtime (e.g. from chat.setLogLevel()). */
  setLevel(level: LogLevel | 'silent'): void {
    if (level === 'silent') {
      this.isDevelopment = false;
      this._minLevel = 'silent';
    } else {
      this.isDevelopment = true;
      this._minLevel = level;
    }
  }

  private _minLevel: LogLevel | 'silent' = process.env.NODE_ENV !== 'production' ? 'debug' : 'error';
  private _stream = false;

  enableStream(): void { this._stream = true; }
  disableStream(): void { this._stream = false; }
  isStreaming(): boolean { return this._stream; }

  private _streamToParent(level: LogLevel, message: string, context?: LogContext): void {
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'WIDGET_LOG_STREAM', level, message, context, timestamp: Date.now() }, '*');
      }
    } catch { /* ignore */ }
  }
  private errorBuffer: Array<{
    level: LogLevel;
    message: string;
    context?: LogContext;
    timestamp: string;
    userAgent: string;
    url: string;
  }> = [];

  constructor(context = 'Widget') {
    // consider anything other than production as "development" for logging purposes
    // this ensures jest (NODE_ENV="test") will still produce console output in tests.
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.context = context;
    this.defaultContext = {};
  }

  /** Format a message prefix with optional context label. */
  private prefix(level: LogLevel): [string, string] {
    const label = `[${this.context}]`;
    return [`%c${label}`, LEVEL_STYLES[level]];
  }

  /** Merge caller-supplied context with this logger's default context. */
  private mergedCtx(ctx?: LogContext): LogContext | undefined {
    const merged = { ...this.defaultContext, ...ctx };
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * Log error - always logged, sent to error tracking in production
   */
  error(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const [pfx, style] = this.prefix('error');
      console.error(`${pfx} Error: ${message}`, style, this.mergedCtx(context) ?? '');
    } else {
      this.sendToErrorTracking('error', message, this.mergedCtx(context));
    }
    if (this._stream) this._streamToParent('error', message, context);
  }

  /**
   * Log warning - logged in development only
   */
  warn(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const [pfx, style] = this.prefix('warn');
      console.warn(`${pfx} Warn: ${message}`, style, this.mergedCtx(context) ?? '');
    }
    if (this._stream) this._streamToParent('warn', message, context);
  }

  /**
   * Log info - logged in development only
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const [pfx, style] = this.prefix('info');
      console.info(`${pfx} ${message}`, style, this.mergedCtx(context) ?? '');
    }
    if (this._stream) this._streamToParent('info', message, context);
  }

  /**
   * Log debug - logged in development only
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const [pfx, style] = this.prefix('debug');
      console.debug(`${pfx} ${message}`, style, this.mergedCtx(context) ?? '');
    }
    if (this._stream) this._streamToParent('debug', message, context);
  }

  /**
   * Send error to tracking service (placeholder for production implementation)
   */
  private sendToErrorTracking(level: LogLevel, message: string, context?: LogContext): void {
    // Endpoint can be configured via environment variable
    const endpoint = (process.env.NEXT_PUBLIC_LOG_ENDPOINT || '/api/client-errors');

    try {
      const errorData = {
        level,
        message,
        context,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        url: getWindowUrl(),
      };

      // send asynchronously, ignore errors
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData),
      }).catch(() => {});
    } catch (e) {
      // Fail silently - don't break app due to logging issues
    }
  }

  /**
   * Log a performance metric (duration in ms) for a named event.
   */
  perf(name: string, durationMs: number, context?: LogContext): void {
    // ignore certain internal calls
    if (this.perfBlacklist.has(name)) return;
    if (this.isDevelopment) {
      // log perf without extra prefix
      console.debug(`${name}: ${durationMs}ms`, context || '');
    } else {
      const endpoint = (process.env.NEXT_PUBLIC_LOG_ENDPOINT || '/api/client-errors');
      const perfData = { name, durationMs, context, timestamp: new Date().toISOString() };
      // avoid runtime errors in environments without fetch (node/jest)
      if (typeof fetch !== 'undefined') {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'perf', ...perfData }),
        }).catch(() => {});
      }
    }
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Create a new logger scoped to a named context.
 *
 * @param context  Label shown in the console prefix, e.g. `'API'`, `'Chat'`.
 *
 * @example
 *   const log = createLogger('API');
 *   log.info('Fetching session');          // [API] Fetching session
 *   const bound = log.withContext({ userId: '123' });
 *   bound.error('Auth failed');            // [API] Error: Auth failed {userId: '123'}
 */
export function createLogger(context?: string): Logger {
  return new Logger(context);
}

// Convenience exports
export const logError = (message: string, context?: LogContext) => logger.error(message, context);
export const logWarn = (message: string, context?: LogContext) => logger.warn(message, context);
export const logInfo = (message: string, context?: LogContext) => logger.info(message, context);
export const logDebug = (message: string, context?: LogContext) => logger.debug(message, context);
export const logPerf = (name: string, durationMs: number, context?: LogContext) => logger.perf(name, durationMs, context);
export const setLogLevel = (level: LogLevel | 'silent') => logger.setLevel(level);
export const enableLogStream = () => logger.enableStream();
export const disableLogStream = () => logger.disableStream();
