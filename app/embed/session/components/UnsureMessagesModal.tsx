import { useWidgetTranslation } from '../../../../hooks/useWidgetTranslation';
import type { UnsureMessagesModalProps } from '../EmbedClient.types';

export function UnsureMessagesModal({ messages, onClose, primaryColor, backgroundColor, textColor, borderRadius }: UnsureMessagesModalProps) {
  const { translations: t, locale } = useWidgetTranslation();
  return (
    <div
      className="rounded-lg shadow-lg max-h-[80vh] overflow-hidden"
      style={{ backgroundColor, color: textColor, borderRadius: `${borderRadius}px` }}
    >
      <div
        className="p-4 border-b"
        style={{ borderColor: primaryColor }}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">{t.uncertaintyLogTitle as string}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {t.uncertaintyLogSubtitle as string}
        </p>
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">{t.uncertaintyLogEmpty as string}</p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className="border rounded p-3" style={{ borderColor: primaryColor + "20" }}>
                <div className="mb-2">
                  <span className="text-xs text-muted-foreground">{t.uncertaintyLogUser as string}</span>
                  <p className="text-sm mt-1">{msg.userMessage}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t.uncertaintyLogAgent as string}</span>
                  <p className="text-sm mt-1 italic">{msg.agentMessage}</p>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {new Date(msg.timestamp).toLocaleString(locale)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t" style={{ borderColor: primaryColor + "20" }}>
        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded text-white hover:opacity-90"
          style={{ backgroundColor: primaryColor, borderRadius: `${borderRadius}px` }}
        >
          {t.close as string}
        </button>
      </div>
    </div>
  );
}
