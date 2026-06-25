import React from 'react';

/**
 * Shown inside the widget iframe when the embedding domain is not in the
 * org's allowed-origins list. Rendered in production (unlike generic fatal
 * errors which are silent) because a blank widget on an unauthorized site
 * is indistinguishable from a load failure from the site owner's perspective.
 */
export function WidgetNotAuthorized() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: '120px',
      padding: '20px 16px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      background: '#ffffff',
      boxSizing: 'border-box',
      textAlign: 'center',
    }}>
      <div style={{ color: '#d97706', marginBottom: '10px', flexShrink: 0 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: '#374151', lineHeight: 1.4 }}>
        Widget not authorized
      </p>
      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
        This website is not allowed to use this widget. Contact the site owner to update the allowed origins.
      </p>
    </div>
  );
}

export default WidgetNotAuthorized;
