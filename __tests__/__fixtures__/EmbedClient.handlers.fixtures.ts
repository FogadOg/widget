export const defaultProps = {
  clientId: 'c1',
  agentId: 'a1',
  configId: 'cfg',
  locale: 'en',
  startOpen: false,
  parentOrigin: 'https://example.com',
};

export const QUEUED_MESSAGE_FIXTURE = {
  id: 'temp-1',
  text: 'temp',
  timestamp: 0, // callers should override with Date.now() if needed
  attempts: 0,
};

export const QUEUE_FLUSH_RESULT_EVENT = {
  data: {
    type: 'QUEUE_FLUSH_RESULT',
    results: [
      {
        id: 'temp-1',
        success: true,
        serverMessage: {
          id: 'srv-1',
          content: 'server',
          sender: 'assistant',
          created_at: new Date().toISOString(),
        },
      },
    ],
  },
} as MessageEvent;

export const HOST_MESSAGE_EVENTS = {
  toggle: (parent: any) =>
    ({
      source: parent,
      origin: 'https://example.com',
      data: { type: 'HOST_MESSAGE', data: 'toggle' },
    } as unknown as MessageEvent),
  open: (parent: any) =>
    ({
      source: parent,
      origin: 'https://example.com',
      data: { type: 'HOST_MESSAGE', data: 'open' },
    } as unknown as MessageEvent),
  close: (parent: any) =>
    ({
      source: parent,
      origin: 'https://example.com',
      data: { type: 'HOST_MESSAGE', data: 'close' },
    } as unknown as MessageEvent),
};
