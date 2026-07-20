import { validateConfig, inferWidgetType, MissingFieldError, InvalidValueError } from '../lib/validateConfig';

const baseConfig = {
  id: 'cfg-1',
  primary_color: '#000',
  secondary_color: '#fff',
  background_color: '#fff',
  text_color: '#000',
  border_radius: 8,
  start_open: false,
  hide_on_mobile: false,
  title: { en: 'Test' },
  subtitle: { en: 'Test' },
  placeholder: { en: 'Test' },
  greeting_message: { text: { en: 'Hi' }, buttons: [] },
  default_language: 'en',
  font_family: 'Inter',
  font_size: 14,
  font_weight: 'normal',
  shadow_intensity: 'md',
  shadow_color: '#000',
  size: 'md',
  button_size: 'md',
  message_bubble_radius: 8,
  button_border_radius: 6,
  opacity: 1,
  position: 'bottom-right' as const,
  edge_offset: 20,
};

describe('inferWidgetType', () => {
  it('returns chat when greeting_message is present', () => {
    expect(inferWidgetType({ greeting_message: { text: { en: 'Hi' } } })).toBe('chat');
  });

  it('returns chat when start_open is present', () => {
    expect(inferWidgetType({ start_open: false })).toBe('chat');
  });

  it('returns chat when show_unread_badge is present', () => {
    expect(inferWidgetType({ show_unread_badge: true })).toBe('chat');
  });

  it('returns chat as default fallback', () => {
    expect(inferWidgetType({})).toBe('chat');
  });
});

describe('validateConfig', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('accepts a chat config for chat runtime', () => {
    const config = { ...baseConfig, widget_type: 'chat' as const };
    const { config: result, typeMismatch } = validateConfig(config, 'chat');
    expect(result.widget_type).toBe('chat');
    expect(result.id).toBe('cfg-1');
    expect(typeMismatch).toBe(false);
  });

  it('accepts a docs config for docs runtime', () => {
    const config = { ...baseConfig, widget_type: 'docs' as const };
    const { config: result, typeMismatch } = validateConfig(config, 'docs');
    expect(result.widget_type).toBe('docs');
    expect(typeMismatch).toBe(false);
  });

  it('strips chat-only fields when type is docs', () => {
    const config = { ...baseConfig, widget_type: 'docs' as const };
    const { config: result } = validateConfig(config, 'docs') as any;
    expect(result.start_open).toBeUndefined();
    expect(result.greeting_message).toBeUndefined();
    expect(result.show_timestamps).toBeUndefined();
    expect(result.show_typing_indicator).toBeUndefined();
    expect(result.show_message_avatars).toBeUndefined();
    expect(result.show_unread_badge).toBeUndefined();
  });

  it('preserves position/edge_offset for docs (used for layout-style placement)', () => {
    const config = { ...baseConfig, widget_type: 'docs' as const };
    const { config: result } = validateConfig(config, 'docs') as any;
    expect(result.position).toBe('bottom-right');
    expect(result.edge_offset).toBe(20);
  });

  it('preserves non-chat fields for docs runtime', () => {
    const config = { ...baseConfig, widget_type: 'docs' as const };
    const { config: result } = validateConfig(config, 'docs');
    expect(result.id).toBe('cfg-1');
    expect(result.primary_color).toBe('#000');
    expect(result.font_family).toBe('Inter');
  });

  it('infers missing widget_type and logs deprecation warning', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { widget_type: _, ...configWithoutType } = baseConfig as any;
    validateConfig(configWithoutType, 'chat');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing widget_type')
    );
  });

  it('warns (not throws) in production on type mismatch and sets typeMismatch=true', () => {
    process.env.NODE_ENV = 'production';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { ...baseConfig, widget_type: 'chat' as const };
    const { typeMismatch } = validateConfig(config, 'docs');
    expect(typeMismatch).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Type mismatch')
    );
  });

  it('throws in development on type mismatch', () => {
    process.env.NODE_ENV = 'development';
    const config = { ...baseConfig, widget_type: 'chat' as const };
    expect(() => validateConfig(config, 'docs')).toThrow('Type mismatch');
  });

  it('throws MissingFieldError in development when id is absent', () => {
    process.env.NODE_ENV = 'development';
    const { id: _, ...noId } = baseConfig as any;
    expect(() => validateConfig(noId, 'chat')).toThrow(MissingFieldError);
    expect(() => validateConfig(noId, 'chat')).toThrow(/id/);
  });

  it('warns (not throws) in production when id is absent', () => {
    process.env.NODE_ENV = 'production';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { id: _, ...noId } = baseConfig as any;
    expect(() => validateConfig(noId, 'chat')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id'));
  });

  it('throws MissingFieldError in development when primary_color is absent', () => {
    process.env.NODE_ENV = 'development';
    const { primary_color: _, ...noPrimary } = baseConfig as any;
    expect(() => validateConfig(noPrimary, 'chat')).toThrow(MissingFieldError);
    expect(() => validateConfig(noPrimary, 'chat')).toThrow(/primary_color/);
  });

  it('MissingFieldError thrown by validateConfig includes a docLink', () => {
    process.env.NODE_ENV = 'development';
    const { id: _, ...noId } = baseConfig as any;
    try {
      validateConfig(noId, 'chat');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingFieldError);
      expect((e as MissingFieldError).docLink).toContain('docs.companin.tech');
    }
  });
});

// ── MissingFieldError ─────────────────────────────────────────────────────────

describe('MissingFieldError', () => {
  it('is an instance of Error', () => {
    expect(new MissingFieldError('apiKey')).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    expect(new MissingFieldError('apiKey').name).toBe('MissingFieldError');
  });

  it('message includes the field name', () => {
    const err = new MissingFieldError('apiKey');
    expect(err.message).toContain('apiKey');
  });

  it('message includes actionable add-field hint', () => {
    const err = new MissingFieldError('apiKey');
    expect(err.message).toContain('apiKey');
    expect(err.message.toLowerCase()).toContain('missing');
  });

  it('appends docLink when provided', () => {
    const err = new MissingFieldError('apiKey', '/docs/configuration#apiKey');
    expect(err.message).toContain('/docs/configuration#apiKey');
  });

  it('omits docLink section when not provided', () => {
    const err = new MissingFieldError('apiKey');
    expect(err.message).not.toContain('See:');
  });
});

// ── InvalidValueError ─────────────────────────────────────────────────────────

describe('InvalidValueError', () => {
  const validOptions = ['top-left', 'bottom-right', 'bottom-left'] as const;

  it('is an instance of Error', () => {
    expect(new InvalidValueError('position', 'top-center', validOptions)).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    expect(new InvalidValueError('position', 'top-center', validOptions).name).toBe('InvalidValueError');
  });

  it('message includes the field name', () => {
    const err = new InvalidValueError('position', 'top-center', validOptions);
    expect(err.message).toContain('position');
  });

  it('message includes the received value', () => {
    const err = new InvalidValueError('position', 'top-center', validOptions);
    expect(err.message).toContain('top-center');
  });

  it('message includes at least one valid option', () => {
    const err = new InvalidValueError('position', 'top-center', validOptions);
    expect(err.message).toContain('bottom-right');
  });

  it('appends docLink when provided', () => {
    const err = new InvalidValueError('position', 'top-center', validOptions, '/docs/configuration#position');
    expect(err.message).toContain('/docs/configuration#position');
  });

  it('omits docLink section when not provided', () => {
    const err = new InvalidValueError('position', 'top-center', validOptions);
    expect(err.message).not.toContain('See:');
  });
});
