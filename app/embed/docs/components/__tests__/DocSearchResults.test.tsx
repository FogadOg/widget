import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocSearchResults } from '../DocSearchResults';
import type { SearchHit } from '../../hooks/useInstantSearch';

const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  id: 'h1',
  type: 'file',
  title: 'Getting started guide',
  snippet: 'Learn how to get started quickly',
  source_url: null,
  ...over,
});

const baseProps = {
  hits: [] as SearchHit[],
  query: '',
  loading: false,
  noResultsLabel: 'No results for "{query}"',
  resultsLabel: 'Search results',
  onSelect: jest.fn(),
};

describe('DocSearchResults', () => {
  it('renders a loading status placeholder while loading', () => {
    render(<DocSearchResults {...baseProps} loading />);
    const status = screen.getByRole('status', { name: 'Search results' });
    expect(status).toBeInTheDocument();
  });

  it('renders the no-results message with the query interpolated', () => {
    render(<DocSearchResults {...baseProps} query="widgets" />);
    expect(screen.getByText('No results for "widgets"')).toBeInTheDocument();
  });

  it('renders a listbox of hits and calls onSelect when a hit is clicked', () => {
    const onSelect = jest.fn();
    const hits = [hit(), hit({ id: 'h2', title: 'Second doc' })];
    render(<DocSearchResults {...baseProps} hits={hits} onSelect={onSelect} />);

    const list = screen.getByRole('listbox', { name: 'Search results' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);

    fireEvent.click(screen.getByText('Getting started guide'));
    expect(onSelect).toHaveBeenCalledWith(hits[0]);
  });

  it('highlights the matching portion of the title and snippet when a query is present', () => {
    render(
      <DocSearchResults
        {...baseProps}
        hits={[hit({ title: 'Getting started', snippet: 'started here' })]}
        query="start"
      />,
    );
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks[0].textContent?.toLowerCase()).toBe('start');
  });

  it('does not render highlight marks when the query does not match', () => {
    render(
      <DocSearchResults
        {...baseProps}
        hits={[hit({ title: 'Alpha', snippet: 'beta' })]}
        query="zzz"
      />,
    );
    expect(document.querySelectorAll('mark')).toHaveLength(0);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('omits the snippet paragraph when a hit has no snippet', () => {
    render(
      <DocSearchResults
        {...baseProps}
        hits={[hit({ id: 'nos', title: 'No snippet doc', snippet: '' })]}
        query=""
      />,
    );
    expect(screen.getByText('No snippet doc')).toBeInTheDocument();
    expect(document.querySelector('p')).toBeNull();
  });

  it('renders the type-specific icon and falls back for unknown types', () => {
    render(
      <DocSearchResults
        {...baseProps}
        hits={[
          hit({ id: 'file', type: 'file', title: 'File hit' }),
          hit({ id: 'qa', type: 'qa', title: 'QA hit' }),
          hit({ id: 'url', type: 'url', title: 'URL hit' }),
          // Unknown type exercises the `?? '📄'` fallback branch
          hit({ id: 'other', type: 'mystery' as SearchHit['type'], title: 'Other hit' }),
        ]}
      />,
    );
    expect(screen.getByText('💬')).toBeInTheDocument();
    expect(screen.getByText('🔗')).toBeInTheDocument();
    expect(screen.getAllByText('📄')).toHaveLength(2); // file + fallback
  });

  it('handles mouse enter and leave on a hit without error', () => {
    // jsdom does not apply `var(--accent)` as a computed background, but firing
    // the events still exercises the hover handlers for coverage.
    render(<DocSearchResults {...baseProps} hits={[hit()]} />);
    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    expect(button).toBeInTheDocument();
  });
});
