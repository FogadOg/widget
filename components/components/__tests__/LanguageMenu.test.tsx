import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  it('shows the active locale as an uppercased short code on the trigger', () => {
    render(<LanguageMenu {...baseProps} locale="de-CH" onChange={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Select language' });
    expect(trigger).toHaveTextContent('DE');
  });

  it('renders all locale options when opened', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    const items = screen.getAllByRole('menuitem');
    const codes = items.map((item) => within(item).getByText(/^[A-Z]{2,}$/).textContent);
    expect(codes).toEqual(['EN', 'DE', 'FR', 'NB']);
  });

  it('is collapsed until the trigger is clicked', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  it('calls onChange with the chosen locale', () => {
    const onChange = jest.fn();
    render(<LanguageMenu {...baseProps} locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Deutsch/i }));
    expect(onChange).toHaveBeenCalledWith('de');
  });

  it('does not call onChange when re-selecting the active locale', () => {
    const onChange = jest.fn();
    render(<LanguageMenu {...baseProps} locale="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /English/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the menu after a selection', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Français/i }));
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });
});
