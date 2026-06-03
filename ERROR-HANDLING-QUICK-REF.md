# Widget Error Handling - Quick Reference

## Common Error Scenarios & Solutions

### 1. Widget Won't Load

**Symptoms:**

- Widget container appears but nothing loads

- Blank widget space

- No error message visible

**Possible Causes:**

```javascript

// Check browser console for:

"Missing required attributes"

"Widget iframe failed to load"

"Configuration Error"

```

**Solutions:**

```html

<!-- Verify all required attributes are present -->

<script

  src="https://widget.companin.tech/widget.js"

  data-client-id="your-client-id"

  data-agent-id="your-agent-id"

  data-config-id="your-config-id"

></script>

<!-- Check for errors programmatically -->

<script>

  setTimeout(() => {

    const errors = window.CompaninWidget?.getErrors();

    if (errors && errors.length > 0) {

      console.error('Widget errors:', errors);

    }

  }, 5000);

</script>

```

### 2. Authentication Failures

**Symptoms:**

- "Failed to authenticate" message

- Widget loads but doesn't initialize

- Repeated authentication attempts

**Error Codes:**

- `1001` - Invalid client ID

- `1002` - Auth token failed

- `1003` - Auth expired

**Solutions:**

```javascript

// Verify client ID is correct

const clientId = script.getAttribute("data-client-id");

console.log('Using client ID:', clientId);

// Check API endpoint is accessible

fetch('https://app.companin.tech/api/v1/auth/widget-token', {

  method: 'POST',

  headers: { 'Content-Type': 'application/json' },

  body: JSON.stringify({ client_id: 'your-client-id' })

})

.then(response => response.json())

.then(data => console.log('Auth response:', data))

.catch(error => console.error('Auth failed:', error));

```

### 3. Session Expired

**Symptoms:**

- "Session expired" message mid-conversation

- Cannot send new messages

- Widget asks to refresh

**Error Codes:**

- `2002` - Session expired

- `2003` - Session not found

- `2004` - Session invalid

**Automatic Recovery:**

The widget automatically:

1. Detects expired session

2. Clears localStorage

3. Creates new session

4. Continues conversation

**Manual Recovery:**

```javascript

// Clear session manually if needed

localStorage.removeItem('companin-session-{clientId}-{agentId}');

window.location.reload();

```

### 4. Network Timeouts

**Symptoms:**

- "Request timed out" message

- Slow or no response

- Loading indicator stuck

**Error Codes:**

- `3001` - Network timeout

- `3002` - Network offline

- `3003` - Server error

**Automatic Retry:**

The widget automatically retries:

- Authentication: 3 attempts

- Session creation: 3 attempts

- Message sending: 2 attempts

**Check Network:**

```javascript

// Test connectivity

fetch('https://app.companin.tech/api/v1/health')

  .then(response => console.log('API is reachable:', response.ok))

  .catch(error => console.error('API unreachable:', error));

// Check if offline

if (!navigator.onLine) {

  console.error('Browser is offline');

}

```

### 5. Message Send Failures

**Symptoms:**

- Message appears then disappears

- Input is restored after sending

- Error message shown

**Error Codes:**

- `6001` - Message send failed

**Automatic Recovery:**

The widget automatically:

1. Shows message optimistically

2. Attempts to send with retry

3. Removes message if all attempts fail

4. Restores input for user to retry

**Manual Retry:**

User can simply send the message again - input is preserved.

### 6. Configuration Issues

**Symptoms:**

- "Configuration error" displayed

- Widget styling broken

- Features not working

**Error Codes:**

- `4001` - Missing required params

- `4002` - Invalid config

- `5001` - Config load failed

**Verify Configuration:**

```html

<!-- Required attributes -->

<script

  src="widget.js"

  data-client-id="required"

  data-agent-id="required"

  data-config-id="required"

  data-locale="optional-default-en"

  data-start-open="optional-default-false"

></script>

```

**Check Config Loading:**

```javascript

// In browser console

window.addEventListener('message', (event) => {

  console.log('Widget message:', event.data);

});

```

### 7. Cross-Origin Issues

**Symptoms:**

- Widget loads but cannot communicate

- PostMessage errors in console

- Features not responding

**Solutions:**

```javascript

// Verify origin is allowed

// In development mode

<script

  src="widget.js"

  data-dev="true"

  ...

></script>

// In production, ensure domain is correct

// Widget only accepts messages from companin.tech domains

```

### 8. LocalStorage Disabled

**Symptoms:**

- Session not persisting

- New session on every page load

- "Storage error" in console

**Fallback Behavior:**

The widget will:

- Work without localStorage

- Not persist sessions between page loads

- Show warnings in development mode

**Check Storage:**

```javascript

// Test localStorage availability

try {

  localStorage.setItem('test', 'test');

  localStorage.removeItem('test');

  console.log('localStorage available');

} catch (e) {

  console.error('localStorage disabled:', e);

}

```

## Debugging Commands

### Get Error Log

```javascript

const errors = window.CompaninWidget.getErrors();

console.table(errors);

```

### Check Widget State

```javascript

console.log('Widget exists:', !!window.CompaninWidget);

console.log('Widget initialized:', window.__COMPANIN_WIDGET__);

```

### Test Widget Methods

```javascript

// Show widget

window.CompaninWidget.show();

// Hide widget

window.CompaninWidget.hide();

// Resize widget

window.CompaninWidget.resize(400, 600);

// Send test message

window.CompaninWidget.sendMessage('test');

```

### Monitor Widget Events

```javascript

window.addEventListener('message', (event) => {

  if (event.origin.includes('companin')) {

    console.log('Widget event:', event.data.type, event.data.data);

  }

});

```

### Clean Up Widget

```javascript

// Remove widget completely

window.CompaninWidget.destroy();

```

## Error Recovery Flowchart

```

Error Occurs

    ↓

Is it retryable?

    ↓ Yes → Retry with backoff → Success? → Continue

    ↓ No                              ↓ No

    ↓                                 ↓

Show error message ← ← ← ← ← ← ← ← ← ←

    ↓

User action available?

    ↓ Yes → User retries → Continue

    ↓ No

    ↓

Graceful degradation

```

## Best Practices

### 1. Always Check Console

Open browser console to see detailed errors in development mode.

### 2. Use Error Log

Access error log programmatically to debug issues:

```javascript

setInterval(() => {

  const errors = window.CompaninWidget?.getErrors();

  if (errors?.length > 0) {

    console.log('Recent errors:', errors.slice(-5));

  }

}, 30000); // Check every 30 seconds

```

### 3. Monitor Network

Use browser DevTools Network tab to verify API calls.

### 4. Test Error Scenarios

```javascript

// Simulate timeout

// In dev mode, set very low timeout to test

// Simulate auth failure

// Use invalid client ID temporarily

// Simulate network error

// Use browser offline mode

```

### 5. Implement Error Tracking

```javascript

<ErrorBoundary onError={(error, errorInfo) => {

  // Send to your tracking service

  analytics.track('widget_error', {

    error: error.message,

    stack: error.stack,

    componentStack: errorInfo.componentStack

  });

}}>

  <Widget />

</ErrorBoundary>

```

## Support Resources

### Documentation

- Full guide: `ERROR-HANDLING.md`

- Implementation: `ERROR-HANDLING-CHECKLIST.md`

### API Reference

- Widget API: https://companin.tech/docs/widget-api

- Error Codes: https://companin.tech/docs/error-codes

### Contact

- Support: support@companin.tech

- Documentation: https://companin.tech/docs

## Quick Fixes Summary

| Issue | Quick Fix |

|-------|-----------|

| Won't load | Check required attributes |

| Auth fails | Verify client ID |

| Session expired | Will auto-recreate |

| Network timeout | Will auto-retry |

| Message fails | Input restored, retry |

| Config error | Check all params |

| Cross-origin | Use data-dev="true" for local testing |

| Storage disabled | Widget works but no persistence |

---

**Need more help?** Check the full error handling documentation in `ERROR-HANDLING.md`.

