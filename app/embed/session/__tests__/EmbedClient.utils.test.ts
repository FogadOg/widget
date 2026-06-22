import { injectGoogleFont, injectCustomAssetsFromConfig } from '../EmbedClient.utils';

jest.mock('../../../../lib/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../../../../lib/cssValidator', () => ({ sanitizeCss: jest.fn((s: string) => s) }));

describe('injectGoogleFont', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    jest.clearAllMocks();
  });

  it('appends a stylesheet link for the given font family', () => {
    injectGoogleFont('Inter');
    const link = document.head.querySelector('link');
    expect(link).not.toBeNull();
    expect(link?.rel).toBe('stylesheet');
  });

  it('points to the Google Fonts CDN', () => {
    injectGoogleFont('Inter');
    const link = document.head.querySelector('link');
    expect(link?.href).toContain('fonts.googleapis.com');
  });

  it('includes the font family name in the URL', () => {
    injectGoogleFont('Poppins');
    const link = document.head.querySelector('link');
    expect(link?.href).toContain('Poppins');
  });

  it('URL-encodes font families with spaces', () => {
    injectGoogleFont('Open Sans');
    const link = document.head.querySelector('link');
    expect(link?.href).toContain('Open%20Sans');
  });

  it('sets a stable id on the link element', () => {
    injectGoogleFont('Roboto');
    const link = document.head.querySelector('link');
    expect(link?.id).toBe('gf-roboto');
  });

  it('generates the id from the font name in lower-kebab-case', () => {
    injectGoogleFont('Plus Jakarta Sans');
    const link = document.head.querySelector('link');
    expect(link?.id).toBe('gf-plus-jakarta-sans');
  });

  it('is idempotent — a second call for the same font does not add another link', () => {
    injectGoogleFont('Lato');
    injectGoogleFont('Lato');
    expect(document.head.querySelectorAll('link').length).toBe(1);
  });

  it('loads different fonts independently', () => {
    injectGoogleFont('Inter');
    injectGoogleFont('Roboto');
    expect(document.head.querySelectorAll('link').length).toBe(2);
  });

  it('requests multiple weights for flexibility', () => {
    injectGoogleFont('Montserrat');
    const href = document.head.querySelector('link')?.href ?? '';
    // Should request at least regular (400) and a bold weight
    expect(href).toContain('400');
    expect(href).toContain('700');
  });

  it('does nothing when fontFamily is an empty string', () => {
    injectGoogleFont('');
    expect(document.head.querySelectorAll('link').length).toBe(0);
  });

  it('handles DOM errors gracefully without throwing', () => {
    jest.spyOn(document.head, 'appendChild').mockImplementationOnce(() => {
      throw new Error('DOM error');
    });
    expect(() => injectGoogleFont('Inter')).not.toThrow();
  });

  it('logs the error when DOM injection fails', () => {
    const { logError } = require('../../../../lib/errorHandling');
    jest.spyOn(document.head, 'appendChild').mockImplementationOnce(() => {
      throw new Error('DOM error');
    });
    injectGoogleFont('Inter');
    expect(logError).toHaveBeenCalled();
  });
});

describe('injectCustomAssetsFromConfig — Google Font integration', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    jest.clearAllMocks();
  });

  it('does nothing when config is null', () => {
    injectCustomAssetsFromConfig(null);
    expect(document.head.querySelectorAll('style').length).toBe(0);
  });

  it('does nothing when config is undefined', () => {
    injectCustomAssetsFromConfig(undefined);
    expect(document.head.querySelectorAll('style').length).toBe(0);
  });

  it('does nothing when custom_css is empty', () => {
    injectCustomAssetsFromConfig({ custom_css: '' });
    expect(document.head.querySelectorAll('style').length).toBe(0);
  });
});
