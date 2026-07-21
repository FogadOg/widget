import { useState, useEffect, useRef, useCallback } from 'react'
import { API } from '../../../../lib/api'
import { fetchWithTimeout } from '../resilientFetch'
import { TIMEOUTS } from '../../../../lib/constants'

export type SearchHit = {
  id: string
  type: 'file' | 'qa' | 'url'
  title: string
  snippet: string
  source_url: string | null
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; hits: SearchHit[]; query: string }
  | { status: 'error' }

const DEBOUNCE_MS = 300
const MIN_QUERY_LEN = 2

export function useInstantSearch(
  agentId: string,
  authToken: string | null,
  embedHeaders: Record<string, string>,
) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQuery = useRef('')

  const runSearch = useCallback(
    async (q: string) => {
      if (!authToken || !agentId) return
      lastQuery.current = q
      setState({ status: 'loading' })
      try {
        const res = await fetchWithTimeout(
          API.widgetKnowledgeSearch(agentId, q),
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${authToken}`,
              ...embedHeaders,
            },
          },
          TIMEOUTS.WIDGET_LOAD,
        )
        if (!res.ok) {
          setState({ status: 'error' })
          return
        }
        const data = await res.json()
        // Guard against stale responses from a previous slower query
        if (lastQuery.current !== q) return
        setState({ status: 'success', hits: data.hits ?? [], query: q })
      } catch {
        if (lastQuery.current === q) {
          setState({ status: 'error' })
        }
      }
    },
    [agentId, authToken, embedHeaders],
  )

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    // The too-short/empty case resets state synchronously in updateQuery
    // (the event that causes it), not here, so there's nothing to do but
    // skip scheduling a search.
    if (!query || query.trim().length < MIN_QUERY_LEN) {
      return
    }

    debounceTimer.current = setTimeout(() => {
      runSearch(query.trim())
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, runSearch])

  const updateQuery = useCallback((value: string) => {
    setQuery(value)
    if (!value || value.trim().length < MIN_QUERY_LEN) {
      setState((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }))
    }
  }, [])

  const clearSearch = useCallback(() => {
    setQuery('')
    setState((prev) => (prev.status === 'idle' ? prev : { status: 'idle' }))
  }, [])

  const retry = useCallback(() => {
    const q = lastQuery.current.trim()
    if (q.length >= MIN_QUERY_LEN) runSearch(q)
  }, [runSearch])

  return { query, setQuery: updateQuery, state, clearSearch, retry }
}
