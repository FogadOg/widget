import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockLocaleHomePage = jest.fn(() => React.createElement('div', { 'data-testid': 'locale-home' }));

jest.mock('../app/[locale]/page', () => ({
  __esModule: true,
  default: (props: unknown) => mockLocaleHomePage(props),
}));

import RootPage from '../app/page';

describe('app/page.tsx (root english render)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the locale home page', () => {
    const html = renderToStaticMarkup(RootPage() as React.ReactElement);
    expect(html).toContain('data-testid="locale-home"');
  });

  it('passes en locale params to the locale page', async () => {
    renderToStaticMarkup(RootPage() as React.ReactElement);
    expect(mockLocaleHomePage).toHaveBeenCalledTimes(1);
    const props = mockLocaleHomePage.mock.calls[0]?.[0] as { params: Promise<{ locale: string }> };
    await expect(props.params).resolves.toEqual({ locale: 'en' });
  });
});
