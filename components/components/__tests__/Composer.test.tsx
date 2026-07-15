import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from '../Composer';

function renderComposer(over: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const inputRef = React.createRef<HTMLTextAreaElement>();
  const props: React.ComponentProps<typeof Composer> = {
    input: '',
    setInput: jest.fn(),
    onSubmit: jest.fn(),
    isTyping: false,
    primaryColor: '#2563eb',
    backgroundColor: '#ffffff',
    subtleBorderColor: '#e5e7eb',
    buttonBorderRadius: 8,
    fontStyles: {},
    placeholder: 'Type a message',
    ariaLabel: 'Message',
    sendLabel: 'Send',
    stopLabel: 'Stop',
    inputRef,
    ...over,
  };
  const utils = render(<Composer {...props} />);
  return { ...utils, props };
}

describe('Composer', () => {
  it('disables the send button when input is empty', () => {
    renderComposer({ input: '   ' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('enables the send button when there is non-whitespace input and not typing', () => {
    renderComposer({ input: 'hello' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('submits on Enter when able to send', () => {
    const onSubmit = jest.fn();
    renderComposer({ input: 'hello', onSubmit });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit on Shift+Enter (newline)', () => {
    const onSubmit = jest.fn();
    renderComposer({ input: 'hello', onSubmit });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit on Enter when input is empty', () => {
    const onSubmit = jest.fn();
    renderComposer({ input: '', onSubmit });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits via the form when the send button is clicked', () => {
    const onSubmit = jest.fn();
    renderComposer({ input: 'hello', onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('updates input and auto-grows the textarea on change', () => {
    const setInput = jest.fn();
    renderComposer({ setInput });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'abc' } });
    expect(setInput).toHaveBeenCalledWith('abc');
  });

  it('shows a stop button while typing when onStop is provided and calls it', () => {
    const onStop = jest.fn();
    renderComposer({ isTyping: true, onStop, input: 'x' });
    const stop = screen.getByRole('button', { name: 'Stop' });
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('shows the busy send button (not stop) while typing without onStop', () => {
    renderComposer({ isTyping: true, input: 'x' });
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-busy', 'true');
    expect(send).toBeDisabled();
  });

  it('renders the attach button and pending attachments when file upload is enabled', () => {
    const onRemoveAttachment = jest.fn();
    renderComposer({
      fileUploadEnabled: true,
      pendingAttachments: [{ id: 'a1', filename: 'notes.pdf' }],
      onRemoveAttachment,
      attachLabel: 'Attach',
    });
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
    expect(screen.getByText(/notes\.pdf/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.pdf' }));
    expect(onRemoveAttachment).toHaveBeenCalledTimes(1);
  });

  it('shows an uploading spinner region when files are uploading', () => {
    const { container } = renderComposer({ fileUploadEnabled: true, uploadingFiles: 2 });
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('forwards picked files to onPickFiles', () => {
    const onPickFiles = jest.fn();
    const { container } = renderComposer({ fileUploadEnabled: true, onPickFiles });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'doc.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onPickFiles).toHaveBeenCalledTimes(1);
  });
});
