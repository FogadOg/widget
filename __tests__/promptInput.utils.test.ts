import {
  convertBlobUrlToDataUrl,
  matchesAccept,
} from '../src/components/ai-elements/prompt-input.utils';

const file = (type: string) => new File(['x'], 'f', { type });

describe('matchesAccept', () => {
  test.each([[undefined], [''], ['   ']])('accepts anything when accept is %p', (accept) => {
    expect(matchesAccept(file('application/pdf'), accept as string | undefined)).toBe(true);
  });

  test('matches an exact MIME type', () => {
    expect(matchesAccept(file('image/png'), 'image/png')).toBe(true);
    expect(matchesAccept(file('image/jpeg'), 'image/png')).toBe(false);
  });

  test('matches a wildcard subtype', () => {
    expect(matchesAccept(file('image/webp'), 'image/*')).toBe(true);
    expect(matchesAccept(file('application/pdf'), 'image/*')).toBe(false);
  });

  test('accepts a file matching any pattern in a comma-separated list', () => {
    const accept = 'image/*, application/pdf';
    expect(matchesAccept(file('image/png'), accept)).toBe(true);
    expect(matchesAccept(file('application/pdf'), accept)).toBe(true);
    expect(matchesAccept(file('text/plain'), accept)).toBe(false);
  });

  test('tolerates whitespace and empty entries in the list', () => {
    expect(matchesAccept(file('image/png'), ' , image/png ,, ')).toBe(true);
  });

  test('rejects a file with no MIME type against a concrete pattern', () => {
    expect(matchesAccept(file(''), 'image/png')).toBe(false);
  });
});

describe('convertBlobUrlToDataUrl', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('reads the blob back as a data URL', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    global.fetch = jest.fn().mockResolvedValue({ blob: async () => blob }) as never;

    await expect(convertBlobUrlToDataUrl('blob:fake')).resolves.toMatch(/^data:/);
  });

  test('returns null when the fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('gone')) as never;
    await expect(convertBlobUrlToDataUrl('blob:missing')).resolves.toBeNull();
  });

  test('returns null when reading the blob fails', async () => {
    const blob = new Blob(['x']);
    global.fetch = jest.fn().mockResolvedValue({ blob: async () => blob }) as never;

    const spy = jest
      .spyOn(FileReader.prototype, 'readAsDataURL')
      .mockImplementation(function (this: FileReader) {
        this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
      });

    await expect(convertBlobUrlToDataUrl('blob:bad')).resolves.toBeNull();
    spy.mockRestore();
  });

  test('returns null when the response has no blob', async () => {
    global.fetch = jest.fn().mockResolvedValue({}) as never;
    await expect(convertBlobUrlToDataUrl('blob:empty')).resolves.toBeNull();
  });
});
