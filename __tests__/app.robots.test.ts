import robots from '../app/robots';

describe('app/robots', () => {
  it('disallows all crawlers from all paths', () => {
    const result = robots();
    expect(result).toEqual({
      rules: [
        {
          userAgent: '*',
          disallow: '/',
        },
      ],
    });
  });

  it('returns a rules array with one entry', () => {
    const result = robots();
    expect(Array.isArray(result.rules)).toBe(true);
    expect(result.rules).toHaveLength(1);
  });

  it('targets all user agents', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule).toMatchObject({ userAgent: '*' });
  });
});
