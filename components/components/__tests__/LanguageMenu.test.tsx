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
  const openMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
  };

  it('shows the active locale flag on the trigger', () => {
    render(<LanguageMenu {...baseProps} locale="de-CH" onChange={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Select language' });
    expect(trigger.querySelector('img')).toHaveAttribute('src', '/flags/ch.svg');
  });

  it('renders all locale options when opened', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    openMenu();
    const items = screen.getAllByRole('menuitem');
    const labels = items.map((item) => item.getAttribute('title'));
    expect(labels).toEqual(['English', 'Deutsch', 'Français', 'Norsk']);
  });

  it('is collapsed until the trigger is clicked', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    openMenu();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  it('calls onChange with the chosen locale', () => {
    const onChange = jest.fn();
    render(<LanguageMenu {...baseProps} locale="en" onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Deutsch/i }));
    expect(onChange).toHaveBeenCalledWith('de');
  });

  it('does not call onChange when re-selecting the active locale', () => {
    const onChange = jest.fn();
    render(<LanguageMenu {...baseProps} locale="en" onChange={onChange} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /English/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the menu after a selection', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Français/i }));
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('closes the menu on outside pointer interaction', () => {
    render(
      <div>
        <LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />
        <button type="button">Outside</button>
      </div>
    );

    openMenu();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('closes the menu on Escape', () => {
    render(<LanguageMenu {...baseProps} locale="en" onChange={jest.fn()} />);

    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('falls back to a globe when no flag mapping exists', () => {
    render(<LanguageMenu {...baseProps} locale="eo" onChange={jest.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Select language' });
    expect(within(trigger).queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    expect(within(trigger).getByText('🌐')).toBeInTheDocument();
  });

  it('renders endonyms for runtime locales not present in static labels', () => {
    render(
      <LanguageMenu
        {...baseProps}
        locale="en"
        locales={['en', 'ja']}
        onChange={jest.fn()}
      />
    );

    openMenu();

    expect(screen.getByRole('menuitem', { name: /日本語/i })).toBeInTheDocument();
  });

  it('falls back to uppercased locale when Intl.DisplayNames is unavailable', () => {
    const originalDisplayNames = Intl.DisplayNames;
    const displayNamesMock = jest.fn(() => {
      throw new Error('unsupported');
    });
    Object.defineProperty(Intl, 'DisplayNames', {
      configurable: true,
      writable: true,
      value: displayNamesMock,
    });

    try {
      render(
        <LanguageMenu
          {...baseProps}
          locale="en"
          locales={['en', 'eo']}
          onChange={jest.fn()}
        />
      );

      openMenu();

      expect(screen.getByRole('menuitem', { name: /EO/i })).toBeInTheDocument();
    } finally {
      Object.defineProperty(Intl, 'DisplayNames', {
        configurable: true,
        writable: true,
        value: originalDisplayNames,
      });
    }
  });

  it('uses the subtle trigger styling for light surfaces', () => {
    render(
      <LanguageMenu
        {...baseProps}
        locale="en"
        variant="subtle"
        onChange={jest.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Select language' });
    expect(trigger).toHaveStyle({
      backgroundColor: 'transparent',
      color: '#111827',
      border: '1px solid #e5e7eb',
    });
  });
});
