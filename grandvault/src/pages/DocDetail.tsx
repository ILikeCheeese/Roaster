import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, db, type Category, type DocumentRecord } from '../db/dexie';
import { setCategory } from '../services/import';
import { checkExportAllowed } from '../services/exportGate';
import CanvasImage from '../components/CanvasImage';
import CodePrompt from '../components/CodePrompt';
import { rebuildIndex } from '../services/search';

export default function DocDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [showText, setShowText] = useState(false);
  const [gate, setGate] = useState<null | (() => void)>(null);

  useEffect(() => {
    if (id) db.documents.get(Number(id)).then((d) => setDoc(d ?? null));
  }, [id]);

  if (!doc) return <p>Loading…</p>;

  const isImage = doc.mime.startsWith('image/');

  async function changeCategory(c: Category) {
    await setCategory(doc!.id!, c);
    setDoc({ ...doc!, category: c, categorySource: 'user' });
  }

  /** Wrap any out-of-app action behind the daily family code. */
  async function guarded(action: () => void) {
    const res = await checkExportAllowed();
    if (res.allowed) action();
    else setGate(() => action);
  }

  function doDownload() {
    const url = URL.createObjectURL(doc!.fileBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc!.origFilename || `${doc!.title}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doShare() {
    const file = new File([doc!.fileBlob], doc!.origFilename || `${doc!.title}`, { type: doc!.mime });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: doc!.title });
    } else {
      doDownload();
    }
  }

  async function remove() {
    if (!confirm('Remove this document from GrandVault? This cannot be undone.')) return;
    await db.documents.delete(doc!.id!);
    await rebuildIndex();
    navigate('/documents');
  }

  return (
    <div className="stack">
      <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      <h1>{doc.title}</h1>

      <div className="row">
        <span className="badge">{doc.category}{doc.categorySource !== 'user' && ' • auto'}</span>
        <span className="badge">{doc.pageCount} page{doc.pageCount > 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        {isImage ? (
          <CanvasImage blob={doc.fileBlob} />
        ) : (
          <div className="doc-thumb" style={{ height: 220, fontSize: '5rem' }} aria-hidden>📄</div>
        )}
      </div>

      <section className="card stack">
        <h3>Put in a different category</h3>
        <div className="pill-row">
          {CATEGORIES.map((c) => (
            <button key={c} className={'pill' + (doc.category === c ? ' active' : '')} onClick={() => changeCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="hint">Changing this also helps GrandVault sort similar papers better next time.</div>
      </section>

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>What the paper says</h3>
          <button className="btn-ghost" onClick={() => setShowText((s) => !s)}>
            {showText ? 'Hide' : 'Show'} text
          </button>
        </div>
        {showText && (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', margin: 0 }}>
            {doc.ocrText || '(No readable text was found on this paper.)'}
          </pre>
        )}
        <div className="hint">Sensitive numbers were automatically hidden when this was scanned.</div>
      </section>

      <section className="card stack">
        <h3>Send or save a copy</h3>
        <div className="notice warn" style={{ fontSize: 'var(--fs-sm)' }}>
          Sending or saving needs today's <strong>family code</strong>. This protects you
          from anyone trying to trick you into sharing your papers.
        </div>
        <div className="row">
          <button className="btn-accent" onClick={() => guarded(doShare)}>📤 Send / Share</button>
          <button className="btn-ghost" onClick={() => guarded(doDownload)}>💾 Save a copy</button>
          <button className="btn-danger" onClick={remove}>🗑️ Remove</button>
        </div>
      </section>

      {gate && (
        <CodePrompt
          onUnlock={() => { const a = gate; setGate(null); a(); }}
          onCancel={() => setGate(null)}
        />
      )}
    </div>
  );
}
