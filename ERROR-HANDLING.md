# Widget Error Handling

This document describes the comprehensive error handling system implemented in the Companin chat widget.

## Overview

The widget now includes robust error handling across all layers:

- Client-side JavaScript (widget.js)

- React components (ErrorBoundary)

- API communication (useWidgetAuth, EmbedClient)

- Network resilience (retry logic with exponential backoff)

## Error Types

### 1. **Authentication Errors** (`AUTH_ERROR`)

- Invalid client ID

- Failed token retrieval

- Expired authentication

**User Experience:**

- Automatic retry with backoff

- Clear error messages

- Fallback to error state

### 2. **Session Errors** (`SESSION_ERROR`)

- Session creation failure

- Session expiration

- Invalid session

**User Experience:**

- Automatic session recreation

- Preserved conversation when possible

- Local storage cleanup on expiry

### 3. **Network Errors** (`NETWORK_ERROR`)

- Connection failures

- Request timeouts

- Server errors (5xx)

**User Experience:**

- Automatic retry (up to 3 attempts)

- Exponential backoff

- User-friendly timeout messages

### 4. **Configuration Errors** (`CONFIG_ERROR`)

- Missing required parameters

- Invalid widget configuration

- Failed config loading

**User Experience:**

- Detailed error messages

- Configuration validation at load

- Helpful documentation links

### 5. **Message Errors** (`MESSAGE_ERROR`)

- Failed message send

- Failed message load

- Invalid message format

**User Experience:**

- Message restoration on failure

- Retry capability

- Status indication

## Error Handling Components

### ErrorBoundary Component

Location: `components/ErrorBoundary.tsx`

React Error Boundary that catches JavaScript errors in the component tree.

**Features:**

- Catches unhandled React errors

- Displays user-friendly error UI

- Provides "Try Again" functionality

- Shows detailed error info in development mode

- Optional custom fallback UI

- Error callback for logging

**Usage:**

```tsx

<ErrorBoundary onError={(error, errorInfo) => {

  // Log to error tracking service

}}>

  <YourComponent />

</ErrorBoundary>

```

### Error Handling Utilities

Location: `lib/errorHandling.ts`

Comprehensive error handling utilities and types.

**Key Functions:**

#### `retryWithBackoff()`

Retries failed operations with exponential backoff.

- Configurable max retries

- Exponential delay increase

- Respects non-retryable errors

- Optional retry callbacks

#### `logError()`

Centralized error logging.

- Structured error format

- Context attachment

- Console logging in development

- Ready for error tracking integration (Sentry, LogRocket, etc.)

#### `parseApiError()`

Extracts user-friendly messages from API error responses.

- Handles multiple response formats

- Provides fallback messages

- Consistent error format

#### Error Factories

- `createAuthError()`

- `createSessionError()`

- `createNetworkError()`

- `createValidationError()`

Create typed errors with appropriate codes and messages.

### Enhanced useWidgetAuth Hook

Location: `hooks/useWidgetAuth.tsx`

**Improvements:**

- Input validation

- Request timeout (10 seconds)

- Automatic retry (3 attempts)

- Exponential backoff

- Loading states

- Retry counter

- Token refresh capability

- Clear auth state function

**New Features:**

```tsx

const {

  getAuthToken,

  authToken,

  authError,

  isLoading,      // NEW: Loading state

  retryCount,     // NEW: Current retry attempt

  clearAuth,      // NEW: Clear auth state

  refreshToken,   // NEW: Force token refresh

} = useWidgetAuth();

```

### Enhanced EmbedClient

Location: `app/embed/session/EmbedClient.tsx`

**Improvements:**

- Timeout handling (15s for sessions, 30s for messages)

- Retry logic for all API calls

- Proper error recovery

- Session validation

- Error state management

- Parent window error notifications

- Comprehensive error logging

**Error Recovery:**

- Expired sessions → automatic recreation

- Failed messages → restore input

- Network errors → retry with backoff

- Config errors → show error state

### Enhanced widget.js

Location: `public/widget.js`

**Improvements:**

- Initialization validation

- Missing attribute detection

- DOM readiness checking

- iframe load timeout (15s)

- Error tracking

- User-friendly error display

- Programmatic error access

- Safe event handling

- Graceful degradation

**New API Methods:**

```javascript

window.CompaninWidget = {

  show(),

  hide(),

  resize(width, height),

  sendMessage(message),

  getErrors(),      // NEW: Get error log

  destroy(),        // NEW: Clean up widget

};

```

## Error Codes

### Authentication (1xxx)

- `1001` - Invalid client ID

- `1002` - Auth token failed

- `1003` - Auth expired

### Session (2xxx)

- `2001` - Session create failed

- `2002` - Session expired

- `2003` - Session not found

- `2004` - Session invalid

### Network (3xxx)

- `3001` - Network timeout

- `3002` - Network offline

- `3003` - Server error

- `3004` - Request failed

### Validation (4xxx)

- `4001` - Missing required params

- `4002` - Invalid config

- `4003` - Invalid message

### Configuration (5xxx)

- `5001` - Config load failed

- `5002` - Agent not found

### Message (6xxx)

- `6001` - Message send failed

- `6002` - Message load failed

### Unknown (9xxx)

- `9999` - Unknown error

## Retry Strategy

### Exponential Backoff

Default configuration:

- Max retries: 3

- Initial delay: 1000ms

- Max delay: 10000ms

- Backoff multiplier: 2x

**Retry sequence:**

1. First retry: 1s delay

2. Second retry: 2s delay

3. Third retry: 4s delay

### Retryable vs Non-Retryable Errors

**Retryable:**

- Network errors

- Timeout errors

- Server errors (5xx)

- Temporary failures

**Non-Retryable:**

- Validation errors

- Authentication errors (401, 403)

- Configuration errors

- Invalid parameters

## User Experience Improvements

### Loading States

- Clear loading indicators during operations

- Retry attempt display

- Progress feedback

### Error Messages

- User-friendly language

- Actionable guidance

- Technical details in dev mode only

### Error Recovery

- Automatic recovery where possible

- Manual retry options

- Graceful degradation

- State preservation

### Offline Support

- Detects network issues

- Queues operations (future enhancement)

- Clear offline indicators

## Monitoring and Debugging

### Development Mode

- Detailed error logs in console

- Stack traces visible

- Error details in UI

- Retry attempt logging

### Production Mode

- User-friendly messages only

- Error tracking ready

- Structured error logs

- Error code reporting

### Error Tracking Integration

Ready for integration with services like:

- Sentry

- LogRocket

- Datadog

- Custom tracking

**Integration point in `lib/errorHandling.ts`:**

```typescript

export const logError = (error: any, context?: Record<string, any>) => {

  // Add your error tracking service here

  // Example: Sentry.captureException(error, { extra: context });

};

```

## Testing Recommendations

### Error Scenarios to Test

1. **Network Issues**

   - Slow connections

   - Intermittent failures

   - Complete offline mode

2. **Invalid Configurations**

   - Missing parameters

   - Invalid client IDs

   - Malformed config

3. **Session Management**

   - Expired sessions

   - Invalid tokens

   - Session recreation

4. **API Failures**

   - Timeout scenarios

   - Server errors

   - Rate limiting

5. **Browser Compatibility**

   - LocalStorage disabled

   - Strict iframe policies

   - Cross-origin restrictions

## Migration Guide

### For Existing Implementations

No breaking changes to public API. Enhancements are backward compatible.

### New Error Handling Features

To use new error handling features:

1. **Error tracking callback:**

```tsx

<ErrorBoundary onError={(error, errorInfo) => {

  // Your tracking code

}}>

  <Widget />

</ErrorBoundary>

```

2. **Access error log:**

```javascript

const errors = window.CompaninWidget.getErrors();

console.log('Widget errors:', errors);

```

3. **Programmatic cleanup:**

```javascript

window.CompaninWidget.destroy();

```

## Future Enhancements

Planned improvements:

- Offline message queue

- Progressive retry backoff

- Circuit breaker pattern

- Health check endpoint

- Error analytics dashboard

- A/B testing for error recovery strategies

## Support

For issues or questions:

- Documentation: https://companin.tech/docs

- Support: support@companin.tech

- GitHub Issues: [Repository URL]

