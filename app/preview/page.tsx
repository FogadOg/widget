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
  const configB64 = params.config ?? '';
  const type = params.type === 'docs' ? 'docs' : 'chat';
  const locale = params.locale ?? 'en';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #eef2f7 0%, #e5eaf0 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Fake webpage skeleton — provides visual context for the widget */}
      <div style={{ padding: '28px 32px', maxWidth: 540, margin: '0 auto' }}>
        <div style={{ height: 20, width: '55%', background: '#c8d0da', borderRadius: 5, marginBottom: 18, opacity: 0.7 }} />
        {[75, 90, 60, 85, 50, 70, 40].map((w, i) => (
          <div
            key={i}
            style={{
              height: 10,
              width: `${w}%`,
              background: '#d4dbe4',
              borderRadius: 4,
              marginBottom: 10,
              opacity: 0.6,
            }}
          />
        ))}
        <div style={{ height: 1, background: '#dde3ec', margin: '22px 0', opacity: 0.6 }} />
        {[65, 80, 55].map((w, i) => (
          <div
            key={i}
            style={{
              height: 10,
              width: `${w}%`,
              background: '#d4dbe4',
              borderRadius: 4,
              marginBottom: 10,
              opacity: 0.5,
            }}
          />
        ))}
      </div>

      {/* Real widget rendered directly — position:fixed anchors it to the iframe viewport */}
      <ErrorBoundary>
        {type === 'docs' ? (
          <DocsClient
            clientId="preview"
            agentId="preview"
            configId="preview"
            previewConfig={configB64}
            locale={locale}
            startOpen={false}
          />
        ) : (
          <EmbedClient
            clientId="preview"
            agentId="preview"
            configId="preview"
            previewConfig={configB64}
            locale={locale}
            startOpen={false}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
