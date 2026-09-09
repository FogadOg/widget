import { renderHook, act } from '@testing-library/react';
import { useAttachments } from '../hooks/useAttachments';

jest.mock('../helpers', () => ({
  uploadSessionFile: jest.fn(),
}));

jest.mock('../../../../lib/errorHandling', () => {
  const actual = jest.requireActual('../../../../lib/errorHandling');
  return { ...actual, logError: jest.fn() };
});

import * as helpers from '../helpers';
import { logError } from '../../../../lib/errorHandling';
import { EMBED_EVENTS } from '../../../../lib/embedConstants';

const uploadSessionFile = helpers.uploadSessionFile as jest.Mock;
const logErrorMock = logError as unknown as jest.Mock;

const t = {
  sessionOrAuthError: 'session-or-auth-error',
  failedToSendMessage: 'failed-to-send',
};

function setup(overrides: Partial<Parameters<typeof useAttachments>[0]> = {}) {
  const setError = jest.fn();
  const props = {
    sessionId: 'sess-1',
    sessionIdRef: { current: null as string | null },
    authToken: 'tok-1',
    authTokenRef: { current: null as string | null },
    parentSensitiveOrigin: 'https://host.example',
    t,
    setError,
    ...overrides,
  } as Parameters<typeof useAttachments>[0];
  const view = renderHook(() => useAttachments(props));
  return { ...view, setError, props };
}

const file = (name: string) => new File(['x'], name, { type: 'text/plain' });
const attachment = (id: string) => ({ id, name: `${id}.txt` } as any);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAttachments', () => {
  it('starts empty', () => {
    const { result } = setup();
    expect(result.current.pendingAttachments).toEqual([]);
    expect(result.current.uploadingFiles).toBe(0);
    expect(result.current.pendingAttachmentsRef.current).toEqual([]);
  });

  it('ignores an empty pick without touching the session', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handlePickFiles([]); });
    expect(uploadSessionFile).not.toHaveBeenCalled();
    expect(result.current.pendingAttachments).toEqual([]);
  });

  it('tolerates a null file list', async () => {
    // Covers the `files || []` guard — some hosts hand back a null FileList.
    const { result } = setup();
    await act(async () => {
      await result.current.handlePickFiles(null as unknown as FileList);
    });
    expect(uploadSessionFile).not.toHaveBeenCalled();
  });

  it('falls back to an English message when the translation is missing', async () => {
    const { result, setError } = setup({
      sessionId: null,
      authToken: null,
      sessionIdRef: { current: null },
      authTokenRef: { current: null },
      t: { ...t, sessionOrAuthError: '' } as typeof t,
    });

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(setError).toHaveBeenCalledWith('Session or authentication error');
  });

  it('uploads each picked file and appends the attachments', async () => {
    uploadSessionFile
      .mockResolvedValueOnce(attachment('a'))
      .mockResolvedValueOnce(attachment('b'));
    const { result } = setup();

    await act(async () => {
      await result.current.handlePickFiles([file('a.txt'), file('b.txt')]);
    });

    expect(uploadSessionFile).toHaveBeenCalledTimes(2);
    expect(uploadSessionFile).toHaveBeenCalledWith('sess-1', expect.any(File), 'tok-1');
    expect(result.current.pendingAttachments.map((a) => a.id)).toEqual(['a', 'b']);
    // The ref mirrors state so the send path can read it without a dep on it.
    expect(result.current.pendingAttachmentsRef.current.map((a) => a.id)).toEqual(['a', 'b']);
    // Counter returns to zero via the finally block.
    expect(result.current.uploadingFiles).toBe(0);
  });

  it('prefers the refs over the props for session id and token', async () => {
    uploadSessionFile.mockResolvedValueOnce(attachment('a'));
    const { result } = setup({
      sessionIdRef: { current: 'ref-session' },
      authTokenRef: { current: 'ref-token' },
    });

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(uploadSessionFile).toHaveBeenCalledWith('ref-session', expect.any(File), 'ref-token');
  });

  it('notifies the host page after each successful upload', async () => {
    uploadSessionFile.mockResolvedValueOnce(attachment('a'));
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { result } = setup();

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(postMessage).toHaveBeenCalledWith(
      { type: EMBED_EVENTS.FILE_UPLOADED, data: attachment('a') },
      'https://host.example',
    );
    postMessage.mockRestore();
  });

  it('skips the host notification when there is no sensitive origin', async () => {
    uploadSessionFile.mockResolvedValueOnce(attachment('a'));
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const { result } = setup({ parentSensitiveOrigin: null });

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(postMessage).not.toHaveBeenCalled();
    expect(result.current.pendingAttachments).toHaveLength(1);
    postMessage.mockRestore();
  });

  it('still keeps the attachment when the host postMessage throws', async () => {
    // The host may be mid-navigation; that must not lose the upload.
    uploadSessionFile.mockResolvedValueOnce(attachment('a'));
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {
      throw new Error('host gone');
    });
    const { result } = setup();

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(result.current.pendingAttachments.map((a) => a.id)).toEqual(['a']);
    postMessage.mockRestore();
  });

  it('reports an error and uploads nothing when session or token is missing', async () => {
    const { result, setError } = setup({
      sessionId: null,
      authToken: null,
      sessionIdRef: { current: null },
      authTokenRef: { current: null },
    });

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(setError).toHaveBeenCalledWith('session-or-auth-error');
    expect(uploadSessionFile).not.toHaveBeenCalled();
  });

  it('surfaces an upload failure and keeps going with the rest', async () => {
    uploadSessionFile
      .mockRejectedValueOnce(new Error('upload blew up'))
      .mockResolvedValueOnce(attachment('b'));
    const { result, setError } = setup();

    await act(async () => {
      await result.current.handlePickFiles([file('a.txt'), file('b.txt')]);
    });

    expect(setError).toHaveBeenCalledWith('upload blew up');
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      { action: 'uploadSessionFile' },
    );
    // One failure must not block the others.
    expect(result.current.pendingAttachments.map((a) => a.id)).toEqual(['b']);
    expect(result.current.uploadingFiles).toBe(0);
  });

  it('wraps a non-Error rejection before logging it', async () => {
    uploadSessionFile.mockRejectedValueOnce('just a string');
    const { result, setError } = setup();

    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    expect(setError).toHaveBeenCalledWith('failed-to-send');
    expect(logErrorMock).toHaveBeenCalledWith(expect.any(Error), { action: 'uploadSessionFile' });
  });

  it('removes an attachment by id and leaves the others', async () => {
    uploadSessionFile
      .mockResolvedValueOnce(attachment('a'))
      .mockResolvedValueOnce(attachment('b'));
    const { result } = setup();
    await act(async () => {
      await result.current.handlePickFiles([file('a.txt'), file('b.txt')]);
    });

    act(() => { result.current.handleRemoveAttachment('a'); });

    expect(result.current.pendingAttachments.map((x) => x.id)).toEqual(['b']);
    expect(result.current.pendingAttachmentsRef.current.map((x) => x.id)).toEqual(['b']);
  });

  it('exposes setters so the send path can drain the composer', async () => {
    uploadSessionFile.mockResolvedValueOnce(attachment('a'));
    const { result } = setup();
    await act(async () => { await result.current.handlePickFiles([file('a.txt')]); });

    act(() => { result.current.setPendingAttachments([]); });

    expect(result.current.pendingAttachments).toEqual([]);
  });
});
