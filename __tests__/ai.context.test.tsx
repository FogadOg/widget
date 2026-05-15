/**
 * @jest-environment jsdom
 */

import React from "react"
import { render } from "@testing-library/react"

jest.doMock("@/components/ui/button", () => ({
  __esModule: true,
  Button: ({ children, ...p }: any) => <button data-testid="ctx-btn" {...p}>{children}</button>,
}), { virtual: true })

jest.doMock("@/components/ui/hover-card", () => {
  const React = require("react")
  return {
    __esModule: true,
    HoverCard: ({ children, closeDelay, openDelay, ...p }: any) => <div data-testid="hovercard" {...p}>{children}</div>,
    HoverCardTrigger: ({ children, asChild, ...p }: any) => {
      if (asChild && React.isValidElement(children)) return React.cloneElement(children, p)
      return <div data-testid="hover-trigger" {...p}>{children}</div>
    },
    HoverCardContent: ({ children, ...p }: any) => <div data-testid="hover-content" {...p}>{children}</div>,
  }
}, { virtual: true })

jest.doMock("@/components/ui/progress", () => ({
  __esModule: true,
  Progress: ({ value, ...p }: any) => <div data-testid="progress" data-value={String(value)} {...p} />,
}), { virtual: true })

jest.doMock("tokenlens", () => ({
  getUsage: () => ({ costUSD: { totalUSD: 1.23 } }),
}))

const {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} = require("../src/components/ai-elements/context")

test("Context components render default usage sections and costs", () => {
  const { getAllByText, getByRole } = render(
    <Context
      usedTokens={50}
      maxTokens={100}
      modelId="m1"
      usage={{ inputTokens: 10, outputTokens: 20, reasoningTokens: 5 } as any}
    >
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextReasoningUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  )

  expect(getAllByText("50%").length).toBeGreaterThan(0)
  expect(getByRole("button")).toBeTruthy()
})

test("Context usage components support children override", () => {
  const { container } = render(
    <Context usedTokens={1} maxTokens={2}>
      <ContextInputUsage>Custom input row</ContextInputUsage>
      <ContextOutputUsage>Custom output row</ContextOutputUsage>
    </Context>
  )
  expect(container.textContent).toContain("Custom input row")
  expect(container.textContent).toContain("Custom output row")
})
