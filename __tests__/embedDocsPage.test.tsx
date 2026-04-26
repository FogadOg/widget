import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('../app/embed/docs/DocsClient', () => {
  return function MockDocsClient(props: any) {
    return React.createElement('div', { 'data-props': JSON.stringify(props) });
  };
});

jest.mock('../lib/i18n', () => ({
  getLocaleDirection: jest.fn(() => 'ltr'),
  getTranslations: jest.fn(() => ({
    docsConfigError: 'Docs Assistant Configuration Error',
    widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',
    widgetConfigOurDocumentation: 'our documentation',
  })),
}));

import DocsPage from '../app/embed/docs/page';

describe('Docs page server component', () => {
  test('renders error UI when required params are missing', async () => {
    const element = await (DocsPage as any)({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Docs Assistant Configuration Error');
    expect(html).toContain('data-client-id');
    expect(html).toContain('data-assistant-id');
    expect(html).toContain('data-config-id');
  });

  test('renders DocsClient with correct props when params provided', async () => {
    const params = {
      clientId: 'c1',
      assistantId: 'a1',
      configId: 'cfg',
      locale: 'en',
      startOpen: 'true',
      suggestions: 'one,two',
      pagePath: '/doc',
    };

    const element = await (DocsPage as any)({ searchParams: Promise.resolve(params) });
    const html = renderToStaticMarkup(element);

    // Extract the JSON from the mocked DocsClient `data-props` attribute
    const m = html.match(/data-props="([^"]*)"/);
    expect(m).toBeTruthy();
    const raw = m ? m[1] : '';
    const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const props = JSON.parse(decoded);

    expect(props.clientId).toBe('c1');
    expect(props.assistantId).toBe('a1');
    expect(props.configId).toBe('cfg');
    expect(props.locale).toBe('en');
    expect(props.startOpen).toBe(true);
    expect(Array.isArray(props.suggestions)).toBe(true);
    expect(props.suggestions).toEqual(['one', 'two']);
    expect(props.pagePath).toBe('/doc');
  });
});
