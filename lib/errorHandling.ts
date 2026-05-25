// Error types
export enum WidgetErrorType {
  AUTH_ERROR = 'AUTH_ERROR',
  SESSION_ERROR = 'SESSION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  MESSAGE_ERROR = 'MESSAGE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Error codes
export enum WidgetErrorCode {
  // Auth errors (1xxx)
  INVALID_CLIENT = 1001,
  AUTH_TOKEN_FAILED = 1002,
  AUTH_EXPIRED = 1003,
  ORIGIN_NOT_ALLOWED = 1004,

  // Session errors (2xxx)
  SESSION_CREATE_FAILED = 2001,
  SESSION_EXPIRED = 2002,
  SESSION_NOT_FOUND = 2003,
  SESSION_INVALID = 2004,

  // Network errors (3xxx)
  NETWORK_TIMEOUT = 3001,
  NETWORK_OFFLINE = 3002,
  NETWORK_SERVER_ERROR = 3003,
  NETWORK_REQUEST_FAILED = 3004,
  NETWORK_RATE_LIMITED = 3005,

  // Validation errors (4xxx)
  MISSING_REQUIRED_PARAMS = 4001,
  INVALID_CONFIG = 4002,
  INVALID_MESSAGE = 4003,

  // Config errors (5xxx)
  CONFIG_LOAD_FAILED = 5001,
  ASSISTANT_NOT_FOUND = 5002,

  // Message errors (6xxx)
  MESSAGE_SEND_FAILED = 6001,
  MESSAGE_LOAD_FAILED = 6002,

  // Unknown errors (9xxx)
  UNKNOWN = 9999,
}

// Custom error class
export class WidgetError extends Error {
  public code: WidgetErrorCode;
  public type: WidgetErrorType;
  public retryable: boolean;
  public userMessage: string;

  constructor(
    message: string,
    code: WidgetErrorCode,
    type: WidgetErrorType,
    retryable: boolean = false,
    userMessage?: string
  ) {
    super(message);
    this.name = 'WidgetError';
    this.code = code;
    this.type = type;
    this.retryable = retryable;
    this.userMessage = userMessage || message;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WidgetError);
    }
  }
}

// Error factory functions
export const createAuthError = (message: string, code: WidgetErrorCode = WidgetErrorCode.AUTH_TOKEN_FAILED): WidgetError => {
  return new WidgetError(
    message,
    code,
    WidgetErrorType.AUTH_ERROR,
    true,
    'Failed to authenticate. Please check your credentials.'
  );
};

export const createSessionError = (message: string, code: WidgetErrorCode = WidgetErrorCode.SESSION_CREATE_FAILED): WidgetError => {
  return new WidgetError(
    message,
    code,
    WidgetErrorType.SESSION_ERROR,
    true,
    'Failed to establish session. Please try again.'
  );
};

export const createNetworkError = (message: string, code: WidgetErrorCode = WidgetErrorCode.NETWORK_REQUEST_FAILED): WidgetError => {
  return new WidgetError(
    message,
    code,
    WidgetErrorType.NETWORK_ERROR,
    true,
    'Network error. Please check your connection and try again.'
  );
};

export const createValidationError = (message: string, code: WidgetErrorCode = WidgetErrorCode.INVALID_CONFIG): WidgetError => {
  return new WidgetError(
    message,
    code,
    WidgetErrorType.VALIDATION_ERROR,
    false,
    'Invalid configuration. Please check your widget setup.'
  );
};

// Retry logic with exponential backoff
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (error instanceof WidgetError && !error.retryable) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );

      // Call retry callback if provided
      onRetry?.(attempt + 1, error);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

// Error logger
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logError = (error: any, context?: Record<string, any>) => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    message: error?.message || error?.userMessage || 'Unknown error',
    stack: error?.stack,
    code: error instanceof WidgetError ? error.code : error?.code || undefined,
    type: error instanceof WidgetError ? error.type : error?.type || undefined,
    name: error?.name || undefined,
    context,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Widget Error:', errorInfo);
  }

  // In production, you could send to error tracking service
  // e.g., Sentry, LogRocket, etc.
};

// Check if error is network-related
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isNetworkError = (error: any): boolean => {
  if (error instanceof WidgetError) {
    return error.type === WidgetErrorType.NETWORK_ERROR;
  }

  // Check for common network error patterns
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('offline') ||
    error?.name === 'NetworkError' ||
    error?.name === 'TypeError' && message.includes('failed to fetch')
  );
};

// Check if error is retryable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isRetryableError = (error: any): boolean => {
  if (error instanceof WidgetError) {
    return error.retryable;
  }

  // Network errors are generally retryable
  if (isNetworkError(error)) {
    return true;
  }

  // Check HTTP status codes (5xx are retryable)
  if (error?.status >= 500 && error?.status < 600) {
    return true;
  }

  return false;
};

// Parse API error response
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseApiError = (response: any, defaultMessage: string = 'An error occurred'): string => {
  try {
    if (typeof response === 'string') {
      return response;
    }

    if (response?.detail) {
      return typeof response.detail === 'string' ? response.detail : defaultMessage;
    }

    if (response?.message) {
      return response.message;
    }

    if (response?.error) {
      return typeof response.error === 'string' ? response.error : defaultMessage;
    }

    return defaultMessage;
  } catch {
    return defaultMessage;
  }
};
