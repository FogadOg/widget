import { fireEvent, render, screen } from '@testing-library/react';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '../src/components/ai-elements/sources';

const Citations = ({ count = 2 }: { count?: number }) => (
  <Sources>
    <SourcesTrigger count={count} />
    <SourcesContent>
      <Source href="https://example.com/a" title="Getting started" />
      <Source href="https://example.com/b" title="Pricing" />
    </SourcesContent>
  </Sources>
);

describe('Sources', () => {
  test('renders a collapsed citation list', () => {
    render(<Citations />);
    expect(screen.getByRole('button', { name: /Used 2 sources/ })).toBeInTheDocument();
  });

  test('keeps the citations hidden until the trigger is used', () => {
    render(<Citations />);
    expect(screen.queryByRole('link', { name: /Getting started/ })).not.toBeInTheDocument();
  });

  test('reveals the citations when opened', () => {
    render(<Citations />);

    fireEvent.click(screen.getByRole('button', { name: /Used 2 sources/ }));

    expect(screen.getByRole('link', { name: /Getting started/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pricing/ })).toBeInTheDocument();
  });

  test('merges a caller className on the wrapper', () => {
    const { container } = render(<Sources className="mt-6" />);
    expect(container.querySelector('.mt-6')).toBeInTheDocument();
  });
});

describe('SourcesTrigger', () => {
  test('names the number of sources used', () => {
    render(
      <Sources>
        <SourcesTrigger count={5} />
      </Sources>,
    );
    expect(screen.getByText('Used 5 sources')).toBeInTheDocument();
  });

  test('prefers explicit children over the default label', () => {
    render(
      <Sources>
        <SourcesTrigger count={5}>Where this came from</SourcesTrigger>
      </Sources>,
    );
    expect(screen.getByText('Where this came from')).toBeInTheDocument();
    expect(screen.queryByText('Used 5 sources')).not.toBeInTheDocument();
  });

  test('merges a caller className', () => {
    render(
      <Sources>
        <SourcesTrigger count={1} className="font-bold" />
      </Sources>,
    );
    expect(screen.getByRole('button')).toHaveClass('font-bold');
  });
});

describe('Source', () => {
  test('links out to the cited page', () => {
    render(<Source href="https://example.com/docs" title="Docs" />);
    const link = screen.getByRole('link', { name: /Docs/ });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
  });

  test('opens in a new tab without leaking the referrer', () => {
    // Citations point at third-party pages.
    render(<Source href="https://example.com/docs" title="Docs" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  test('prefers explicit children over the title', () => {
    render(
      <Source href="https://example.com/docs" title="Docs">
        Custom label
      </Source>,
    );
    expect(screen.getByRole('link', { name: 'Custom label' })).toBeInTheDocument();
  });

  test('renders without a title', () => {
    expect(() => render(<Source href="https://example.com" />)).not.toThrow();
  });
});

describe('SourcesContent', () => {
  test('merges a caller className', () => {
    const { container } = render(
      <Sources defaultOpen>
        <SourcesContent className="gap-4">
          <Source href="https://example.com" title="A" />
        </SourcesContent>
      </Sources>,
    );
    expect(container.querySelector('.gap-4')).toBeInTheDocument();
  });
});
