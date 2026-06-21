export type Props = {
  clientId: string;
  agentId: string;
  configId: string;
  locale: string;
  startOpen: boolean;
  pagePath?: string;
  parentOrigin?: string;
  loaderVersion?: string;
  /** Base64-encoded JSON widget config for preview mode. When set, auth and API calls are skipped. */
  previewConfig?: string;
};

export type MessageType = {
  key: string;
  from: "user" | "agent";
  sources?: { url?: string; href?: string; title?: string; snippet?: string; type?: string; reference_id?: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration: number;
  };
};
