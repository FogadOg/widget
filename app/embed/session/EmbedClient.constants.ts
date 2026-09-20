// localStorage key used only in preview mode to remember whether the admin
// left the preview widget open or closed across iframe reloads.
export const PREVIEW_COLLAPSED_KEY = 'companin-preview-collapsed';

// Role used when persisting a merchant-authored button/flow reply to the
// session history. The backend's vocabulary is 'user' | 'agent' and it maps any
// other value to 'user' — so the old 'assistant' here saved every canned reply
// as if the visitor had typed it, which is what the dashboard transcript and the
// user-message count then showed.
export const PERSISTED_AGENT_SENDER = 'agent';
