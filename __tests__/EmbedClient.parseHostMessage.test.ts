import { parseHostMessageCommand } from '../app/embed/session/EmbedClient';

describe('parseHostMessageCommand', () => {
  it('maps string open/show/restore to the open action', () => {
    for (const cmd of ['open', 'show', 'restore', 'OPEN', '  Show  ']) {
      expect(parseHostMessageCommand(cmd)).toEqual({ kind: 'action', action: 'open' });
    }
  });

  it('maps string close/hide/minimize to the close action', () => {
    for (const cmd of ['close', 'hide', 'minimize']) {
      expect(parseHostMessageCommand(cmd)).toEqual({ kind: 'action', action: 'close' });
    }
  });

  it('maps string toggle to the toggle action', () => {
    expect(parseHostMessageCommand('toggle')).toEqual({ kind: 'action', action: 'toggle' });
  });

  it('treats any other non-empty string as a message', () => {
    expect(parseHostMessageCommand('hello there')).toEqual({ kind: 'message', text: 'hello there' });
  });

  it('returns null for empty/blank strings', () => {
    expect(parseHostMessageCommand('')).toBeNull();
    expect(parseHostMessageCommand('   ')).toBeNull();
  });

  it('returns null for non-string, non-object inputs', () => {
    expect(parseHostMessageCommand(42 as unknown)).toBeNull();
    expect(parseHostMessageCommand(null)).toBeNull();
    expect(parseHostMessageCommand(undefined)).toBeNull();
  });

  it('reads the command from action/command/event/type object keys', () => {
    expect(parseHostMessageCommand({ action: 'open' })).toEqual({ kind: 'action', action: 'open' });
    expect(parseHostMessageCommand({ command: 'close' })).toEqual({ kind: 'action', action: 'close' });
    expect(parseHostMessageCommand({ event: 'toggle' })).toEqual({ kind: 'action', action: 'toggle' });
    expect(parseHostMessageCommand({ type: 'show' })).toEqual({ kind: 'action', action: 'open' });
  });

  it('reads message text from text/message/content/prompt/query object keys', () => {
    expect(parseHostMessageCommand({ text: 'a' })).toEqual({ kind: 'message', text: 'a' });
    expect(parseHostMessageCommand({ message: 'b' })).toEqual({ kind: 'message', text: 'b' });
    expect(parseHostMessageCommand({ content: 'c' })).toEqual({ kind: 'message', text: 'c' });
    expect(parseHostMessageCommand({ prompt: 'd' })).toEqual({ kind: 'message', text: 'd' });
    expect(parseHostMessageCommand({ query: 'e' })).toEqual({ kind: 'message', text: 'e' });
  });

  it('falls through to text when an object has an unknown command plus message text', () => {
    expect(parseHostMessageCommand({ command: 'frobnicate', text: 'hi' })).toEqual({ kind: 'message', text: 'hi' });
  });

  it('returns null for objects with neither a command nor message text', () => {
    expect(parseHostMessageCommand({})).toBeNull();
    expect(parseHostMessageCommand({ text: '   ' })).toBeNull();
    expect(parseHostMessageCommand({ irrelevant: true })).toBeNull();
  });
});
