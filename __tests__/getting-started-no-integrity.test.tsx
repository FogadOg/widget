import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

jest.mock('../lib/embedManifest', () => ({
  getEmbedSrc: (_key: string) => ({ src: 'https://widget.companin.tech/widget.js', integrityAttr: '' }),
}));

jest.mock('../app/docs/getting-started/FrameworkTabs', () => {
  const FT = (props: any) => (
    <div data-testid="framework-tabs" data-has-snippets={String(!!props.snippets)} />
  );
  FT.displayName = 'FrameworkTabs';
  return FT;
});

import GettingStartedPage from '../app/docs/getting-started/page';

describe('app/docs/getting-started/page.tsx – integrityAttr empty', () => {
  it('renders correctly when no integrity attribute is present', async () => {
    const jsx = await (GettingStartedPage as any)();
    render(jsx);

    expect(screen.getByRole('heading', { name: /getting started/i, level: 1 })).toBeInTheDocument();
  });

  it('renders framework tabs with snippets when integrityAttr is empty', async () => {
    const jsx = await (GettingStartedPage as any)();
    render(jsx);

    // Confirm the page rendered FrameworkTabs; the snippet template literal
    // takes the false branch of: docsIntegrityAttr ? `\n  ${docsIntegrityAttr}` : ''
    const tabs = screen.getAllByTestId('framework-tabs');
    expect(tabs.length).toBeGreaterThan(0);
  });
});
