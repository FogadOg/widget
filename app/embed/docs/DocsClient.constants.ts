import { nanoid } from 'nanoid'
import { MessageType } from './DocsClient.types'

export const initialMessages: MessageType[] = [
  {
    key: nanoid(),
    from: "agent",
    versions: [
      {
        id: nanoid(),
        content: "Hello! I'm your documentation agent. How can I help you today?",
      },
    ],
  },
];
