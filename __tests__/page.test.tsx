import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
// Mock next/navigation hooks used by `LanguageSwitcher`
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/en',
}));

import Home from '../app/[locale]/page';

describe('Home Page', () => {
  it('renders the main heading', async () => {
    // `Home` is an async server component — resolve it before rendering.
    const jsx = await (Home as any)({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);

    expect(screen.getByText('Customer Support AI Agent Widget')).toBeInTheDocument();
  });

  it('renders the description', async () => {
    const jsx2 = await (Home as any)({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx2);
    expect(screen.getByText('Customer Support AI Agent chat widget for your website')).toBeInTheDocument();
  });

  it('renders Get Started button', async () => {
    const jsx3 = await (Home as any)({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx3);
    const getStartedLink = screen.getByText('Get Started').closest('a');
    expect(getStartedLink).toHaveAttribute('href', '/en/docs/getting-started');
  });

  it('renders View Demo button', async () => {
    const jsx4 = await (Home as any)({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx4);
    const viewDemoLink = screen.getByText('View Demo').closest('a');
    expect(viewDemoLink).toHaveAttribute('href', '/en/docs/getting-started');
  });

  it('renders feature cards', async () => {
    const jsx5 = await (Home as any)({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx5);
    expect(screen.getByText('Easy Integration')).toBeInTheDocument();
    expect(screen.getByText('Customizable')).toBeInTheDocument();
    expect(screen.getByText('Multi-language')).toBeInTheDocument();
  });

  it('renders with correct layout structure', async () => {
    const jsx6 = await (Home as any)({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx6);
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('flex', 'min-h-screen', 'w-full', 'max-w-3xl');
  });
});