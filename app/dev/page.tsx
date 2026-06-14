import { notFound } from 'next/navigation';
import DevHarness from './DevHarness';

/**
 * Local widget test harness — http://localhost:3001/dev
 *
 * Embeds the widget iframe directly and exposes controls for locale, start-open,
 * the client/agent/config IDs, a live postMessage log, and session/offline
 * helpers. Never shipped to production (returns 404 there).
 */
export const metadata = { robots: { index: false, follow: false } };

export default function DevPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <DevHarness />;
}
