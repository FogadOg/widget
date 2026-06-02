import React from 'react'
import { render, screen } from '@testing-library/react'

import Conversation, { ConversationContent, ConversationScrollButton } from '../components/ai-elements/conversation'
import * as Msg from '../components/ai-elements/message'
import * as MS from '../components/ai-elements/model-selector'
import * as PI from '../components/ai-elements/prompt-input'
import * as R from '../components/ai-elements/reasoning'
import * as S from '../components/ai-elements/sources'
import * as SG from '../components/ai-elements/suggestion'

describe('ai-elements smoke', () => {
  test('conversation and subcomponents render', () => {
    render(<Conversation><ConversationContent>c</ConversationContent><ConversationScrollButton /></Conversation>)
    expect(screen.getByText('c')).toBeInTheDocument()
  })

  test('message elements render', () => {
    render(<div>
      <Msg.Message from="agent">x</Msg.Message>
      <Msg.MessageResponse>r</Msg.MessageResponse>
    </div>)
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText('r')).toBeInTheDocument()
  })

  test('other ai-elements render', () => {
    render(<div>
      <MS.ModelSelector />
      <PI.PromptInput onSubmit={() => {}} />
      <R.Reasoning>rr</R.Reasoning>
      <S.Sources>src</S.Sources>
      <SG.Suggestion suggestion="sug" onClick={() => {}} />
    </div>)
    expect(screen.getByText('rr') || screen.getByText('src') || screen.getByText('sug')).toBeTruthy()
  })
})
