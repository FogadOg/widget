import { fireEvent, render, screen } from '@testing-library/react';
import { Suggestion, Suggestions } from '../src/components/ai-elements/suggestion';

describe('Suggestions', () => {
  test('renders its children in a single non-wrapping row', () => {
    const { container } = render(
      <Suggestions>
        <span>one</span>
        <span>two</span>
      </Suggestions>,
    );
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(container.querySelector('.flex-nowrap')).toBeInTheDocument();
  });

  test('merges a caller className onto the inner row', () => {
    const { container } = render(<Suggestions className="pt-2">x</Suggestions>);
    expect(container.querySelector('.pt-2')).toBeInTheDocument();
  });

  test('renders with no children', () => {
    expect(() => render(<Suggestions />)).not.toThrow();
  });
});

describe('Suggestion', () => {
  test('uses the suggestion text as its label', () => {
    render(<Suggestion suggestion="How do I install it?" />);
    expect(screen.getByRole('button', { name: 'How do I install it?' })).toBeInTheDocument();
  });

  test('reports the suggestion text, not the event, on click', () => {
    const onClick = jest.fn();
    render(<Suggestion suggestion="Pricing?" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledWith('Pricing?');
  });

  test('is safe to click with no handler', () => {
    render(<Suggestion suggestion="Pricing?" />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });

  test('prefers explicit children over the suggestion text', () => {
    render(<Suggestion suggestion="raw">Nicely worded</Suggestion>);
    expect(screen.getByRole('button', { name: 'Nicely worded' })).toBeInTheDocument();
  });

  test('never submits a surrounding form', () => {
    render(<Suggestion suggestion="Pricing?" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  test('merges a caller className', () => {
    render(<Suggestion suggestion="Pricing?" className="mt-1" />);
    expect(screen.getByRole('button')).toHaveClass('mt-1');
  });

  test('forwards arbitrary button props', () => {
    render(<Suggestion suggestion="Pricing?" disabled aria-label="Ask about pricing" />);
    const button = screen.getByRole('button', { name: 'Ask about pricing' });
    expect(button).toBeDisabled();
  });
});
