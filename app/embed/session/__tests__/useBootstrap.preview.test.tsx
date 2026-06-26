import { renderHook, waitFor } from '@testing-library/react';

import { useBootstrap } from '../hooks/useBootstrap';

// Stub the DOM-mutating asset injectors so we can assert calls without side effects.
jest.mock('../EmbedClient.utils', () => ({
  injectCustomAssetsFromConfig: jest.fn(),
  injectGoogleFont: jest.fn(),
}));

// Control the validated config the hook applies in preview mode.
jest.mock('../../../../lib/validateConfig', () => ({
  validateConfig: jest.fn(),
}));

import { injectCustomAssetsFromConfig, injectGoogleFont } from '../EmbedClient.utils';
import { validateConfig } from '../../../../lib/validateConfig';

// Preview mode short-circuits before any auth/API work, so the rest of the
// dependencies can be inert no-ops.
function baseProps(previewConfig: string | undefined) {
  return {
    initialPreviewConfig: previewConfig,
    initialClientId: '',
    initialAgentId: '',
    initialConfigId: '',
    initialParentOrigin: undefined,
    sessionStorageKey: 'k',
    getAuthToken: jest.fn(),
    scheduleAutoRefresh: jest.fn(),
    getTokenExpiresAt: undefined,
    setWidgetConfig: jest.fn(),
    setIsEmbedded: jest.fn(),
    setIsBootstrapping: jest.fn(),
    setError: jest.fn(),
    fetchAgentDetails: jest.fn(),
    fetchWidgetConfig: jest.fn(),
    validateAndRestoreSession: jest.fn(),
    createSession: jest.fn(),
    t: { failedToLoadWidget: 'failed' },
  } as unknown as Parameters<typeof useBootstrap>[0];
}

function encodePreview(obj: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(obj)));
}

describe('useBootstrap — preview mode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('applies the inline config and injects a Google font without auth/API calls', async () => {
    const validated = { font_source: 'google', font_family: 'Roboto', custom_css: '.x{}' };
    (validateConfig as jest.Mock).mockReturnValue({ config: validated });

    const props = baseProps(encodePreview({ any: 'thing' }));
    renderHook(() => useBootstrap(props));

    await waitFor(() => expect(props.setIsBootstrapping).toHaveBeenCalledWith(false));

    expect(props.setWidgetConfig).toHaveBeenCalledWith(validated);
    expect(injectCustomAssetsFromConfig).toHaveBeenCalledWith(validated);
    expect(injectGoogleFont).toHaveBeenCalledWith('Roboto');
    expect(props.setIsEmbedded).toHaveBeenCalledWith(true);
    // Preview mode must never touch auth or session APIs.
    expect(props.getAuthToken).not.toHaveBeenCalled();
    expect(props.fetchAgentDetails).not.toHaveBeenCalled();
  });

  it('skips the Google font when font_source is not google', async () => {
    (validateConfig as jest.Mock).mockReturnValue({ config: { font_source: 'system' } });

    const props = baseProps(encodePreview({ any: 'thing' }));
    renderHook(() => useBootstrap(props));

    await waitFor(() => expect(props.setIsBootstrapping).toHaveBeenCalledWith(false));
    expect(injectGoogleFont).not.toHaveBeenCalled();
  });

  it('swallows malformed preview config and still finishes bootstrapping', async () => {
    const props = baseProps('@@not-base64@@');
    renderHook(() => useBootstrap(props));

    await waitFor(() => expect(props.setIsBootstrapping).toHaveBeenCalledWith(false));
    expect(props.setWidgetConfig).not.toHaveBeenCalled();
    expect(props.setError).not.toHaveBeenCalled();
  });
});
