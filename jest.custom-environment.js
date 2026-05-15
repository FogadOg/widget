const JSDOMEnvironment = require('jest-environment-jsdom').TestEnvironment;
const { MessageChannel } = require('worker_threads');
const { TextEncoder, TextDecoder } = require('util');

class CustomJSDOMEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();

    if (typeof this.global.MessageChannel === 'undefined') {
      this.global.MessageChannel = MessageChannel;
    }

    if (typeof this.global.TextEncoder === 'undefined') {
      this.global.TextEncoder = TextEncoder;
    }

    if (typeof this.global.TextDecoder === 'undefined') {
      this.global.TextDecoder = TextDecoder;
    }
  }
}

module.exports = CustomJSDOMEnvironment;
