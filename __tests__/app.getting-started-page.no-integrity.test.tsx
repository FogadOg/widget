import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('../lib/embedManifest', () => ({
  getEmbedSrc: (_key: string) => ({ src: 'https://widget.companin.tech/widget.js', integrityAttr: '' }),
}));

jest.mock('../app/[locale]/docs/getting-started/FrameworkTabs', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement('div', {
      'data-testid': 'framework-tabs',
      'data-has-snippets': String(!!props.snippets),
    }),
}));

jest.mock('../app/components/LanguageSwitcher', () => ({
  __esModule: true,
  default: ({ locale }: { locale: string }) =>
    React.createElement('div', { 'data-testid': 'language-switcher', 'data-locale': locale }),
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
    gettingStartedCredentialAgentId: 'Agent ID',
    gettingStartedCredentialAgentIdDesc: 'from dashboard',
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

describe('app/[locale]/docs/getting-started/page.tsx – integrityAttr empty', () => {
  it('renders correctly when no integrity attribute is present', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('Getting Started');
    expect(html).toContain('data-testid="framework-tabs"');
    // When integrityAttr is empty, the ternary takes the false branch:
    // docsIntegrityAttr ? `\n  ${docsIntegrityAttr}` : ''
    // The snippet should NOT contain an integrity attribute line
    expect(html).not.toContain('integrity=');
  });

  it('renders step 4 framework tabs with snippets', async () => {
    const element = await GettingStartedPage({ params: Promise.resolve({ locale: 'en' }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain('data-has-snippets="true"');
  });
});
