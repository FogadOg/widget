import { createHmac, timingSafeEqual } from 'node:crypto';

export type EmbedTokenClaims = {
  exp?: number;
  iss?: string;
  aud?: string | string[];
  assistantId?: string;
  assistant_id?: string;
  [key: string]: unknown;
};

type VerifyOptions = {
  requiredAudience?: string;
  requiredIssuer?: string;
  assistantId?: string;
  nowSeconds?: number;
};

const EMBED_TOKEN_SECRET_ENV_KEYS = [
  'WIDGET_EMBED_TOKEN_SECRET',
  'WIDGET_EMBED_TOKEN_SECRET_PREVIOUS',
  'WIDGET_EMBED_TOKEN_SECRET_NEXT',
] as const;

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
  return Buffer.from(padded, 'base64');
}

function parseJson<T>(value: Buffer): T | null {
  try {
    return JSON.parse(value.toString('utf8')) as T;
  } catch {
    return null;
  }
}

function isAudienceValid(aud: string | string[] | undefined, requiredAudience?: string): boolean {
  if (!requiredAudience) return true;
  if (!aud) return false;
  if (typeof aud === 'string') return aud === requiredAudience;
  return aud.includes(requiredAudience);
}

function readAssistantClaim(claims: EmbedTokenClaims): string | undefined {
  if (typeof claims.assistantId === 'string') return claims.assistantId;
  if (typeof claims.assistant_id === 'string') return claims.assistant_id;
  return undefined;
}

export function getEmbedTokenSecretsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const seen = new Set<string>();

  return EMBED_TOKEN_SECRET_ENV_KEYS
    .map((key) => (env[key] || '').trim())
    .filter((secret) => {
      if (!secret || seen.has(secret)) return false;
      seen.add(secret);
      return true;
    });
}

function verifyEmbedTokenWithSecret(
  token: string,
  secret: string,
  options?: VerifyOptions,
): EmbedTokenClaims | null {
  if (!token || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const header = parseJson<{ alg?: string; typ?: string }>(fromBase64Url(headerB64));
  const payload = parseJson<EmbedTokenClaims>(fromBase64Url(payloadB64));
  if (!header || !payload) return null;

  // Restrict to HMAC SHA-256 for predictable server-side verification.
  if (header.alg !== 'HS256') return null;

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = toBase64Url(
    createHmac('sha256', secret).update(signingInput).digest(),
  );

  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(signatureB64);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) return null;

  if (options?.requiredIssuer && payload.iss !== options.requiredIssuer) return null;
  if (!isAudienceValid(payload.aud, options?.requiredAudience)) return null;

  const claimAssistantId = readAssistantClaim(payload);
  if (options?.assistantId && claimAssistantId && claimAssistantId !== options.assistantId) {
    return null;
  }

  return payload;
}

export function verifyEmbedToken(
  token: string,
  secret: string | string[],
  options?: VerifyOptions,
): EmbedTokenClaims | null {
  const secrets = Array.isArray(secret) ? secret : [secret];

  for (const candidate of secrets) {
    const claims = verifyEmbedTokenWithSecret(token, candidate, options);
    if (claims) return claims;
  }

  return null;
}

export function shouldEnforceEmbedTokenValidation(): boolean {
  // Fail-closed in production: enforcement is on unless WIDGET_EMBED_ENFORCE_JWT
  // is explicitly set to '0' or 'false'. In non-production environments we keep
  // the previous opt-in behavior so local dev / tests don't require token mints.
  const raw = (process.env.WIDGET_EMBED_ENFORCE_JWT || '').toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  return process.env.NODE_ENV === 'production';
}

export function isJwtLikeClientId(clientId: string): boolean {
  if (!clientId || typeof clientId !== 'string') return false;
  const parts = clientId.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}
