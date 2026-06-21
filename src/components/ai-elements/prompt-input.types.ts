import type { ChatStatus, FileUIPart } from "ai";
import type {
  ChangeEvent,
  ComponentProps,
  FormEvent,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
  RefObject,
} from "react";
import type {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type {
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import type {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export type AttachmentsContext = {
  files: (FileUIPart & { id: string })[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
  openFileDialog: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
};

export type TextInputContext = {
  value: string;
  setInput: (v: string) => void;
  clear: () => void;
};

export type PromptInputControllerProps = {
  textInput: TextInputContext;
  attachments: AttachmentsContext;
  /** INTERNAL: Allows PromptInput to register its file textInput + "open" callback */
  __registerFileInput: (
    ref: RefObject<HTMLInputElement | null>,
    open: () => void
  ) => void;
};

export type PromptInputProviderProps = PropsWithChildren<{
  initialInput?: string;
}>;

export type PromptInputMessage = {
  text: string;
  files: FileUIPart[];
};

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onError"
> & {
  accept?: string; // e.g., "image/*" or leave undefined for any
  multiple?: boolean;
  // When true, accepts drops anywhere on document. Default false (opt-in).
  globalDrop?: boolean;
  // Render a hidden input with given name and keep it in sync for native form posts. Default false.
  syncHiddenInput?: boolean;
  // Minimal constraints
  maxFiles?: number;
  maxFileSize?: number; // bytes
  onError?: (err: {
    code: "max_files" | "max_file_size" | "accept";
    message: string;
  }) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
  /** Called when message is queued locally due to offline state */
  onQueue?: (message: PromptInputMessage & { id: string }) => void;
};

export type PromptInputAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: FileUIPart & { id: string };
  className?: string;
};

export type PromptInputAttachmentsProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: (attachment: FileUIPart & { id: string }) => ReactNode;
};

export type PromptInputActionAddAttachmentsProps = ComponentProps<
  typeof DropdownMenuItem
> & {
  label?: string;
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
>;

export type PromptInputHeaderProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton>;

export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

export type PromptInputActionMenuContentProps = ComponentProps<
  typeof DropdownMenuContent
>;

export type PromptInputActionMenuItemProps = ComponentProps<
  typeof DropdownMenuItem
>;

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
};

interface SpeechRecognitionInterface extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognitionInterface, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInterface, ev: Event) => void) | null;
  onresult:
    | ((this: SpeechRecognitionInterface, ev: SpeechRecognitionEventInterface) => void)
    | null;
  onerror:
    | ((this: SpeechRecognitionInterface, ev: SpeechRecognitionErrorEventInterface) => void)
    | null;
}

interface SpeechRecognitionEventInterface extends Event {
  results: SpeechRecognitionResultListType;
  resultIndex: number;
}

type SpeechRecognitionResultListType = {
  readonly length: number;
  item(index: number): SpeechRecognitionResultType;
  [index: number]: SpeechRecognitionResultType;
};

type SpeechRecognitionResultType = {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeType;
  [index: number]: SpeechRecognitionAlternativeType;
  isFinal: boolean;
};

type SpeechRecognitionAlternativeType = {
  transcript: string;
  confidence: number;
};

interface SpeechRecognitionErrorEventInterface extends Event {
  error: string;
}

export type SpeechRecognition = SpeechRecognitionInterface;
export type SpeechRecognitionEvent = SpeechRecognitionEventInterface;
export type SpeechRecognitionResultList = SpeechRecognitionResultListType;
export type SpeechRecognitionResult = SpeechRecognitionResultType;
export type SpeechRecognitionAlternative = SpeechRecognitionAlternativeType;
export type SpeechRecognitionErrorEvent = SpeechRecognitionErrorEventInterface;

export type PromptInputSpeechButtonProps = PromptInputButtonProps & {
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onTranscriptionChange?: (text: string) => void;
};

export type PromptInputSelectProps = ComponentProps<typeof Select>;

export type PromptInputSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

export type PromptInputSelectContentProps = ComponentProps<
  typeof SelectContent
>;

export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>;

export type PromptInputHoverCardTriggerProps = ComponentProps<
  typeof HoverCardTrigger
>;

export type PromptInputHoverCardContentProps = ComponentProps<
  typeof HoverCardContent
>;

export type PromptInputTabsListProps = HTMLAttributes<HTMLDivElement>;

export type PromptInputTabProps = HTMLAttributes<HTMLDivElement>;

export type PromptInputTabLabelProps = HTMLAttributes<HTMLHeadingElement>;

export type PromptInputTabBodyProps = HTMLAttributes<HTMLDivElement>;

export type PromptInputTabItemProps = HTMLAttributes<HTMLDivElement>;

export type PromptInputCommandProps = ComponentProps<typeof Command>;

export type PromptInputCommandInputProps = ComponentProps<typeof CommandInput>;

export type PromptInputCommandListProps = ComponentProps<typeof CommandList>;

export type PromptInputCommandEmptyProps = ComponentProps<typeof CommandEmpty>;

export type PromptInputCommandGroupProps = ComponentProps<typeof CommandGroup>;

export type PromptInputCommandItemProps = ComponentProps<typeof CommandItem>;

export type PromptInputCommandSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;
