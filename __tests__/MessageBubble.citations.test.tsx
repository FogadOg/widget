/**
 * @jest-environment jsdom
 *
 * Citation-token resolution tests for <MessageBubble>.
 *
 * [n] tokens are pre-processed before being passed to ReactMarkdown:
 *   URL source  → [n](url "tooltip")   → components.a renders as <sup><a>
 *   non-URL     → [n](#fn-n "tooltip") → components.a renders as <sup> badge
 *   out-of-range → [n] unchanged
 * The sources panel is no longer rendered at the bottom.
 */

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

// ------------------------------------------------------------------ mocks --

let capturedContent: string | undefined;
let capturedComponents: Record<string, any> | undefined;

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: function ReactMarkdownMock({ children, components }: any) {
    capturedContent = typeof children === "string" ? children : undefined;
    capturedComponents = components;
    return <div data-testid="md">{children}</div>;
  },
}));

jest.mock("remark-gfm", () => ({ __esModule: true, default: () => null }));

jest.mock("../hooks/useWidgetTranslation", () => ({
  useWidgetTranslation: () => ({ locale: "en", translations: {} }),
}));

jest.mock("../lib/i18n", () => ({ t: (_l: string, k: string) => k }));

// ---------------------------------------------------------------- subject --

import MessageBubble from "../components/MessageBubble";

// ---------------------------------------------------------------- helpers --

function mkMsg(text: string, sources?: any[]) {
  return { id: "test-id", text, from: "agent" as const, sources };
}

// ------------------------------------------------------------------ tests --

beforeEach(() => {
  capturedContent = undefined;
  capturedComponents = undefined;
});

describe("MessageBubble — pass 1: title-text matching", () => {
  it("converts 'Title[1]' into '[Title](url)' so the phrase is the link", () => {
    render(<MessageBubble message={mkMsg("Our Getting Started Guide[1] helps.", [{ url: "https://docs.com", title: "Getting Started Guide" }])} />);
    expect(capturedContent).toContain("[Getting Started Guide](https://docs.com");
    expect(capturedContent).not.toMatch(/\[1\][\s\S]*?\(/);
  });

  it("works for non-URL sources", () => {
    render(<MessageBubble message={mkMsg("See the KB Article[1] for more.", [{ title: "KB Article" }])} />);
    expect(capturedContent).toContain("[KB Article](#fn-1");
  });

  it("matches a separator-split segment when LLM uses a partial title", () => {
    // LLM writes "Official Documentation[5]" but stored title is
    // "Getting Started - Official Documentation".
    const sources = Array(4).fill({ url: "https://other.com", title: "Other" }).concat([
      { url: "https://docs.com", title: "Getting Started - Official Documentation" },
    ]);
    render(<MessageBubble message={mkMsg("See Official Documentation[5] for details.", sources)} />);
    expect(capturedContent).toContain("[Official Documentation](https://docs.com");
    expect(capturedContent).not.toMatch(/\[5\]/);
  });

  it("matches the prefix segment before a separator", () => {
    const sources = [
      { url: "https://docs.com", title: "Getting Started - Official Documentation" },
    ];
    render(<MessageBubble message={mkMsg("See Getting Started[1] to begin.", sources)} />);
    expect(capturedContent).toContain("[Getting Started](https://docs.com");
    expect(capturedContent).not.toMatch(/\[1\]/);
  });
});

describe("MessageBubble — pass 2: bare [n] fallback", () => {
  it("converts [1] to a markdown link for URL sources", () => {
    render(<MessageBubble message={mkMsg("See [1].", [{ url: "https://docs.example.com", title: "Docs" }])} />);
    expect(capturedContent).toContain('[1](https://docs.example.com "Docs")');
  });

  it("converts [1] to #fn- anchor for non-URL sources", () => {
    render(<MessageBubble message={mkMsg("[1]", [{ title: "KB article" }])} />);
    expect(capturedContent).toContain("[1](#fn-1");
    expect(capturedContent).not.toContain("[[CITE:");
  });

  it("leaves text unchanged when no sources provided", () => {
    render(<MessageBubble message={mkMsg("See [1].")} />);
    expect(capturedContent).toBe("See [1].");
  });

  it("leaves [n] unchanged when index is out of range", () => {
    render(<MessageBubble message={mkMsg("[5]", [{ url: "https://a.com" }, { url: "https://b.com" }])} />);
    expect(capturedContent).toContain("[5]");
    expect(capturedContent).not.toContain("[5](");
  });
});

describe("MessageBubble — pass 2: a component renderer", () => {
  it("renders URL citation as <sup><a href>", () => {
    render(<MessageBubble message={mkMsg("[1]", [{ url: "https://x.com", title: "X" }])} />);
    expect(capturedComponents?.a).toBeDefined();

    const { container } = render(
      <>{capturedComponents!.a({ href: "https://x.com", title: "X", children: "1" })}</>
    );
    const a = container.querySelector("sup a");
    expect(a).toBeInTheDocument();
    expect(a).toHaveTextContent("[1]");
    expect(a).toHaveAttribute("href", "https://x.com");
  });

  it("renders non-URL citation as <sup> badge with tooltip", () => {
    render(<MessageBubble message={mkMsg("[1]", [{ title: "Policy" }])} />);

    const { container } = render(
      <>{capturedComponents!.a({ href: "#fn-1", title: "Policy", children: "1" })}</>
    );
    const sup = container.querySelector("sup");
    expect(sup).toBeInTheDocument();
    expect(sup).toHaveTextContent("[1]");
    expect(sup).toHaveAttribute("title", "Policy");
    expect(container.querySelector("sup a")).not.toBeInTheDocument();
  });

  it("renders non-numeric link text as a normal external link", () => {
    render(<MessageBubble message={mkMsg("[click here](https://x.com)")} />);

    const { container } = render(
      <>{capturedComponents!.a({ href: "https://x.com", children: "click here" })}</>
    );
    expect(container.querySelector("a")).toBeInTheDocument();
    expect(container.querySelector("sup")).not.toBeInTheDocument();
  });
});

describe("MessageBubble — no sources panel", () => {
  it("does not render a sources list at the bottom", () => {
    const { container } = render(
      <MessageBubble
        message={mkMsg("Answer [1].", [{ url: "https://x.com", title: "X" }])}
      />
    );
    // No emoji-based sources header, no bullet list of sources
    expect(container.innerHTML).not.toContain("\uD83D\uDCDA");
    expect(container.querySelector("ul.space-y-1")).not.toBeInTheDocument();
  });
});
