import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import {
  useOptionalPromptInputController,
  useOptionalProviderAttachments,
  usePromptInputAttachments,
  usePromptInputController,
  useProviderAttachments,
} from '../src/components/ai-elements/hooks/usePromptInput';
import {
  LocalAttachmentsContext,
  PromptInputController,
  ProviderAttachmentsContext,
} from '../src/components/ai-elements/context/PromptInputContext';

const controller = { value: 'draft' } as never;
const providerAttachments = { files: ['provider'] } as never;
const localAttachments = { files: ['local'] } as never;

const wrapWith = (Ctx: React.Context<unknown>, value: unknown) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  };

describe('usePromptInputController', () => {
  test('returns the controller from context', () => {
    const { result } = renderHook(() => usePromptInputController(), {
      wrapper: wrapWith(PromptInputController as never, controller),
    });
    expect(result.current).toBe(controller);
  });

  test('throws a named error outside a provider', () => {
    expect(() => renderHook(() => usePromptInputController())).toThrow(
      /PromptInputProvider/,
    );
  });
});

describe('useOptionalPromptInputController', () => {
  test('returns the controller when present', () => {
    const { result } = renderHook(() => useOptionalPromptInputController(), {
      wrapper: wrapWith(PromptInputController as never, controller),
    });
    expect(result.current).toBe(controller);
  });

  test('returns undefined instead of throwing when absent', () => {
    // Dual-mode components rely on this not throwing.
    const { result } = renderHook(() => useOptionalPromptInputController());
    expect(result.current).toBeFalsy();
  });
});

describe('useProviderAttachments', () => {
  test('returns the provider attachments', () => {
    const { result } = renderHook(() => useProviderAttachments(), {
      wrapper: wrapWith(ProviderAttachmentsContext as never, providerAttachments),
    });
    expect(result.current).toBe(providerAttachments);
  });

  test('throws outside a provider', () => {
    expect(() => renderHook(() => useProviderAttachments())).toThrow(/PromptInputProvider/);
  });
});

describe('useOptionalProviderAttachments', () => {
  test('returns undefined outside a provider', () => {
    const { result } = renderHook(() => useOptionalProviderAttachments());
    expect(result.current).toBeFalsy();
  });
});

describe('usePromptInputAttachments', () => {
  test('prefers the provider when both are present', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProviderAttachmentsContext.Provider value={providerAttachments}>
        <LocalAttachmentsContext.Provider value={localAttachments}>
          {children}
        </LocalAttachmentsContext.Provider>
      </ProviderAttachmentsContext.Provider>
    );

    const { result } = renderHook(() => usePromptInputAttachments(), { wrapper });

    expect(result.current).toBe(providerAttachments);
  });

  test('falls back to the local context', () => {
    const { result } = renderHook(() => usePromptInputAttachments(), {
      wrapper: wrapWith(LocalAttachmentsContext as never, localAttachments),
    });
    expect(result.current).toBe(localAttachments);
  });

  test('throws when neither context is present', () => {
    expect(() => renderHook(() => usePromptInputAttachments())).toThrow(
      /PromptInput or PromptInputProvider/,
    );
  });
});
