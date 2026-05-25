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
import { renderDocsEmbedErrorCard } from '../app/embed/docs/renderEmbedErrorCard';

describe('Docs page server component', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('renders error UI when required params are missing', async () => {
    const element = await (DocsPage as any)({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Docs Assistant Configuration Error');
    expect(html).not.toContain('<html');
    expect(html).toContain('data-client-id');
    expect(html).toContain('data-assistant-id');
    expect(html).toContain('data-config-id');
  });

  test('renderEmbedErrorCard falls back to default error metadata when options are omitted', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const element = renderDocsEmbedErrorCard('en', 'Default Error Title', React.createElement('p', null, 'body'));
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Default Error Title');
    expect(html).toContain('/embed-error-reporter.js');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Companin Docs Embed Error]',
      expect.objectContaining({
        errorType: 'embed_error',
        title: 'Default Error Title',
        message: 'Default Error Title',
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  test('renders DocsClient with correct props when params provided', async () => {
    const params = {
      clientId: 'c1',
      assistantId: 'a1',
      configId: 'cfg',
      locale: 'en',
      startOpen: 'true',
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
    expect(props.suggestions).toBeUndefined();
    expect(props.pagePath).toBe('/doc');
  });

  test('applies default locale and false startOpen when optional params are omitted', async () => {
    const params = {
      clientId: 'c-default',
      assistantId: 'a-default',
      configId: 'cfg-default',
    };

    const element = await (DocsPage as any)({ searchParams: Promise.resolve(params) });
    const html = renderToStaticMarkup(element);

    const m = html.match(/data-props="([^"]*)"/);
    expect(m).toBeTruthy();
    const raw = m ? m[1] : '';
    const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const props = JSON.parse(decoded);

    expect(props.clientId).toBe('c-default');
    expect(props.assistantId).toBe('a-default');
    expect(props.configId).toBe('cfg-default');
    expect(props.locale).toBe('en');
    expect(props.startOpen).toBe(false);
    expect(props.pagePath).toBeUndefined();
    expect(props.parentOrigin).toBeUndefined();
  });

  test('renders DocsClient for legacy opaque clientId when JWT enforcement is enabled', async () => {
    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';
    process.env.WIDGET_EMBED_TOKEN_SECRET = 'test-secret';
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const element = await (DocsPage as any)({
      searchParams: Promise.resolve({
        clientId: 'not-a-jwt-token',
        assistantId: 'a1',
        configId: 'cfg',
        locale: 'en',
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain('Unauthorized widget request');
    expect(html).toContain('data-props=');
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  test('renders config error when JWT enforcement is enabled but token secret is missing', async () => {
    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';
    delete process.env.WIDGET_EMBED_TOKEN_SECRET;
    delete process.env.WIDGET_EMBED_TOKEN_SECRET_PREVIOUS;
    delete process.env.WIDGET_EMBED_TOKEN_SECRET_NEXT;

    const element = await (DocsPage as any)({
      searchParams: Promise.resolve({
        clientId: 'header.payload.signature',
        assistantId: 'a1',
        configId: 'cfg',
        locale: 'en',
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Docs Assistant Configuration Error');
    expect(html).toContain('Widget token verification is enabled but not configured correctly.');
  });

  test('renders unauthorized UI for JWT-like token with invalid signature', async () => {
    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';
    process.env.WIDGET_EMBED_TOKEN_SECRET = 'test-secret';

    const element = await (DocsPage as any)({
      searchParams: Promise.resolve({
        clientId: 'header.payload.signature',
        assistantId: 'a1',
        configId: 'cfg',
        locale: 'en',
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Unauthorized widget request');
    expect(html).not.toContain('data-props=');
  });

  test('renders DocsClient for valid JWT when enforcement is enabled', async () => {
    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';
    process.env.WIDGET_EMBED_TOKEN_SECRET = 'test-secret';

    const token = createToken({ exp: 4_102_444_800, assistantId: 'a1' }, 'test-secret');
    const element = await (DocsPage as any)({
      searchParams: Promise.resolve({
        clientId: token,
        assistantId: 'a1',
        configId: 'cfg',
        locale: 'en',
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-props=');
    expect(html).not.toContain('Unauthorized widget request');
  });
});
