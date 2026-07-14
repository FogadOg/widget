import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsentBanner } from '../components/components/ConsentBanner';

const props = {
  title: 'Remember this chat?',
  body: 'Nothing is stored until you agree.',
  acceptLabel: 'Allow',
  declineLabel: 'No thanks',
};

describe('ConsentBanner', () => {
  test('renders notice text and both actions', () => {
    render(<ConsentBanner {...props} onAccept={jest.fn()} onDecline={jest.fn()} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Remember this chat?')).toBeTruthy();
    expect(screen.getByText('Nothing is stored until you agree.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeTruthy();
  });

  test('fires the matching callback per button', () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    render(<ConsentBanner {...props} onAccept={onAccept} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

describe('storage consent persistence', () => {
  // The module holds consent state at module level; isolate per test.
  const freshModule = () => {
    let mod: typeof import('../lib/sessionStorage');
    jest.isolateModules(() => {
      mod = require('../lib/sessionStorage');
    });
    return mod!;
  };

  afterEach(() => {
    localStorage.clear();
  });

  test('grant persists the choice marker so the notice can be skipped next load', () => {
    const mod = freshModule();
    mod.setConsentRequired(true);
    expect(mod.isStorageConsentGranted()).toBe(false);
    expect(mod.hasPersistedConsentChoice()).toBe(false);

    mod.grantStorageConsent();
    expect(mod.isStorageConsentGranted()).toBe(true);
    expect(mod.hasPersistedConsentChoice()).toBe(true);

    // A fresh module (≈ next page load) sees the persisted accept.
    const next = freshModule();
    next.setConsentRequired(true);
    expect(next.hasPersistedConsentChoice()).toBe(true);
  });

  test('revoke clears the marker along with the other widget keys', () => {
    const mod = freshModule();
    mod.setConsentRequired(true);
    mod.grantStorageConsent();
    expect(mod.hasPersistedConsentChoice()).toBe(true);

    mod.revokeStorageConsent();
    expect(mod.isStorageConsentGranted()).toBe(false);
    expect(mod.hasPersistedConsentChoice()).toBe(false);
  });
});
