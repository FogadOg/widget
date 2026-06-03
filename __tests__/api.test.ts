 
import { getApiBaseUrl, getApiV1BaseUrl, API, isApiConfigured } from '../lib/api';

const mockEnv = async (env: Record<string, string | undefined>) => {
  const originalEnv = process.env;
  process.env = { ...originalEnv, ...env };
  // Force module reload
  jest.resetModules();
  const apiModule = await import('../lib/api');
  process.env = originalEnv;
  return apiModule;
};

describe('API utilities', () => {
  describe('getApiBaseUrl', () => {
    it('returns the API base URL from environment variable', async () => {
      const { getApiBaseUrl } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(getApiBaseUrl()).toBe('https://api.example.com');
    });

    it('returns empty string when environment variable is not set', async () => {
      const { getApiBaseUrl } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: undefined });
      expect(getApiBaseUrl()).toBe('');
    });
  });

  describe('getApiV1BaseUrl', () => {
    it('returns the API v1 base URL', async () => {
      const { getApiV1BaseUrl } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(getApiV1BaseUrl()).toBe('https://api.example.com/api/v1');
    });

    it('returns /api/v1 when base URL is empty', async () => {
      const { getApiV1BaseUrl } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: undefined });
      expect(getApiV1BaseUrl()).toBe('/api/v1');
    });
  });

  describe('API endpoints', () => {
    it('constructs widgetToken endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.widgetToken()).toBe('https://api.example.com/api/v1/auth/widget-token');
    });

    it('constructs sessions endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.sessions()).toBe('https://api.example.com/api/v1/sessions/');
    });

    it('constructs session endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.session('123')).toBe('https://api.example.com/api/v1/sessions/123');
    });

    it('constructs sessionMessages endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.sessionMessages('123')).toBe('https://api.example.com/api/v1/sessions/123/messages');
    });

    it('constructs sessionFeedback endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.sessionFeedback('123')).toBe('https://api.example.com/api/v1/sessions/123/feedback');
    });

    it('constructs messageFeedback endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.messageFeedback('456')).toBe('https://api.example.com/api/v1/message/456/feedback');
    });

    it('constructs agent endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.agent('789')).toBe('https://api.example.com/api/v1/agents/789');
    });

    it('constructs widgetConfig endpoint correctly', async () => {
      const { API } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(API.widgetConfig('config123')).toBe('https://api.example.com/widget-config/config123/public/');
    });
  });

  describe('embedOriginHeader', () => {
    it('returns origin when window.location is available', async () => {
      const { embedOriginHeader } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      // jsdom should provide a window.location.origin
      expect(embedOriginHeader()).toEqual({ 'X-Embed-Origin': window.location.origin });
    });

    it('uses explicitOrigin when provided', async () => {
      const { embedOriginHeader } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(embedOriginHeader('https://parent.example.com')).toEqual({
        'X-Embed-Origin': 'https://parent.example.com',
      });
    });

    it('explicitOrigin takes precedence over window.location.origin', async () => {
      const { embedOriginHeader } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      // window.location.origin exists in jsdom, but explicit arg must win
      const result = embedOriginHeader('https://host-page.com');
      expect(result).toEqual({ 'X-Embed-Origin': 'https://host-page.com' });
      expect(result['X-Embed-Origin']).not.toBe(window.location.origin);
    });
  });

  describe('isApiConfigured', () => {
    it('returns true when BASE_URL is set and does not contain undefined', async () => {
      const { isApiConfigured } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com' });
      expect(isApiConfigured()).toBe(true);
    });

    it('returns false when BASE_URL is not set', async () => {
      const { isApiConfigured } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: undefined });
      expect(isApiConfigured()).toBe(false);
    });

    it('returns false when BASE_URL contains undefined', async () => {
      const { isApiConfigured } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: 'https://undefined.example.com' });
      expect(isApiConfigured()).toBe(false);
    });

    it('returns false when BASE_URL is empty string', async () => {
      const { isApiConfigured } = await mockEnv({ NEXT_PUBLIC_API_BASE_URL: '' });
      expect(isApiConfigured()).toBe(false);
    });
  });
});