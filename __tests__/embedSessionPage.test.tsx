import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('Embed session page', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns error HTML when required params are missing', async () => {
    // Use non-hoisted mocks so we can compute module ids at runtime
    const embedClientPath = require.resolve('../app/embed/session/EmbedClient');
    const errorBoundaryPath = require.resolve('../components/ErrorBoundary');
    const i18nPath = require.resolve('../lib/i18n');

    jest.doMock(embedClientPath, () => ({
      __esModule: true,
      default: (props: any) => React.createElement('div', { 'data-embed-client': '1', 'data-props': JSON.stringify(props) })
    }));

    jest.doMock(errorBoundaryPath, () => ({
      __esModule: true,
      default: ({ children }: any) => React.createElement('div', { 'data-error-boundary': '1' }, children)
    }));

    jest.doMock(i18nPath, () => ({
      getLocaleDirection: (/* locale */) => 'ltr',
      getTranslations: () => ({
        widgetConfigError: 'Widget Configuration Error',
        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',
        widgetConfigOurDocumentation: 'our documentation',
      }),
    }));

    const page = require('../app/embed/session/page').default;

    // call with empty params
    const element = await page({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element as any);

    expect(html).toContain('Widget Configuration Error');
    expect(html).toContain('data-client-id');
    expect(html).toContain('data-assistant-id');
    expect(html).toContain('data-config-id');
  });

  test('renders EmbedClient when required params provided', async () => {
    const embedClientPath = require.resolve('../app/embed/session/EmbedClient');
    const errorBoundaryPath = require.resolve('../components/ErrorBoundary');
    const i18nPath = require.resolve('../lib/i18n');

    jest.doMock(embedClientPath, () => ({
      __esModule: true,
      default: (props: any) => React.createElement('div', { 'data-embed-client': '1', 'data-props': JSON.stringify(props) })
    }));

    jest.doMock(errorBoundaryPath, () => ({
      __esModule: true,
      default: ({ children }: any) => React.createElement('div', { 'data-error-boundary': '1' }, children)
    }));

    jest.doMock(i18nPath, () => ({
      getLocaleDirection: (/* locale */) => 'ltr',
      getTranslations: () => ({
        widgetConfigError: 'Widget Configuration Error',
        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',
        widgetConfigOurDocumentation: 'our documentation',
      }),
    }));

    const page = require('../app/embed/session/page').default;

    const params = {
      clientId: 'client-1',
      assistantId: 'assistant-1',
      configId: 'config-1',
      locale: 'en',
      startOpen: 'true',
      pagePath: '/some/path',
      parentOrigin: 'https://example.com'
    };

    const element = await page({ searchParams: Promise.resolve(params) });
    const html = renderToStaticMarkup(element as any);

    // Our EmbedClient mock renders a div with data-embed-client and stringified props
    expect(html).toContain('data-embed-client="1"');
    // JSON is HTML-escaped in static markup; assert on raw values instead
    expect(html).toContain('client-1');
    expect(html).toContain('assistant-1');
    expect(html).toContain('config-1');
  });
});
