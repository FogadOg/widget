import React from 'react';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('../app/dev/DevHarness', () => ({
  __esModule: true,
  default: () => <div data-testid="dev-harness" />,
}));

import DevPage, { metadata } from '../app/dev/page';
import { notFound } from 'next/navigation';

describe('DevPage', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true });
    jest.clearAllMocks();
  });

  it('marks the route as noindex/nofollow', () => {
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it('renders the DevHarness outside production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true });
    const element = DevPage() as React.ReactElement;
    expect(element.type).toBeDefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('returns 404 in production', () => {
    process.env.NODE_ENV = 'production';
    expect(process.env.NODE_ENV).toBe('production');
    let prodPage: typeof DevPage = DevPage;
    jest.isolateModules(() => {
      prodPage = require('../app/dev/page').default;
    });
    expect(() => prodPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
