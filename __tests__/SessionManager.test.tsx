import React from 'react';

import { render, waitFor } from '@testing-library/react';

import SessionManager from '../components/SessionManager';

// Mock modules used by SessionManager

jest.mock('lib/errorHandling', () => ({

  createSessionError: (msg: string, code: any) => Object.assign(new Error(msg), { userMessage: msg, code }),

  createNetworkError: (msg: string, code: any) => Object.assign(new Error(msg), { userMessage: msg, code }),

  parseApiError: (data: any, fallback: string) => (data && data.error) || fallback,

  retryWithBackoff: async (fn: any, _opts: any) => {

    // Execute the provided function immediately for tests

    return fn();

  },

  WidgetErrorCode: {

    SESSION_CREATE_FAILED: 'SESSION_CREATE_FAILED',

    NETWORK_SERVER_ERROR: 'NETWORK_SERVER_ERROR',

    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT'

  }

}));

jest.mock('lib/api', () => ({

  API: {

    sessions: () => '/sessions',

    sessionMessages: (id: string) => `/sessions/${id}/messages`

  },

  embedOriginHeader: () => ({ 'x-embed-origin': 'test' })

}));

jest.mock('lib/logger', () => ({ logError: jest.fn() }));

jest.mock('lib/constants', () => ({ TIMEOUTS: { SESSION_CREATE: 1000 } }));

jest.mock('lib/sessionStorage', () => ({

  getOrCreateVisitorId: jest.fn(() => 'visitor-1'),

  getStoredSessionByKey: jest.fn(() => null),

  storeSessionByKey: jest.fn()

}));

describe('SessionManager', () => {

  const origFetch = global.fetch;

  beforeEach(() => {

    // reset fetch mock

    // @ts-ignore

    global.fetch = jest.fn();

    localStorage.clear();

    const sessionStorage = require('lib/sessionStorage');

    sessionStorage.getStoredSessionByKey.mockReturnValue(null);

    const logger = require('lib/logger');

    logger.logError.mockClear();

  });

  afterAll(() => {

    global.fetch = origFetch;

  });

  test('creates session when none stored and loads messages', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // Mock POST /sessions

    // @ts-ignore

    global.fetch.mockImplementationOnce(() => Promise.resolve({

      ok: true,

      json: () => Promise.resolve({ status: 'success', data: { session_id: 's1', expires_at: 't1' } })

    }))

    // Mock GET /sessions/s1/messages

    .mockImplementationOnce(() => Promise.resolve({

      ok: true,

      json: () => Promise.resolve({ status: 'success', data: { messages: [] } })

    }));

    // require component after resetModules so it picks up per-test mocks

    SessionManager = require('../components/SessionManager').default;

    render(

      <SessionManager

        agentId="a1"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('s1', 't1'));

    expect(onMessagesLoaded).toHaveBeenCalledWith([]);

    expect(onSessionError).not.toHaveBeenCalled();

  });

  test('restores stored session and maps messages', async () => {

    // Re-mock sessionStorage to return a stored session

    const sessionStorage = require('lib/sessionStorage');

    sessionStorage.getStoredSessionByKey.mockReturnValue({ sessionId: 's2', expiresAt: '' });

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // Mock GET /sessions/s2/messages to return messages

    const apiResp = {

      ok: true,

      json: () => Promise.resolve({ status: 'success', data: { messages: [

        { id: 'm1', content: 'Hello from agent', sender: 'assistant', created_at: '2020-01-01T00:00:00Z' },

        { id: 'm2', content: 'User reply', sender: 'user', created_at: '2020-01-01T00:01:00Z' }

      ] } })

    };

    // @ts-ignore

    global.fetch.mockImplementation(() => Promise.resolve(apiResp));

    // require component after resetModules so it picks up per-test mocks

    SessionManager = require('../components/SessionManager').default;

    render(

      <SessionManager

        agentId="a2"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('s2', ''));

    // onMessagesLoaded should be called with two mapped messages

    await waitFor(() => expect(onMessagesLoaded).toHaveBeenCalled());

    const calls = onMessagesLoaded.mock.calls[0][0];

    expect(Array.isArray(calls)).toBe(true);

    expect(calls.find((m: any) => m.id === 'm2').text).toBe('User reply');

  });

  test('invalid stored session triggers new session creation', async () => {

    const sessionStorage = require('lib/sessionStorage');

    sessionStorage.getStoredSessionByKey.mockReturnValue({ sessionId: 'bad', expiresAt: '' });

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // First call: GET stored session messages returns non-ok

    // Second call: POST create session succeeds

    // Third call: GET messages for new session returns ok

    // @ts-ignore

    global.fetch

      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404 }))

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { session_id: 'created', expires_at: '' } }) }))

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { messages: [] } }) }));

    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');

    // require component after resetModules so it picks up per-test mocks

    SessionManager = require('../components/SessionManager').default;

    render(

      <SessionManager

        agentId="a3"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(removeSpy).toHaveBeenCalled());

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('created', ''));

  });

  test('filters out agent greeting messages when no user messages', async () => {

    const sessionStorage = require('lib/sessionStorage');

    sessionStorage.getStoredSessionByKey.mockReturnValue({ sessionId: 's4', expiresAt: '' });

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    const apiResp = {

      ok: true,

      json: () => Promise.resolve({ status: 'success', data: { messages: [

        { id: 'm1', content: 'Agent only', sender: 'assistant', created_at: '2020-01-01T00:00:00Z' }

      ] } })

    };

    // @ts-ignore

    global.fetch.mockImplementation(() => Promise.resolve(apiResp));

    render(

      <SessionManager

        agentId="a4"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('s4', ''));

    await waitFor(() => expect(onMessagesLoaded).toHaveBeenCalledWith([]));

  });

  test('loadSessionMessages logs on non-ok response and does not throw', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // POST create session succeeds

    // @ts-ignore

    global.fetch

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { session_id: 's5', expires_at: '' } }) }))

      // GET messages fails (non-ok)

      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }));

    const logger = require('lib/logger');

    render(

      <SessionManager

        agentId="a5"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('s5', ''));

    await waitFor(() => expect(logger.logError).toHaveBeenCalled());

    expect(onMessagesLoaded).not.toHaveBeenCalledWith(expect.anything());

  });

  test('createSession with invalid JSON triggers onSessionError', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // POST returns ok but json() throws

    // @ts-ignore

    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => { throw new Error('bad json'); } }));

    render(

      <SessionManager

        agentId="a6"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionError).toHaveBeenCalledWith('Invalid response from session server'));

  });

  test('createSession handles 5xx by returning network error via onSessionError', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // POST returns non-ok 502 with a body containing error

    // @ts-ignore

    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: 'Server exploded' }) }));

    render(

      <SessionManager

        agentId="a7"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionError).toHaveBeenCalledWith('Server exploded'));

  });

  test('createSession handles AbortError as timeout', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    const abortErr: any = new Error('aborted');

    abortErr.name = 'AbortError';

    // fetch throws abort

    // @ts-ignore

    global.fetch.mockImplementationOnce(() => { throw abortErr; });

    render(

      <SessionManager

        agentId="a8"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionError).toHaveBeenCalledWith('Session creation timed out'));

  });

  test('createSession invalid session response (missing session_id) triggers onSessionError', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // POST returns ok but missing session_id

    // @ts-ignore

    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: {} }) }));

    render(

      <SessionManager

        agentId="a9"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionError).toHaveBeenCalledWith('Invalid session response format'));

  });

  test('maps sources and uses Date.now fallback when created_at missing', async () => {

    const sessionStorage = require('lib/sessionStorage');

    // Do not restore an existing session - ensure createSession -> loadSessionMessages path

    sessionStorage.getStoredSessionByKey.mockReturnValue(null);

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    const now = 1610000000000;

    const realNow = Date.now;

    // @ts-ignore

    Date.now = () => now;

    // First call: POST /sessions (create session)

    // Second call: GET /sessions/<id>/messages

    // Mock POST create session

    // @ts-ignore

    global.fetch

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { session_id: 's10', expires_at: '' } }) }))

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { messages: [

        { id: 'm1', content: 'No timestamp', sender: 'user', /* no created_at */ sources: ['s1'] },

        { id: 'm2', content: 'Has timestamp', sender: 'assistant', created_at: '2020-01-01T00:00:00Z', sources: [] }

      ] } }) }));

    render(

      <SessionManager

        agentId="a10"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('s10', ''));

    await waitFor(() => expect(onMessagesLoaded).toHaveBeenCalled());

    const msgs = onMessagesLoaded.mock.calls[0][0];

    const m1 = msgs.find((m: any) => m.id === 'm1');

    expect(m1.timestamp).toBe(now);

    expect(m1.sources).toEqual(['s1']);

    // restore Date.now

    // @ts-ignore

    Date.now = realNow;

  });

  test('validateAndRestoreSession catches thrown fetch error, removes storage and creates new session', async () => {

    const sessionStorage = require('lib/sessionStorage');

    sessionStorage.getStoredSessionByKey.mockReturnValue({ sessionId: 's11', expiresAt: '' });

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // First fetch (validate) throws, next POST create session succeeds, then GET messages

    const networkErr = new Error('network');

    // @ts-ignore

    global.fetch

      .mockImplementationOnce(() => { throw networkErr; })

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { session_id: 'new-session', expires_at: '' } }) }))

      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { messages: [] } }) }));

    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');

    render(

      <SessionManager

        agentId="a11"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(removeSpy).toHaveBeenCalled());

    await waitFor(() => expect(onSessionCreated).toHaveBeenCalledWith('new-session', ''));

  });

  test('createSession handles 4xx non-5xx by returning session create error via onSessionError', async () => {

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // POST returns non-ok 400 with a body containing error

    // @ts-ignore

    global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'Bad auth' }) }));

    render(

      <SessionManager

        agentId="a12"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    await waitFor(() => expect(onSessionError).toHaveBeenCalledWith('Bad auth'));

  });

  test('loadSessionMessages throws invalid format and logs error without crashing', async () => {

    const sessionStorage = require('lib/sessionStorage');

    sessionStorage.getStoredSessionByKey.mockReturnValue({ sessionId: 's13', expiresAt: '' });

    const onSessionCreated = jest.fn();

    const onSessionError = jest.fn();

    const onMessagesLoaded = jest.fn();

    // GET messages returns ok true but invalid format

    // @ts-ignore

    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'error' }) }));

    const logger = require('lib/logger');

    render(

      <SessionManager

        agentId="a13"

        authToken="token"

        locale="en"

        onSessionCreated={onSessionCreated}

        onSessionError={onSessionError}

        onMessagesLoaded={onMessagesLoaded}

      />

    );

    // The validate call returns an invalid format; ensure we log the error and do not call onMessagesLoaded

    await waitFor(() => expect(logger.logError).toHaveBeenCalled());

    expect(onMessagesLoaded).not.toHaveBeenCalled();

    expect(onSessionCreated).not.toHaveBeenCalled();

  });

});

