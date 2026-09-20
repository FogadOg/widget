import { PERSISTED_AGENT_SENDER } from '../EmbedClient.constants';

// When a visitor clicks a merchant-authored button, the widget persists the
// canned reply to the session history through /sessions/<id>/messages with
// skip_ai_response. The backend's role vocabulary is 'user' | 'agent' and it
// maps any other value to 'user' — so the value sent here decides whether the
// dashboard transcript shows the reply as the agent's turn or as something the
// visitor typed. It used to be 'assistant', which silently became 'user'.
describe('PERSISTED_AGENT_SENDER', () => {
  it("matches the backend's agent role, not 'assistant'", () => {
    expect(PERSISTED_AGENT_SENDER).toBe('agent');
  });
});
