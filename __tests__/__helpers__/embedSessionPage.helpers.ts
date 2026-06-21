import React from 'react';

import { createHmac } from 'node:crypto';

import { DEFAULT_TRANSLATIONS } from '../__fixtures__/embedSessionPage.fixtures';

export function toBase64Url(input: Buffer): string {

  return input

    .toString('base64')

    .replace(/\+/g, '-')

    .replace(/\//g, '_')

    .replace(/=+$/g, '');

}

export function createToken(payload: Record<string, unknown>, secret: string): string {

  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = toBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));

  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));

  const signingInput = `${headerB64}.${payloadB64}`;

  const sig = toBase64Url(createHmac('sha256', secret).update(signingInput).digest());

  return `${signingInput}.${sig}`;

}

export function setupEmbedClientMock(embedClientPath: string): void {

  jest.doMock(embedClientPath, () => ({

    __esModule: true,

    default: (props: any) => React.createElement('div', { 'data-embed-client': '1', 'data-props': JSON.stringify(props) })

  }));

}

export function setupErrorBoundaryMock(errorBoundaryPath: string): void {

  jest.doMock(errorBoundaryPath, () => ({

    __esModule: true,

    default: ({ children }: any) => React.createElement('div', { 'data-error-boundary': '1' }, children)

  }));

}

export function setupI18nMock(i18nPath: string): void {

  jest.doMock(i18nPath, () => ({

    getLocaleDirection: () => 'ltr',

    getTranslations: () => DEFAULT_TRANSLATIONS,

  }));

}

export function setupAllMocks(): void {

  const embedClientPath = require.resolve('../../app/embed/session/EmbedClient');

  const errorBoundaryPath = require.resolve('../../components/ErrorBoundary');

  const i18nPath = require.resolve('../../lib/i18n');

  setupEmbedClientMock(embedClientPath);

  setupErrorBoundaryMock(errorBoundaryPath);

  setupI18nMock(i18nPath);

}
