(function () {
  try {
    var script = document.currentScript;
    if (!script) return;

    var rawPayload = script.getAttribute('data-error-payload') || '';
    if (!rawPayload) return;

    var decoded = decodeURIComponent(rawPayload);
    var payload = JSON.parse(decoded);
    var scope = payload && payload.scope === 'docs' ? 'Docs' : 'Widget';

    try {
      console.error('[Companin ' + scope + ' Embed Error]', payload);
    } catch {}

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'WIDGET_ERROR', data: payload }, '*');
      window.parent.postMessage(
        {
          type: 'WIDGET_SHOW',
          data: {
            source: 'embed-error',
            errorType: payload.errorType || 'embed_error',
            width: 420,
            height: 280,
          },
        },
        '*'
      );
    }
  } catch (err) {
    try {
      console.error('[Companin Embed Error] Reporter failed', err);
    } catch {}
  }
})();