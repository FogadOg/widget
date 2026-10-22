import { persistButtonTurn } from '../EmbedClient.controller';

// A clicked button's turn is persisted by naming the button: the server looks
// up the reply and writes the agent turn itself, so this client never authors
// an agent message.
describe('persistButtonTurn', () => {
  const base = { url: '/api/sessions/s-1/messages', headers: { 'Content-Type': 'application/json' } };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;
  });

  it('sends one write naming the button, with no agent turn', async () => {
    await persistButtonTurn({ ...base, locale: 'de', label: 'Opening hours', buttonId: 'btn-uuid' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      content: 'Opening hours',
      locale: 'de',
      skip_ai_response: true,
      metadata: { button_reply: { button_id: 'btn-uuid' } },
    });
  });

  it('never throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(persistButtonTurn({ ...base, locale: 'en', label: 'L', buttonId: 'id' })).resolves.toBeUndefined();
  });
});
