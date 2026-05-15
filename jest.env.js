// Ensure NODE_ENV=test so React and react-dom load their development builds,
// which export React.act. Without this, React 19 production builds omit act,
// causing "TypeError: React.act is not a function" in @testing-library/react.
process.env.NODE_ENV = 'test';

// Polyfills that must exist before test modules are evaluated.
// Some server-component tests import react-dom/server.browser at module scope,
// which expects MessageChannel and TextEncoder/TextDecoder immediately.
if (typeof globalThis.MessageChannel === 'undefined') {
	const { MessageChannel } = require('worker_threads');
	globalThis.MessageChannel = MessageChannel;
}

if (typeof globalThis.TextEncoder === 'undefined') {
	const { TextEncoder, TextDecoder } = require('util');
	globalThis.TextEncoder = TextEncoder;
	globalThis.TextDecoder = TextDecoder;
}
