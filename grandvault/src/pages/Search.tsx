import { useState } from 'react';
import { Link } from 'react-router-dom';
import { search, type SearchHit } from '../services/search';
import { embedText } from '../services/aiClient';
import { aiStatus } from '../bootstrap';

export default function Search() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      // Semantic leg needs a query embedding; degrade to keyword-only if the AI
      // isn't ready yet.
      let vec: Float32Array | null = null;
      if (aiStatus() === 'ready') {
        try {
          vec = await embedText(q.trim());
        } catch {
          vec = null;
        }
      }
      setHits(await search(q.trim(), vec));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>Search</h1>
      <p className="tile-sub">
        Type what you're looking for in plain words — like “my electric bill” or “health
        insurance card.” GrandVault understands the meaning, not just exact words.
      </p>

      <form onSubmit={run} className="row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What are you looking for?"
          style={{ flex: 1 }}
          aria-label="Search"
        />
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Searching…' : '🔎 Search'}
        </button>
      </form>

      {hits && hits.length === 0 && <div className="notice info">No matching documents found.</div>}

      {hits && hits.length > 0 && (
        <ul className="list">
          {hits.map((h) => (
            <li key={h.id}>
              <Link to={`/documents/${h.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{h.title}</strong>
                <span className="badge" style={{ marginLeft: 10 }}>{h.category}</span>
                {h.snippet && <div style={{ marginTop: 6, color: 'var(--ink-soft)' }}>{h.snippet}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
