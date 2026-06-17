import EmbedClient from '../embed/session/EmbedClient';
import DocsClient from '../embed/docs/DocsClient';
import ErrorBoundary from '../../components/ErrorBoundary';

type Props = {
  searchParams: Promise<{
    config?: string;
    type?: string;
    locale?: string;
  }>;
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function PreviewPage({ searchParams }: Props) {
  const params = await searchParams;
  const type = params.type === 'docs' ? 'docs' : 'chat';
  const locale = params.locale ?? 'en';
  // Config is no longer baked into the URL (it arrives via postMessage on load).
  // "PREVIEW_MODE" is an invalid-base64 sentinel that signals preview mode to the
  // client (skips auth, registers the postMessage listener) without carrying data.
  const previewConfigSentinel = 'PREVIEW_MODE';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        background: 'linear-gradient(135deg, #eef2f7 0%, #e5eaf0 100%)',
        overflow: 'hidden',
      }}
    >
      <ErrorBoundary>
        {type === 'docs' ? (
          <DocsClient
            clientId="preview"
            agentId="preview"
            configId="preview"
            previewConfig={previewConfigSentinel}
            locale={locale}
            startOpen={true}
          />
        ) : (
          <EmbedClient
            clientId="preview"
            agentId="preview"
            configId="preview"
            previewConfig={previewConfigSentinel}
            locale={locale}
            startOpen={false}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
