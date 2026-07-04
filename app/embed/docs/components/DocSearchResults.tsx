import type { ReactNode } from 'react'
import { SearchHit } from '../hooks/useInstantSearch'

interface Props {
  hits: SearchHit[]
  query: string
  loading: boolean
  noResultsLabel: string
  resultsLabel: string
  onSelect: (hit: SearchHit) => void
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const lowerQ = query.toLowerCase()
  const idx = lower.indexOf(lowerQ)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: '2px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

const TYPE_ICON: Record<string, string> = {
  file: '📄',
  qa: '💬',
  url: '🔗',
}

export function DocSearchResults({ hits, query, loading, noResultsLabel, resultsLabel, onSelect }: Props) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label={resultsLabel}
        style={{ padding: '12px 16px', display: 'flex', gap: '6px', alignItems: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}
      >
        <span className="w-3 h-3 rounded-full bg-muted-foreground animate-pulse inline-block" />
        <span className="w-3 h-3 rounded-full bg-muted-foreground animate-pulse inline-block" style={{ animationDelay: '0.15s' }} />
        <span className="w-3 h-3 rounded-full bg-muted-foreground animate-pulse inline-block" style={{ animationDelay: '0.3s' }} />
      </div>
    )
  }

  if (hits.length === 0) {
    return (
      <div
        role="status"
        style={{ padding: '12px 16px', color: 'var(--muted-foreground)', fontSize: '13px' }}
      >
        {noResultsLabel.replace('{query}', query)}
      </div>
    )
  }

  return (
    <ul
      role="listbox"
      aria-label={resultsLabel}
      style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}
    >
      {hits.map((hit) => (
        <li key={hit.id} role="option" aria-selected={false}>
          <button
            type="button"
            onClick={() => onSelect(hit)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
              <span aria-hidden style={{ fontSize: '12px' }}>{TYPE_ICON[hit.type] ?? '📄'}</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.3 }}>
                {highlight(hit.title, query)}
              </span>
            </div>
            {hit.snippet && (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {highlight(hit.snippet, query)}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
