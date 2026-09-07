import { renderHook } from '@testing-library/react';
import { useWidgetResize } from '../app/embed/session/hooks/useWidgetResize';
import { EMBED_EVENTS } from '../lib/embedConstants';
import { DEFAULTS, SIZE_PRESETS } from '../lib/constants';

const config = (over: Record<string, unknown> = {}) =>
  ({ position: 'bottom-right', button_size: 'md', ...over }) as never;

const baseArgs = {
  widgetConfig: config(),
  isCollapsed: true,
  teaserExpanded: false,
  teaserSize: null,
  initialParentOrigin: 'https://host.example',
  parentTargetOrigin: 'https://host.example',
};

const run = (over: Record<string, unknown> = {}) => {
  const safePostToParent = jest.fn();
  renderHook(() =>
    useWidgetResize({ ...(baseArgs as never), ...(over as never), safePostToParent }),
  );
  return safePostToParent;
};

/** The data payload of the last RESIZE message. */
const lastResize = (post: jest.Mock) =>
  post.mock.calls.at(-1)?.[0]?.data as Record<string, number | string>;

describe('useWidgetResize', () => {
  const realParent = window.parent;

  beforeAll(() => {
    // The hook only posts when embedded in a different frame.
    Object.defineProperty(window, 'parent', { value: {}, configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(window, 'parent', { value: realParent, configurable: true });
  });

  test('posts a RESIZE message to the host', () => {
    const post = run();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: EMBED_EVENTS.RESIZE }),
    );
  });

  test('sends the position and edge offset with every resize', () => {
    const post = run({ widgetConfig: config({ position: 'bottom-left' }) });
    expect(lastResize(post)).toMatchObject({ position: 'bottom-left' });
    expect(lastResize(post)).toHaveProperty('edge_offset');
  });

  test('defaults the position when the config omits it', () => {
    const post = run({ widgetConfig: config({ position: undefined }) });
    expect(lastResize(post)).toMatchObject({ position: 'bottom-right' });
  });

  test('posts nothing without a config', () => {
    const post = run({ widgetConfig: null });
    expect(post).not.toHaveBeenCalled();
  });

  describe('collapsed', () => {
    test('sizes the iframe to the launcher plus hover padding', () => {
      const post = run({ isCollapsed: true });
      const { width, height } = lastResize(post);
      expect(width).toBe(height);
      expect(Number(width)).toBeGreaterThan(0);
    });

    test('grows for a larger launcher', () => {
      const small = lastResize(run({ widgetConfig: config({ button_size: 'sm' }) })).width;
      const large = lastResize(run({ widgetConfig: config({ button_size: 'lg' }) })).width;
      expect(Number(large)).toBeGreaterThan(Number(small));
    });

    test('stays launcher-sized while no teaser is live', () => {
      // An oversized invisible iframe would block clicks on the host page.
      const collapsed = lastResize(run({ teaserExpanded: false }));
      expect(collapsed.width).toBe(collapsed.height);
    });
  });

  describe('teaser expanded', () => {
    test('grows to fit the bubble above the launcher', () => {
      const collapsed = lastResize(run({ teaserExpanded: false }));
      const withTeaser = lastResize(run({ teaserExpanded: true }));

      expect(Number(withTeaser.height)).toBeGreaterThan(Number(collapsed.height));
      expect(Number(withTeaser.width)).toBeGreaterThan(Number(collapsed.width));
    });

    test('hugs the measured bubble once it reports its size', () => {
      const estimated = lastResize(run({ teaserExpanded: true, teaserSize: null }));
      const measured = lastResize(
        run({ teaserExpanded: true, teaserSize: { width: 400, height: 120 } }),
      );

      expect(Number(measured.width)).toBeGreaterThan(Number(estimated.width));
      expect(Number(measured.height)).toBeGreaterThan(Number(estimated.height));
    });

    test('never shrinks below the launcher footprint for a tiny bubble', () => {
      const collapsed = lastResize(run({ teaserExpanded: false }));
      const tiny = lastResize(
        run({ teaserExpanded: true, teaserSize: { width: 10, height: 10 } }),
      );

      expect(Number(tiny.width)).toBeGreaterThanOrEqual(Number(collapsed.width));
    });
  });

  describe('expanded', () => {
    test('uses the default panel size', () => {
      const post = run({ isCollapsed: false });
      expect(lastResize(post)).toMatchObject({
        width: DEFAULTS.WIDGET_WIDTH,
        height: DEFAULTS.WIDGET_HEIGHT,
      });
    });

    test('prefers a named size preset', () => {
      const presetName = Object.keys(SIZE_PRESETS)[0];
      const preset = (SIZE_PRESETS as Record<string, { w: number; h: number }>)[presetName];

      const post = run({ isCollapsed: false, widgetConfig: config({ size: presetName }) });

      expect(lastResize(post)).toMatchObject({ width: preset.w, height: preset.h });
    });

    test('falls back to the default for an unknown preset', () => {
      const post = run({ isCollapsed: false, widgetConfig: config({ size: 'gigantic' }) });
      expect(lastResize(post)).toMatchObject({ width: DEFAULTS.WIDGET_WIDTH });
    });
  });

  test('posts nothing when not embedded in another frame', () => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    const post = run();
    expect(post).not.toHaveBeenCalled();
    Object.defineProperty(window, 'parent', { value: {}, configurable: true });
  });
});
