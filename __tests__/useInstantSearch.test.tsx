import { act, renderHook, waitFor } from '@testing-library/react';
import { useInstantSearch } from '../app/embed/docs/hooks/useInstantSearch';
import { fetchWithTimeout } from '../app/embed/docs/resilientFetch';

jest.mock('../app/embed/docs/resilientFetch', () => ({ fetchWithTimeout: jest.fn() }));

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

const hit = (id: string) => ({
  id,
  type: 'url' as const,
  title: `Result ${id}`,
  snippet: '…',
  source_url: null,
});

const ok = (hits: unknown[]) => ({ ok: true, json: async () => ({ hits }) }) as never;

const setup = (authToken: string | null = 'tok', agentId = 'agent-1') =>
  renderHook(() => useInstantSearch(agentId, authToken, { 'X-Embed': '1' }));

/** Type a query and let the debounce elapse. */
const search = async (
  result: { current: ReturnType<typeof useInstantSearch> },
  q: string,
) => {
  act(() => result.current.setQuery(q));
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
};

describe('useInstantSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue(ok([hit('1')]));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('starts idle', () => {
    const { result } = setup();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(result.current.query).toBe('');
  });

  test('searches after the debounce and reports the hits', async () => {
    const { result } = setup();

    await search(result, 'refund');

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'success',
        hits: [hit('1')],
        query: 'refund',
      }),
    );
  });

  test('waits out the debounce rather than searching per keystroke', async () => {
    const { result } = setup();

    act(() => result.current.setQuery('re'));
    act(() => result.current.setQuery('ref'));
    act(() => result.current.setQuery('refu'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });

  test('trims the query before searching', async () => {
    const { result } = setup();

    await search(result, '  refund  ');

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(String(mockFetch.mock.calls[0][0])).toContain('refund');
  });

  test('sends the auth token and embed headers', async () => {
    const { result } = setup();

    await search(result, 'refund');

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'X-Embed': '1',
    });
  });

  test.each([['a'], [''], ['   ']])('does not search for the too-short query %p', async (q) => {
    const { result } = setup();

    await search(result, q);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  test('resets to idle when the query is cut back below the minimum', async () => {
    const { result } = setup();
    await search(result, 'refund');
    await waitFor(() => expect(result.current.state.status).toBe('success'));

    act(() => result.current.setQuery('r'));

    expect(result.current.state).toEqual({ status: 'idle' });
  });

  test('does not search without an auth token', async () => {
    const { result } = setup(null);
    await search(result, 'refund');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does not search without an agent id', async () => {
    const { result } = setup('tok', '');
    await search(result, 'refund');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('reports an error status when the request is rejected', async () => {
    mockFetch.mockResolvedValue({ ok: false } as never);
    const { result } = setup();

    await search(result, 'refund');

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  test('reports an error status when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    const { result } = setup();

    await search(result, 'refund');

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  test('treats a missing hits array as no results', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) } as never);
    const { result } = setup();

    await search(result, 'refund');

    await waitFor(() => expect(result.current.state).toMatchObject({ hits: [] }));
  });

  test('ignores a slow response for a query that has been superseded', async () => {
    // Otherwise an older, slower search overwrites the newer results.
    let resolveFirst: (v: unknown) => void = () => {};
    mockFetch
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }) as never)
      .mockResolvedValue(ok([hit('second')]));

    const { result } = setup();
    await search(result, 'first');
    await search(result, 'second');
    await waitFor(() => expect(result.current.state).toMatchObject({ query: 'second' }));

    await act(async () => {
      resolveFirst(ok([hit('first')]));
    });

    expect(result.current.state).toMatchObject({ query: 'second' });
  });

  describe('clearSearch', () => {
    test('empties the query and returns to idle', async () => {
      const { result } = setup();
      await search(result, 'refund');
      await waitFor(() => expect(result.current.state.status).toBe('success'));

      act(() => result.current.clearSearch());

      expect(result.current.query).toBe('');
      expect(result.current.state).toEqual({ status: 'idle' });
    });

    test('is a no-op when already idle', () => {
      const { result } = setup();
      const before = result.current.state;

      act(() => result.current.clearSearch());

      expect(result.current.state).toBe(before);
    });
  });

  describe('retry', () => {
    test('re-runs the last query', async () => {
      mockFetch.mockResolvedValue({ ok: false } as never);
      const { result } = setup();
      await search(result, 'refund');
      await waitFor(() => expect(result.current.state.status).toBe('error'));

      mockFetch.mockResolvedValue(ok([hit('1')]));
      await act(async () => {
        result.current.retry();
      });

      await waitFor(() => expect(result.current.state.status).toBe('success'));
    });

    test('does nothing when there is no query to retry', () => {
      const { result } = setup();
      act(() => result.current.retry());
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
