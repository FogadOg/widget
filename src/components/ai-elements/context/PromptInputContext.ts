import { createContext } from "react";
import type { AttachmentsContext, PromptInputControllerProps } from "../prompt-input.types";

export const PromptInputController = createContext<PromptInputControllerProps | null>(
  null
);

export const ProviderAttachmentsContext = createContext<AttachmentsContext | null>(
  null
);

export const LocalAttachmentsContext = createContext<AttachmentsContext | null>(null);
