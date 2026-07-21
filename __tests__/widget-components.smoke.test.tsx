import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Lightweight mocks to avoid Radix / ESM / icon runtime issues
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("lucide-react", () => ({
  ImageIcon: (props: any) => <span {...props}>ImageIcon</span>,
  MicIcon: (props: any) => <span {...props}>MicIcon</span>,
  PaperclipIcon: (props: any) => <span {...props}>PaperclipIcon</span>,
  PlusIcon: (props: any) => <span {...props}>PlusIcon</span>,
  XIcon: (props: any) => <span {...props}>XIcon</span>,
  Loader2Icon: (props: any) => <span {...props}>Loader2</span>,
  CornerDownLeftIcon: (props: any) => <span {...props}>Corner</span>,
  SquareIcon: (props: any) => <span {...props}>Square</span>,
}));

// Provide minimal dropdown-menu / radix mocks used across ui wrappers
jest.mock("@radix-ui/react-dropdown-menu", () => ({
  createMenuScope: () => ({}),
  Root: ({ children }: any) => <div>{children}</div>,
  Trigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Portal: ({ children }: any) => <div>{children}</div>,
  Content: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Group: ({ children }: any) => <div>{children}</div>,
  Item: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CheckboxItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  RadioGroup: ({ children }: any) => <div>{children}</div>,
  RadioItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Label: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Separator: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  ItemIndicator: ({ children }: any) => <span>{children}</span>,
  Sub: ({ children }: any) => <div>{children}</div>,
  SubTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SubContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

// Mock other potential Radix menus used in project
jest.mock("@radix-ui/react-menu", () => ({
  Root: ({ children }: any) => <div>{children}</div>,
  Menu: ({ children }: any) => <div>{children}</div>,
  MenuItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

// Prevent URL.createObjectURL errors
beforeAll(() => {
  (global as any).URL = (global as any).URL || {};
  (global as any).URL.createObjectURL = jest.fn((f: File) => `blob:${f.name}`);
  (global as any).URL.revokeObjectURL = jest.fn();
});

// Import components from widget-app attachments
import EmbedShell from "../components/EmbedShell";
import ErrorBoundary from "../components/ErrorBoundary";
import FeedbackDialog from "../components/FeedbackDialog";
import InteractionButtons from "../components/InteractionButtons";
import MessageBubble from "../components/MessageBubble";

describe("widget-app basic smoke render", () => {
  test("renders top-level UI components without crashing", () => {
    render(
      <div>
        <EmbedShell
          isEmbedded={true}
          isCollapsed={true}
          toggleCollapsed={() => {}}
          messages={[]}
          isTyping={false}
          input={""}
          setInput={() => {}}
          handleSubmit={() => {}}
        />
        <ErrorBoundary>
          <FeedbackDialog />
        </ErrorBoundary>
        <InteractionButtons
          buttons={[]}
          clickedButtons={new Set()}
          onButtonClick={() => {}}
          primaryColor="#000"
          buttonBorderRadius={4}
          fontStyles={{}}
        />
        <MessageBubble message={{ id: 'm1', text: 'hello', from: 'agent', timestamp: Date.now() }} />
      </div>
    );

    // basic expectation that render produced DOM
    expect(document.body).toBeTruthy();
  });
});
