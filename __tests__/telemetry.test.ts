import * as helpers from '../app/embed/session/helpers';

describe('telemetry helper', () => {
  let trackEvent: typeof import('../lib/api').trackEvent;

  beforeEach(() => {
    jest.resetAllMocks();
    // ensure API base is localhost in tests
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000';
    // re-import the module so it picks up updated env
    jest.resetModules();
    trackEvent = require('../lib/api').trackEvent;

    // Allow helper to generate a real visitor id – it's non‑deterministic but
    // we just assert presence later.
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('sends minimal event', async () => {
    await trackEvent('widget_open', undefined, {}, 'clientA');
    const url = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(url).toMatch(/^https?:\/\/127\.0\.0\.1:8000\/telemetry\/events/);
    const call = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(call.method).toBe('POST');
    expect(call.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(call.body);
    expect(body.event_type).toBe('widget_open');
    expect(body.user_id).toBeDefined();
  });

  it('includes agent and metadata', async () => {
    await trackEvent('button_clicked', 'assist-1', { button: 'ok' }, 'clientA');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https?:\/\/127\.0\.0\.1:8000\/telemetry\/events/),
      expect.any(Object)
    );
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sent).toMatchObject({
      event_type: 'button_clicked',
      agent: 'assist-1',
      metadata: { button: 'ok' },
    });
    expect(sent.user_id).toBeDefined();
    // visitor id generated automatically; just ensure property exists
    expect(sent.user_id).toBeDefined();
  });

  it('does not throw when network fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network fail'));
    await expect(trackEvent('error')).resolves.toBeUndefined();
  });

  it('sends feedback metadata correctly', async () => {
    await trackEvent('feedback_given', undefined, { rating: 'positive', comment: 'nice' }, 'clientB');
    const call = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(call.body);
    expect(body.event_type).toBe('feedback_given');
    expect(body.metadata).toEqual({ rating: 'positive', comment: 'nice' });
  });

  it('includes Authorization header when authToken is provided', async () => {
    await trackEvent('message_sent', 'assist-1', { message: 'hello' }, 'clientA', 'tok-abc');
    const call = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(call.headers['Authorization']).toBe('Bearer tok-abc');
  });

  it('omits Authorization header when no authToken is provided', async () => {
    await trackEvent('message_sent', 'assist-1', { message: 'hello' }, 'clientA');
    const call = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(call.headers).not.toHaveProperty('Authorization');
  });

  it('does not attempt telemetry when API base URL is missing', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = '';
    jest.resetModules();
    trackEvent = require('../lib/api').trackEvent;

    await trackEvent('widget_open', undefined, {}, 'clientA');

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
