import { useContext } from "react";
import type { AttachmentsContext, PromptInputControllerProps } from "../prompt-input.types";
import {
  PromptInputController,
  ProviderAttachmentsContext,
  LocalAttachmentsContext,
} from "../context/PromptInputContext";

export const usePromptInputController = (): PromptInputControllerProps => {
  const ctx = useContext(PromptInputController);
  if (!ctx) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use usePromptInputController()."
    );
  }
  return ctx;
};

// Optional variants (do NOT throw). Useful for dual-mode components.
export const useOptionalPromptInputController = () =>
  useContext(PromptInputController);

export const useProviderAttachments = (): AttachmentsContext => {
  const ctx = useContext(ProviderAttachmentsContext);
  if (!ctx) {
    throw new Error(
      "Wrap your component inside <PromptInputProvider> to use useProviderAttachments()."
    );
  }
  return ctx;
};

export const useOptionalProviderAttachments = () =>
  useContext(ProviderAttachmentsContext);

export const usePromptInputAttachments = (): AttachmentsContext => {
  // Dual-mode: prefer provider if present, otherwise use local
  const provider = useOptionalProviderAttachments();
  const local = useContext(LocalAttachmentsContext);
  const context = provider ?? local;
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput or PromptInputProvider"
    );
  }
  return context;
};
