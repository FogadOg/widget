import React from 'react';

import { createHmac } from 'node:crypto';

import { renderToStaticMarkup } from 'react-dom/server';

function toBase64Url(input: Buffer): string {

  return input

    .toString('base64')

    .replace(/\+/g, '-')

    .replace(/\//g, '_')

    .replace(/=+$/g, '');

}

function createToken(payload: Record<string, unknown>, secret: string): string {

  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = toBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));

  const signingInput = `${headerB64}.${payloadB64}`;

  const sig = toBase64Url(createHmac('sha256', secret).update(signingInput).digest());

  return `${signingInput}.${sig}`;

}

describe('Embed session page', () => {

  const originalEnv = { ...process.env };

  afterEach(() => {

    process.env = { ...originalEnv };

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

    expect(html).not.toContain('<html');

    expect(html).toContain('data-client-id');

    expect(html).toContain('data-agent-id');

    expect(html).toContain('data-config-id');

  });

  test('renderEmbedErrorCard falls back to default error metadata when options are omitted', () => {

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

      getLocaleDirection: () => 'ltr',

      getTranslations: () => ({

        widgetConfigError: 'Widget Configuration Error',

        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',

        widgetConfigOurDocumentation: 'our documentation',

      }),

    }));

    const helperModule = require('../app/embed/session/renderEmbedErrorCard');

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const element = helperModule.renderSessionEmbedErrorCard('en', 'Default Session Error', React.createElement('p', null, 'body'));

    const html = renderToStaticMarkup(element as any);

    expect(html).toContain('Default Session Error');

    expect(html).toContain('/embed-error-reporter.js');

    expect(consoleErrorSpy).toHaveBeenCalledWith(

      '[Companin Widget Embed Error]',

      expect.objectContaining({

        errorType: 'embed_error',

        title: 'Default Session Error',

        message: 'Default Session Error',

      }),

    );

    consoleErrorSpy.mockRestore();

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

      agentId: 'agent-1',

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

    expect(html).toContain('agent-1');

    expect(html).toContain('config-1');

  });

  test('parses startOpen, strictOrigin, and consentRequired flags from query params', async () => {

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

      getLocaleDirection: () => 'ltr',

      getTranslations: () => ({

        widgetConfigError: 'Widget Configuration Error',

        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',

        widgetConfigOurDocumentation: 'our documentation',

      }),

    }));

    const page = require('../app/embed/session/page').default;

    const element = await page({

      searchParams: Promise.resolve({

        clientId: 'client-flags',

        agentId: 'agent-flags',

        configId: 'config-flags',

        startOpen: 'false',

        strictOrigin: 'true',

        consentRequired: 'true',

      }),

    });

    const html = renderToStaticMarkup(element as any);

    const m = html.match(/data-props="([^"]*)"/);

    expect(m).toBeTruthy();

    const raw = m ? m[1] : '';

    const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

    const props = JSON.parse(decoded);

    expect(props.startOpen).toBe(false);

    expect(props.strictOrigin).toBe(true);

    expect(props.consentRequired).toBe(true);

  });

  test('allows legacy opaque clientId when JWT enforcement is enabled', async () => {

    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';

    process.env.WIDGET_EMBED_TOKEN_SECRET = 'test-secret';

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

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

      getLocaleDirection: () => 'ltr',

      getTranslations: () => ({

        widgetConfigError: 'Widget Configuration Error',

        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',

        widgetConfigOurDocumentation: 'our documentation',

      }),

    }));

    const page = require('../app/embed/session/page').default;

    const params = {

      clientId: 'not-a-jwt-token',

      agentId: 'agent-1',

      configId: 'config-1',

      locale: 'en',

    };

    const element = await page({ searchParams: Promise.resolve(params) });

    const html = renderToStaticMarkup(element as any);

    expect(html).not.toContain('Unauthorized widget request');

    expect(html).toContain('data-embed-client="1"');

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();

  });

  test('returns config error when JWT enforcement is enabled but token secret is missing', async () => {

    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';

    delete process.env.WIDGET_EMBED_TOKEN_SECRET;

    delete process.env.WIDGET_EMBED_TOKEN_SECRET_PREVIOUS;

    delete process.env.WIDGET_EMBED_TOKEN_SECRET_NEXT;

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

      getLocaleDirection: () => 'ltr',

      getTranslations: () => ({

        widgetConfigError: 'Widget Configuration Error',

        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',

        widgetConfigOurDocumentation: 'our documentation',

      }),

    }));

    const page = require('../app/embed/session/page').default;

    const element = await page({

      searchParams: Promise.resolve({

        clientId: 'header.payload.signature',

        agentId: 'agent-1',

        configId: 'config-1',

        locale: 'en',

      }),

    });

    const html = renderToStaticMarkup(element as any);

    expect(html).toContain('Widget Configuration Error');

    expect(html).toContain('Widget token verification is enabled but not configured correctly.');

    expect(html).not.toContain('data-embed-client="1"');

  });

  test('returns unauthorized UI for JWT-like token with invalid signature', async () => {

    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';

    process.env.WIDGET_EMBED_TOKEN_SECRET = 'test-secret';

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

      getLocaleDirection: () => 'ltr',

      getTranslations: () => ({

        widgetConfigError: 'Widget Configuration Error',

        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',

        widgetConfigOurDocumentation: 'our documentation',

      }),

    }));

    const page = require('../app/embed/session/page').default;

    const element = await page({

      searchParams: Promise.resolve({

        clientId: 'header.payload.signature',

        agentId: 'agent-1',

        configId: 'config-1',

        locale: 'en',

      }),

    });

    const html = renderToStaticMarkup(element as any);

    expect(html).toContain('Unauthorized widget request');

    expect(html).not.toContain('data-embed-client="1"');

  });

  test('accepts token signed with previous secret during rotation', async () => {

    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';

    process.env.WIDGET_EMBED_TOKEN_SECRET = 'new-secret';

    process.env.WIDGET_EMBED_TOKEN_SECRET_PREVIOUS = 'old-secret';

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

      getLocaleDirection: () => 'ltr',

      getTranslations: () => ({

        widgetConfigError: 'Widget Configuration Error',

        widgetConfigMissingParams: 'Missing required parameters. Please ensure your widget script includes:',

        widgetConfigOurDocumentation: 'our documentation',

      }),

    }));

    const token = createToken({ exp: 4_102_444_800, agentId: 'agent-1' }, 'old-secret');

    const page = require('../app/embed/session/page').default;

    const element = await page({

      searchParams: Promise.resolve({

        clientId: token,

        agentId: 'agent-1',

        configId: 'config-1',

        locale: 'en',

      }),

    });

    const html = renderToStaticMarkup(element as any);

    expect(html).toContain('data-embed-client="1"');

  });

});

