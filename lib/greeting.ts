// The greeting is always rendered as a pinned static block at the top of the
// conversation whenever one is configured. The backend also persists it as an
// `is_greeting` chat message once a conversation exists (with the same text and
// buttons), so every layout filters that server copy out of its message stream —
// otherwise it renders twice, and sending a message makes the static block
// vanish. One definition so the layouts can't drift apart on the rule.
export const isServerGreetingMessage = (m: { id: string; metadata?: unknown }): boolean =>
  m.id.startsWith('greeting-') ||
  (m.metadata as Record<string, unknown> | undefined)?.is_greeting === true;
