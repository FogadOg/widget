import { redirect } from 'next/navigation';

// The getting-started guide lives at the localized route
// (/[locale]/docs/getting-started) and now documents both the single
// `data-widget-key` and the client-id/agent-id/config-id integration methods.
// This non-localized path is kept only as a redirect to the default locale so
// existing /docs/getting-started links keep working — single source of truth.
export default function GettingStartedRedirect() {
  redirect('/en/docs/getting-started');
}
