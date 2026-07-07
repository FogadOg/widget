export const defaultProps = {
  clientId: 'test-client',
  agentId: 'test-agent',
  configId: 'test-config',
  locale: 'en',
  startOpen: false,
  pagePath: '/test',
  parentOrigin: 'https://example.com',
};

export const translationsMock = {
  failedToLoadWidget: 'Failed to load widget',
  failedToCreateSession: 'Failed to create session',
  sessionOrAuthError: 'Session or auth error',
  failedToSendMessage: 'Failed to send message',
  uncertaintyLogTitle: 'Agent Uncertainty Log',
  uncertaintyLogSubtitle: 'Messages where the agent indicated uncertainty:',
  uncertaintyLogEmpty: 'No uncertain responses yet.',
  handoffTitle: 'Talk to our team',
  handoffNameLabel: 'Name',
  handoffEmailLabel: 'Email',
  handoffMessageLabel: 'Message',
  handoffSubmitButton: 'Send Request',
  handoffSubmittingButton: 'Sending...',
  handoffError: 'Something went wrong. Please try again.',
  handoffConfirmation: 'Your message has been sent. Our team will be in touch.',
  messageSendTimeout: 'Message timed out. Please try again.',
};

export const errorCodesMock = {
  SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_SERVER_ERROR: 'NETWORK_SERVER_ERROR',
  AUTH_TOKEN_FAILED: 'AUTH_TOKEN_FAILED',
  INVALID_CONFIG: 'INVALID_CONFIG',
};
