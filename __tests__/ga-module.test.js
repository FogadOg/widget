function createGAModule() {
  let _gtag = null;
  let _measurementId = null;

  function initGA(measurementId) {
    if (!measurementId) return;
    _measurementId = measurementId;
    if (typeof window.gtag === 'function') {
      _gtag = window.gtag;
    } else {
      const existing = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
      if (!existing) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        document.head.appendChild(script);
      }
      window.dataLayer = window.dataLayer || [];
      window.gtag = function() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', measurementId);
      _gtag = window.gtag;
    }
  }

  function trackEvent(eventName, params) {
    if (!_gtag || !_measurementId) return;
    try {
      _gtag('event', eventName, { ...params, send_to: _measurementId });
    } catch (e) {
      console.error('[GA]', e);
    }
  }

  function mapWidgetEvent(type, data) {
    const agentId = data && data.agentId;
    switch (type) {
      case 'WIDGET_SHOW':    return ['widget_open',              { agent_id: agentId }];
      case 'WIDGET_HIDE':    return ['widget_close',             { agent_id: agentId }];
      case 'WIDGET_MESSAGE': return ['widget_message_sent',      { agent_id: agentId, message_length: data && data.length }];
      case 'WIDGET_RESPONSE':return ['widget_response_received', { agent_id: agentId }];
      case 'WIDGET_MINIMIZE':return ['widget_minimized',         { agent_id: agentId }];
      case 'WIDGET_RESTORE': return ['widget_restored',          { agent_id: agentId }];
      case 'WIDGET_ERROR':   return ['widget_error',             { agent_id: agentId, error_type: data && data.errorType }];
      default:               return null;
    }
  }

  return { initGA, trackEvent, mapWidgetEvent, _get: () => ({ _gtag, _measurementId }) };
}

describe('initGA', () => {
  beforeEach(() => {
    delete window.gtag;
    delete window.dataLayer;
    document.head.innerHTML = '';
  });

  it('does nothing when measurementId is empty', () => {
    const ga = createGAModule();
    ga.initGA('');
    expect(ga._get()._measurementId).toBeNull();
  });

  it('uses existing window.gtag if present', () => {
    const mockGtag = jest.fn();
    window.gtag = mockGtag;
    const ga = createGAModule();
    ga.initGA('G-TEST123');
    expect(ga._get()._gtag).toBe(mockGtag);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('injects gtag.js script when window.gtag is absent', () => {
    const ga = createGAModule();
    ga.initGA('G-TEST123');
    const script = document.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-TEST123"]');
    expect(script).not.toBeNull();
    expect(script.async).toBe(true);
  });

  it('does not inject duplicate script if already present', () => {
    const existing = document.createElement('script');
    existing.src = 'https://www.googletagmanager.com/gtag/js?id=G-OTHER';
    document.head.appendChild(existing);
    const ga = createGAModule();
    ga.initGA('G-TEST123');
    const scripts = document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]');
    expect(scripts.length).toBe(1);
  });
});

describe('mapWidgetEvent', () => {
  const ga = createGAModule();

  it.each([
    ['WIDGET_SHOW',     { agentId: 'a1' }, 'widget_open',              { agent_id: 'a1' }],
    ['WIDGET_HIDE',     { agentId: 'a1' }, 'widget_close',             { agent_id: 'a1' }],
    ['WIDGET_MESSAGE',  { agentId: 'a1', length: 42 }, 'widget_message_sent', { agent_id: 'a1', message_length: 42 }],
    ['WIDGET_RESPONSE', { agentId: 'a1' }, 'widget_response_received', { agent_id: 'a1' }],
    ['WIDGET_MINIMIZE', { agentId: 'a1' }, 'widget_minimized',         { agent_id: 'a1' }],
    ['WIDGET_RESTORE',  { agentId: 'a1' }, 'widget_restored',          { agent_id: 'a1' }],
    ['WIDGET_ERROR',    { agentId: 'a1', errorType: 'auth' }, 'widget_error', { agent_id: 'a1', error_type: 'auth' }],
  ])('maps %s correctly', (type, data, expectedName, expectedParams) => {
    const result = ga.mapWidgetEvent(type, data);
    expect(result).toEqual([expectedName, expectedParams]);
  });

  it('returns null for unknown event type', () => {
    expect(ga.mapWidgetEvent('UNKNOWN_EVENT', {})).toBeNull();
  });
});

describe('trackEvent', () => {
  it('calls gtag with correct arguments', () => {
    const mockGtag = jest.fn();
    window.gtag = mockGtag;
    const ga = createGAModule();
    ga.initGA('G-TEST999');
    ga.trackEvent('widget_open', { agent_id: 'a1' });
    expect(mockGtag).toHaveBeenCalledWith('event', 'widget_open', {
      agent_id: 'a1',
      send_to: 'G-TEST999',
    });
  });

  it('silently does nothing when GA not initialized', () => {
    const ga = createGAModule();
    expect(() => ga.trackEvent('widget_open', {})).not.toThrow();
  });
});
