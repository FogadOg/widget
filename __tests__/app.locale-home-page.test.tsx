import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('../app/components/LanguageSwitcher', () => ({
  __esModule: true,
  default: ({ locale }: { locale: string }) =>
    React.createElement('div', { 'data-testid': 'language-switcher', 'data-locale': locale }),
}));

jest.mock('../lib/i18n', () => ({
  getTranslations: (locale: string) => ({
    appTitle: `Widget Title (${locale})`,
    appDescription: 'Widget description',
    getStarted: 'Get Started',
    viewDemo: 'View Demo',
    easyIntegrationTitle: 'Easy Integration',
    easyIntegrationDesc: 'Add with a script tag',
    customizableTitle: 'Customizable',
    customizableDesc: 'Match your brand',
    multilanguageTitle: 'Multi-language',
    multilanguageDesc: 'Support 9 languages',
  }),
}));

import LocaleHomePage from '../app/[locale]/page';

describe('app/[locale]/page.tsx', () => {
  it('renders page title with locale translation', async () => {
    const element = await LocaleHomePage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Widget Title (en)');
    expect(html).toContain('Widget description');
  });

  it('renders Get Started link pointing to locale docs', async () => {
    const element = await LocaleHomePage({ params: Promise.resolve({ locale: 'de' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('href="/de/docs/getting-started"');
    expect(html).toContain('Get Started');
  });

  it('renders View Demo link', async () => {
    const element = await LocaleHomePage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('View Demo');
    expect(html).toContain('href="/en/docs/getting-started"');
  });

  it('renders language switcher with correct locale', async () => {
    const element = await LocaleHomePage({ params: Promise.resolve({ locale: 'fr' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('data-locale="fr"');
  });

  it('renders feature cards', async () => {
    const element = await LocaleHomePage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Easy Integration');
    expect(html).toContain('Customizable');
    expect(html).toContain('Multi-language');
  });

  it('renders correct title for different locale', async () => {
    const element = await LocaleHomePage({ params: Promise.resolve({ locale: 'nb' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Widget Title (nb)');
  });
});
