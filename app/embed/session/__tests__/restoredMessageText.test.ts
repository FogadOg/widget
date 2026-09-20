import { restoredMessageText } from '../helpers';

// An AI-mode button sends the merchant's hidden `ai_prompt` as the message
// content, but the visitor only saw the button's label. Session restore used to
// rebuild the transcript from `content`, so after a reload the visitor's own
// bubble read "Summarise the pricing tiers and what each includes" instead of
// "Pricing". The label now rides along as metadata.display_text.
describe('restoredMessageText', () => {
  const PROMPT = 'Summarise the pricing tiers and what each includes';

  it("shows the button label for the visitor's AI-button turn", () => {
    expect(
      restoredMessageText({ sender: 'user', content: PROMPT, metadata: { display_text: 'Pricing' } }),
    ).toBe('Pricing');
  });

  it('falls back to content when there is no display_text', () => {
    expect(restoredMessageText({ sender: 'user', content: 'hello' })).toBe('hello');
    expect(restoredMessageText({ sender: 'user', content: 'hello', metadata: {} })).toBe('hello');
    expect(restoredMessageText({ sender: 'user', content: 'hello', metadata: null })).toBe('hello');
  });

  it('ignores a blank or non-string display_text', () => {
    expect(restoredMessageText({ sender: 'user', content: 'hi', metadata: { display_text: '   ' } })).toBe('hi');
    expect(restoredMessageText({ sender: 'user', content: 'hi', metadata: { display_text: 42 } })).toBe('hi');
  });

  it('never rewrites an agent turn, even if metadata carries display_text', () => {
    // Agent text must always come from content — display_text is client-set.
    expect(
      restoredMessageText({ sender: 'agent', content: 'Here are the tiers…', metadata: { display_text: 'spoofed' } }),
    ).toBe('Here are the tiers…');
  });

  it('accepts the `from` / `text` shapes used by the restore paths', () => {
    expect(restoredMessageText({ from: 'user', text: PROMPT, metadata: { display_text: 'Pricing' } })).toBe('Pricing');
    expect(restoredMessageText({ from: 'agent', text: 'reply' })).toBe('reply');
  });
});
