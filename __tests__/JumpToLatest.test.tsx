import { fireEvent, render, screen } from '@testing-library/react';
import { JumpToLatest } from '../components/components/JumpToLatest';

describe('JumpToLatest', () => {
  test('renders the label as the accessible name', () => {
    render(<JumpToLatest onClick={jest.fn()} label="Jump to latest" primaryColor="#0d9488" />);
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeInTheDocument();
  });

  test('shows the label as visible text too', () => {
    render(<JumpToLatest onClick={jest.fn()} label="Jump to latest" primaryColor="#0d9488" />);
    expect(screen.getByText('Jump to latest')).toBeInTheDocument();
  });

  test('reports the click', () => {
    const onClick = jest.fn();
    render(<JumpToLatest onClick={onClick} label="Jump to latest" primaryColor="#0d9488" />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('paints itself in the widget brand colour', () => {
    render(<JumpToLatest onClick={jest.fn()} label="Jump" primaryColor="rgb(13, 148, 136)" />);
    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: 'rgb(13, 148, 136)' });
  });

  test('picks a readable foreground rather than assuming white', () => {
    const { rerender } = render(
      <JumpToLatest onClick={jest.fn()} label="Jump" primaryColor="#ffffff" />,
    );
    const onLight = screen.getByRole('button').style.color;

    rerender(<JumpToLatest onClick={jest.fn()} label="Jump" primaryColor="#000000" />);
    const onDark = screen.getByRole('button').style.color;

    expect(onLight).not.toBe(onDark);
  });

  test('lets clicks through only on the pill, not the sticky strip', () => {
    // The wrapper spans the transcript width; it must not swallow scroll clicks.
    const { container } = render(
      <JumpToLatest onClick={jest.fn()} label="Jump" primaryColor="#0d9488" />,
    );
    expect(container.firstElementChild).toHaveClass('pointer-events-none');
    expect(screen.getByRole('button')).toHaveClass('pointer-events-auto');
  });

  test('hides the decorative chevron from assistive tech', () => {
    const { container } = render(
      <JumpToLatest onClick={jest.fn()} label="Jump" primaryColor="#0d9488" />,
    );
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
