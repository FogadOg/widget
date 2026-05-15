import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Polyfill Web Fetch API globals (Request, Response, Headers, fetch)
// Jest's jsdom environment may not expose Node 18+'s native fetch globals.
// We promote them from the Node process global into jsdom's globalThis so
// that any code referencing Request/Response/Headers at module-evaluation
// time (e.g. next/server internals) can find them.
// Files that test server-side Next.js code should also add:
//   /** @jest-environment node */
// at the top of the file so they run in an environment that has all Node
// globals natively, without needing this polyfill at all.
// ---------------------------------------------------------------------------
if (typeof globalThis.Request === 'undefined') {
  // Node 18+ exposes these on the process global; access via Function scope
  // to avoid jsdom's window proxy interfering.
  const nodeGlobal = Function('return globalThis')();
  if (typeof nodeGlobal.Request !== 'undefined') {
    if (!globalThis.fetch)     globalThis.fetch     = nodeGlobal.fetch;
    if (!globalThis.Request)   globalThis.Request   = nodeGlobal.Request;
    if (!globalThis.Response)  globalThis.Response  = nodeGlobal.Response;
    if (!globalThis.Headers)   globalThis.Headers   = nodeGlobal.Headers;
  }
}

// Set up environment variables for testing
process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.test.com';

// Polyfill crypto.randomUUID for jsdom environments that lack it.
// jest.spyOn requires the property to exist on the object before spying.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
  });
}

// Polyfill MessageChannel for jsdom environments.
// react-dom/server.browser.js requires MessageChannel at import time.
if (typeof globalThis.MessageChannel === 'undefined') {
  (async () => {
    const { MessageChannel } = await import('worker_threads');
    globalThis.MessageChannel = MessageChannel;
  })();
}

// Polyfill TextEncoder/TextDecoder for jsdom environments that lack them.
if (typeof globalThis.TextEncoder === 'undefined') {
  (async () => {
    const { TextEncoder, TextDecoder } = await import('util');
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;
  })();
}

// baseline-browser-mapping prints a warning if its data is old; tests don't need this info
// Some packages pull it in automatically and it logs on import, so instead of
// mocking we simply suppress the warning text so our test output stays clean.
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('[baseline-browser-mapping]')) {
    return;
  }
  if (args[0] && typeof args[0] === 'string' && args[0].includes('missing widget_type')) {
    return;
  }
  // Suppress widget config validation warnings that arise from tests that
  // deliberately boot the widget without a full config object.
  if (args[0] && typeof args[0] === 'string' && args[0].startsWith('[widget] Missing required field')) {
    return;
  }
  // Suppress cross-test-contamination noise from accumulated window.addEventListener
  // listeners in handshake tests — accumulated listeners reject events fired by
  // later tests, producing harmless but noisy console output.
  if (args[0] && typeof args[0] === 'string' && args[0].startsWith('[handshake]')) {
    return;
  }
  originalWarn.apply(console, args);
};

// we still mock the module so any runtime access is safe
jest.mock('baseline-browser-mapping', () => ({
  // empty stub
}));

// NODE_ENV=test is guaranteed by jest.env.js (a setupFiles entry that runs
// before module resolution), so React 19 loads its development build which
// exports React.act. No shim needed here.
