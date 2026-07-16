import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockPush = jest.fn();
const mockPathname = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}));

import LanguageSwitcher from '../app/components/LanguageSwitcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/en');
  });

  it('renders current locale uppercased', () => {
    render(<LanguageSwitcher locale="en" />);
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('renders current locale flag', () => {
    render(<LanguageSwitcher locale="de" />);
    expect(screen.getByText('DE')).toBeInTheDocument();
    // The switcher renders a flag image, not an emoji character.
    expect(screen.getAllByRole('img', { name: 'Deutsch' }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows all language options in dropdown', () => {
    render(<LanguageSwitcher locale="en" />);

    expect(screen.queryByText('English')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));

    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Norsk')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('Nederlands')).toBeInTheDocument();
    expect(screen.getByText('Português')).toBeInTheDocument();
    expect(screen.getByText('Svenska')).toBeInTheDocument();
    expect(screen.getByText('Italiano')).toBeInTheDocument();
    expect(screen.getByText('Polski')).toBeInTheDocument();
  });

  it('calls router.push with new locale path when switching', () => {
    mockPathname.mockReturnValue('/en');
    render(<LanguageSwitcher locale="en" />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
    fireEvent.click(screen.getByText('Deutsch'));

    expect(mockPush).toHaveBeenCalledWith('/de');
  });

  it('preserves sub-path when switching locale', () => {
    mockPathname.mockReturnValue('/en/docs/getting-started');
    render(<LanguageSwitcher locale="en" />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
    fireEvent.click(screen.getByText('Français'));

    expect(mockPush).toHaveBeenCalledWith('/fr/docs/getting-started');
  });

  it('does not push if same locale is selected', () => {
    mockPathname.mockReturnValue('/en');
    render(<LanguageSwitcher locale="en" />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
    fireEvent.click(screen.getByText('English'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to first language when locale not found', () => {
    render(<LanguageSwitcher locale="xx" />);
    // Falls back to first language (en)
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('handles path with no locale prefix', () => {
    mockPathname.mockReturnValue('/docs/getting-started');
    render(<LanguageSwitcher locale="en" />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
    fireEvent.click(screen.getByText('Norsk'));

    expect(mockPush).toHaveBeenCalledWith('/nb/docs/getting-started');
  });
});
