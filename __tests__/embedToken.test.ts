import { createHmac } from 'node:crypto';
import { getEmbedTokenSecretsFromEnv, isJwtLikeClientId, shouldEnforceEmbedTokenValidation, verifyEmbedToken } from '../lib/embedToken';

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

  test('rejects token with malformed JSON payload (parseJson catch branch)', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = toBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));
    const payloadB64 = toBase64Url(Buffer.from('{not valid json}', 'utf8'));
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = toBase64Url(createHmac('sha256', secret).update(signingInput).digest());
    const token = `${signingInput}.${sig}`;

    expect(verifyEmbedToken(token, secret, { nowSeconds })).toBeNull();
  });

  test('accepts token with array audience containing requiredAudience', () => {
    const token = createToken(
      { exp: nowSeconds + 600, aud: ['widget-audience', 'other-aud'] },
      secret,
    );
    const claims = verifyEmbedToken(token, secret, {
      requiredAudience: 'widget-audience',
      nowSeconds,
    });
    expect(claims).not.toBeNull();
  });

  test('rejects token with array audience not containing requiredAudience', () => {
    const token = createToken(
      { exp: nowSeconds + 600, aud: ['other-aud'] },
      secret,
    );
    const claims = verifyEmbedToken(token, secret, {
      requiredAudience: 'widget-audience',
      nowSeconds,
    });
    expect(claims).toBeNull();
  });

  test('accepts token with no assistant claim even when assistantId option is set', () => {
    // readAssistantClaim returns undefined → the mismatch guard is skipped
    const token = createToken({ exp: nowSeconds + 600 }, secret);
    const claims = verifyEmbedToken(token, secret, {
      assistantId: 'some-assistant',
      nowSeconds,
    });
    expect(claims).not.toBeNull();
  });

  test('accepts token signed with a fallback secret during rotation', () => {
    const token = createToken({ exp: nowSeconds + 600, assistantId: 'assistant-1' }, 'old-secret');

    const claims = verifyEmbedToken(token, ['new-secret', 'old-secret'], {
      assistantId: 'assistant-1',
      nowSeconds,
    });

    expect(claims).not.toBeNull();
  });

  test('collects unique embed token secrets from environment in priority order', () => {
    const secrets = getEmbedTokenSecretsFromEnv({
      WIDGET_EMBED_TOKEN_SECRET: 'current-secret',
      WIDGET_EMBED_TOKEN_SECRET_PREVIOUS: 'previous-secret',
      WIDGET_EMBED_TOKEN_SECRET_NEXT: 'current-secret',
    });

    expect(secrets).toEqual(['current-secret', 'previous-secret']);
  });

  test('detects JWT-like and legacy client IDs', () => {
    expect(isJwtLikeClientId('aaa.bbb.ccc')).toBe(true);
    expect(isJwtLikeClientId('FNmmyrtzakdIrBkfwkl09QpxwdOpq7nbzP02ik_EXdM')).toBe(false);
    expect(isJwtLikeClientId('')).toBe(false);
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
