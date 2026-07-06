import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageMenu } from '../LanguageMenu';

const baseProps = {
  locales: ['en', 'de', 'fr', 'nb'],
  label: 'Select language',
  headerTextColor: '#ffffff',
  secondaryColor: '#333333',
  primaryColor: '#2563eb',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  borderColor: '#e5e7eb',
  fontStyles: {},
  borderRadius: 8,
};

describe('LanguageMenu', () => {
  it('shows the active locale as an uppercased short code', () => {
    render(<LanguageMenu {...baseProps} locale="de-CH" onChange={jest.fn()} />);
    expect(screen.getByText('DE')).toBeInTheDocument();
  });

  it('opens on click and lists languages by native name', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('Norsk')).toBeInTheDocument();
  });

  it('marks the active locale as checked', () => {
    render(<LanguageMenu {...baseProps} locale="fr" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    const checked = screen.getByRole('menuitemradio', { checked: true });
    expect(checked).toHaveTextContent('Français');
  });

  it('calls onChange with the chosen locale and closes the menu', () => {
    const onChange = jest.fn();
    render(<LanguageMenu {...baseProps} locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByText('Deutsch'));
    expect(onChange).toHaveBeenCalledWith('de');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not call onChange when re-selecting the active locale', () => {
    const onChange = jest.fn();
    render(<LanguageMenu {...baseProps} locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByText('English'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on Escape without collapsing the widget (stops propagation)', () => {
    const parentEscape = jest.fn();
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') parentEscape(); }}>
        <LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    const activeOption = screen.getByRole('menuitemradio', { checked: true });
    fireEvent.keyDown(activeOption, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Escape must not bubble to the host, which would also collapse the widget.
    expect(parentEscape).not.toHaveBeenCalled();
  });
});
