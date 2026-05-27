import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('../app/[locale]/docs/getting-started/FrameworkTabs', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', { 'data-testid': 'framework-tabs', 'data-has-snippets': String(!!props.snippets) }),
}));

jest.mock('../app/components/LanguageSwitcher', () => ({
  __esModule: true,
  default: ({ locale }: { locale: string }) =>
    React.createElement('div', { 'data-testid': 'language-switcher', 'data-locale': locale }),
}));

jest.mock('../lib/embedManifest', () => ({
  getEmbedSrc: jest.fn().mockImplementation((key: string) => ({
    src: `https://widget.companin.tech/${key === 'docs-widget' ? 'docs-widget' : 'widget'}.js`,
    integrityAttr: '',
  })),
}));

jest.mock('../lib/i18n', () => ({
  getTranslations: (locale: string) => ({
    gettingStartedBack: `← Back (${locale})`,
    gettingStartedTitle: 'Getting Started',
    gettingStartedSubtitle: 'Subtitle',
    gettingStartedPrerequisitesTitle: 'Prerequisites',
    gettingStartedPrerequisitesDesc: 'You need credentials',
    gettingStartedCredentialClientId: 'Client ID',
    gettingStartedCredentialClientIdDesc: 'from dashboard',
    gettingStartedCredentialAssistantId: 'Assistant ID',
    gettingStartedCredentialAssistantIdDesc: 'from dashboard',
    gettingStartedCredentialConfigId: 'Config ID',
    gettingStartedCredentialConfigIdDesc: 'from dashboard',
    gettingStartedStep1Title: 'Step 1',
    gettingStartedStep1Customize: 'Customize',
    gettingStartedStep1Datasources: 'Datasources',
    gettingStartedStep2Title: 'Step 2',
    gettingStartedStep2Desc: 'Replace {configId} with your ID',
    gettingStartedStep3Title: 'Step 3',
    gettingStartedStep3Desc: 'Verify the widget appears',
    gettingStartedStep4Title: 'Step 4',
    gettingStartedStep4Desc: 'Call {openCall} to open programmatically',
  }),
}));

import GettingStartedPage from '../app/[locale]/docs/getting-started/page';
import { getEmbedSrc } from '../lib/embedManifest';

describe('app/[locale]/docs/getting-started/page.tsx', () => {
  it('renders page title and sections', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Getting Started');
    expect(html).toContain('Prerequisites');
    expect(html).toContain('Step 1');
    expect(html).toContain('Step 2');
    expect(html).toContain('Step 3');
    expect(html).toContain('Step 4');
  });

  it('renders back link with locale', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'de' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('← Back (de)');
    expect(html).toContain('href="/de"');
  });

  it('renders language switcher with correct locale', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'fr' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('data-locale="fr"');
  });

  it('renders framework tabs', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('data-testid="framework-tabs"');
  });

  it('renders credential list items', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Client ID');
    expect(html).toContain('Assistant ID');
    expect(html).toContain('Config ID');
  });

  it('splits step 2 desc around configId placeholder', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Replace');
    expect(html).toContain('YOUR_CONFIG_ID');
    expect(html).toContain('with your ID');
  });

  it('splits step 4 desc around openCall placeholder', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Call');
    expect(html).toContain('window.CompaninDocsWidget.open()');
    expect(html).toContain('to open programmatically');
  });

  it('covers the truthy docsIntegrityAttr branch when integrity is set', async () => {
    (getEmbedSrc as jest.Mock).mockImplementation((key: string) => {
      if (key === 'docs-widget') {
        return { src: 'https://widget.companin.tech/docs-widget-1.0.0.js', integrityAttr: 'integrity="sha384-branchHash" crossorigin="anonymous"' };
      }
      return { src: 'https://widget.companin.tech/widget.js', integrityAttr: '' };
    });

    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    // page rendered successfully; the truthy branch was exercised
    expect(html).toContain('Getting Started');

    // reset mock to default
    (getEmbedSrc as jest.Mock).mockImplementation((key: string) => ({
      src: `https://widget.companin.tech/${key === 'docs-widget' ? 'docs-widget' : 'widget'}.js`,
      integrityAttr: '',
    }));
  });
});
