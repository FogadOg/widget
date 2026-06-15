import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HandoffModal } from '../app/embed/HandoffModal';

const defaultTranslations = {
  handoffTitle: 'Talk to our team',
  handoffNameLabel: 'Name',
  handoffEmailLabel: 'Email',
  handoffMessageLabel: 'Message',
  handoffSubmitButton: 'Send Request',
  handoffSubmittingButton: 'Sending...',
  handoffError: 'Something went wrong. Please try again.',
  dismiss: 'Dismiss',
};

describe('HandoffModal', () => {
  it('renders all fields and title', () => {
    render(
      <HandoffModal
        lastUserMessage="help me"
        translations={defaultTranslations}
        onSubmit={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Talk to our team')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Send Request')).toBeInTheDocument();
  });

  it('pre-fills message with lastUserMessage', () => {
    render(
      <HandoffModal
        lastUserMessage="I need help"
        translations={defaultTranslations}
        onSubmit={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    const textarea = screen.getByRole('textbox', { name: /message/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('I need help');
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = jest.fn();
    render(
      <HandoffModal
        lastUserMessage=""
        translations={defaultTranslations}
        onSubmit={jest.fn()}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit with form values on submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <HandoffModal
        lastUserMessage="pre-filled"
        translations={defaultTranslations}
        onSubmit={onSubmit}
        onDismiss={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /message/i }), {
      target: { value: 'I need support' },
    });

    fireEvent.submit(screen.getByRole('button', { name: /send request/i }).closest('form')!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Jane Doe', 'jane@example.com', 'I need support');
    });
  });

  it('shows error message when onSubmit rejects', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('network fail'));
    render(
      <HandoffModal
        lastUserMessage=""
        translations={defaultTranslations}
        onSubmit={onSubmit}
        onDismiss={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /send request/i }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows submitting state while onSubmit is pending', async () => {
    let resolve!: () => void;
    const onSubmit = jest.fn(
      () => new Promise<void>((res) => { resolve = res; })
    );

    render(
      <HandoffModal
        lastUserMessage=""
        translations={defaultTranslations}
        onSubmit={onSubmit}
        onDismiss={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /send request/i }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument();
    });

    resolve();

    await waitFor(() => {
      expect(screen.getByText('Send Request')).toBeInTheDocument();
    });
  });

  it('uses translated strings from props', () => {
    const frTranslations = {
      ...defaultTranslations,
      handoffTitle: 'Parler à notre équipe',
      handoffSubmitButton: 'Envoyer la demande',
    };

    render(
      <HandoffModal
        lastUserMessage=""
        translations={frTranslations}
        onSubmit={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('Parler à notre équipe')).toBeInTheDocument();
    expect(screen.getByText('Envoyer la demande')).toBeInTheDocument();
  });
});
