import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import * as Sentry from '@sentry/nextjs';
import EmbedError from '../app/error';
import GlobalError from '../app/global-error';

/**
 * The widget had no error boundary of either kind, so a client render error
 * showed the customer's visitor a blank iframe and reported nothing. These pin
 * both halves: the error reaches Sentry, and the visitor gets localized copy
 * plus a working retry.
 */

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const captureException = Sentry.captureException as jest.Mock;

function setLocale(locale?: string) {
  const search = locale ? `?locale=${locale}` : '';
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setLocale('en');
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe.each([
  ['app/error.tsx (segment boundary)', EmbedError],
  ['app/global-error.tsx (root boundary)', GlobalError],
])('%s', (_name, Boundary: any) => {
  it('reports the error to Sentry', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });
    render(<Boundary error={error} reset={jest.fn()} />);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('shows the visitor a message and a retry control', () => {
    render(<Boundary error={new Error('boom')} reset={jest.fn()} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls reset when retry is clicked', () => {
    const reset = jest.fn();
    render(<Boundary error={new Error('boom')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the digest reference when Next provides one', () => {
    render(<Boundary error={Object.assign(new Error('boom'), { digest: 'abc123' })} reset={jest.fn()} />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('omits the reference line when there is no digest', () => {
    render(<Boundary error={new Error('boom')} reset={jest.fn()} />);
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it('localizes from the URL when no provider is available', () => {
    setLocale('de');
    render(<Boundary error={new Error('boom')} reset={jest.fn()} />);
    // German copy differs from the English string; assert we did not fall back.
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument();
  });

  it('falls back to English when the locale param is absent', () => {
    setLocale(undefined);
    render(<Boundary error={new Error('boom')} reset={jest.fn()} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
