import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, db, type Category, type DocumentRecord } from '../db/dexie';

const ICON: Record<Category, string> = {
  Banking: '🏦',
  Insurance: '🛡️',
  Medical: '⚕️',
  Taxes: '🧾',
  Utilities: '💡',
  'Legal/Estate': '⚖️',
  Investments: '📈',
  Property: '🏠',
  'Government/ID': '🪪',
  Subscriptions: '🔁',
  Uncategorized: '❓',
};

export default function Documents() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [filter, setFilter] = useState<Category | 'All'>('All');

  useEffect(() => {
    db.documents.orderBy('importedAt').reverse().toArray().then(setDocs);
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach((d) => m.set(d.category, (m.get(d.category) ?? 0) + 1));
    return m;
  }, [docs]);

  const shown = filter === 'All' ? docs : docs.filter((d) => d.category === filter);

  return (
    <div className="stack">
      <h1>My Documents</h1>
      <div className="pill-row">
        <button className={'pill' + (filter === 'All' ? ' active' : '')} onClick={() => setFilter('All')}>
          All ({docs.length})
        </button>
        {CATEGORIES.filter((c) => counts.get(c)).map((c) => (
          <button key={c} className={'pill' + (filter === c ? ' active' : '')} onClick={() => setFilter(c)}>
            {ICON[c]} {c} ({counts.get(c)})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="notice info">
          No documents yet. Go to <Link to="/scan">Scan a Paper</Link> to add your first one.
        </div>
      ) : (
        <div className="doc-grid">
          {shown.map((d) => (
            <Link key={d.id} to={`/documents/${d.id}`} className="doc-card">
              <div className="doc-thumb" aria-hidden>{ICON[d.category]}</div>
              <strong>{d.title}</strong>
              <div className="tile-sub">
                {ICON[d.category]} {d.category}
                {d.categorySource !== 'user' && ' • auto'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
