import { fireEvent, render, screen } from '@testing-library/react';
import { FocusTrap } from '../components/components/FocusTrap';

const Panel = ({ onEscape }: { onEscape?: () => void }) => (
  <FocusTrap onEscape={onEscape}>
    <button type="button">first</button>
    <button type="button">middle</button>
    <button type="button">last</button>
  </FocusTrap>
);

const trapRoot = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('FocusTrap', () => {
  test('renders its children', () => {
    render(<Panel />);
    expect(screen.getByText('middle')).toBeInTheDocument();
  });

  test('moves focus to the first focusable element on mount', () => {
    render(<Panel />);
    expect(screen.getByText('first')).toHaveFocus();
  });

  test('wraps Tab from the last element back to the first', () => {
    const { container } = render(<Panel />);
    screen.getByText('last').focus();

    fireEvent.keyDown(trapRoot(container), { key: 'Tab' });

    expect(screen.getByText('first')).toHaveFocus();
  });

  test('wraps Shift+Tab from the first element to the last', () => {
    const { container } = render(<Panel />);
    screen.getByText('first').focus();

    fireEvent.keyDown(trapRoot(container), { key: 'Tab', shiftKey: true });

    expect(screen.getByText('last')).toHaveFocus();
  });

  test('leaves Tab alone in the middle of the sequence', () => {
    const { container } = render(<Panel />);
    screen.getByText('middle').focus();

    fireEvent.keyDown(trapRoot(container), { key: 'Tab' });

    // The browser handles the ordinary case; focus must not jump.
    expect(screen.getByText('middle')).toHaveFocus();
  });

  test('reports Escape to the caller', () => {
    const onEscape = jest.fn();
    const { container } = render(<Panel onEscape={onEscape} />);

    fireEvent.keyDown(trapRoot(container), { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  test('tolerates Escape with no handler', () => {
    const { container } = render(<Panel />);
    expect(() => fireEvent.keyDown(trapRoot(container), { key: 'Escape' })).not.toThrow();
  });

  test('ignores keys other than Tab and Escape', () => {
    const onEscape = jest.fn();
    const { container } = render(<Panel onEscape={onEscape} />);
    screen.getByText('first').focus();

    fireEvent.keyDown(trapRoot(container), { key: 'a' });

    expect(onEscape).not.toHaveBeenCalled();
    expect(screen.getByText('first')).toHaveFocus();
  });

  test('does nothing when there is nothing focusable inside', () => {
    const { container } = render(
      <FocusTrap>
        <p>Just text</p>
      </FocusTrap>,
    );

    expect(() => fireEvent.keyDown(trapRoot(container), { key: 'Tab' })).not.toThrow();
  });

  test('restores the previously focused element on unmount', () => {
    // Closing the panel should put the visitor back where they were.
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<Panel />);
    expect(screen.getByText('first')).toHaveFocus();

    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });
});
