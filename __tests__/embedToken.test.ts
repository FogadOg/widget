import { createHmac } from 'node:crypto';
import { shouldEnforceEmbedTokenValidation, verifyEmbedToken } from '../lib/embedToken';

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createToken(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = toBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = toBase64Url(createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

describe('embed token verification', () => {
  const secret = 'test-secret';
  const nowSeconds = 1_700_000_000;

  test('accepts valid HS256 token with matching claims', () => {
    const token = createToken(
      {
        exp: nowSeconds + 600,
        iss: 'issuer-a',
        aud: 'widget-audience',
        assistantId: 'assistant-1',
      },
      secret,
    );

    const claims = verifyEmbedToken(token, secret, {
      requiredIssuer: 'issuer-a',
      requiredAudience: 'widget-audience',
      assistantId: 'assistant-1',
      nowSeconds,
    });

    expect(claims).not.toBeNull();
    expect(claims?.iss).toBe('issuer-a');
  });

  test('rejects expired token', () => {
    const token = createToken({ exp: nowSeconds - 1 }, secret);
    const claims = verifyEmbedToken(token, secret, { nowSeconds });
    expect(claims).toBeNull();
  });

  test('rejects assistant mismatch when claim is present', () => {
    const token = createToken({ exp: nowSeconds + 600, assistant_id: 'assistant-a' }, secret);
    const claims = verifyEmbedToken(token, secret, {
      assistantId: 'assistant-b',
      nowSeconds,
    });
    expect(claims).toBeNull();
  });

  test('enforcement flag parser supports true/1 and defaults false', () => {
    const original = process.env.WIDGET_EMBED_ENFORCE_JWT;

    process.env.WIDGET_EMBED_ENFORCE_JWT = 'true';
    expect(shouldEnforceEmbedTokenValidation()).toBe(true);

    process.env.WIDGET_EMBED_ENFORCE_JWT = '1';
    expect(shouldEnforceEmbedTokenValidation()).toBe(true);

    process.env.WIDGET_EMBED_ENFORCE_JWT = 'false';
    expect(shouldEnforceEmbedTokenValidation()).toBe(false);

    delete process.env.WIDGET_EMBED_ENFORCE_JWT;
    expect(shouldEnforceEmbedTokenValidation()).toBe(false);

    if (original === undefined) {
      delete process.env.WIDGET_EMBED_ENFORCE_JWT;
    } else {
      process.env.WIDGET_EMBED_ENFORCE_JWT = original;
    }
  });
});
