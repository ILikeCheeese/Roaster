import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importDocument, type ImportResult } from '../services/import';
import { aiStatus } from '../bootstrap';

type Phase = 'idle' | 'working' | 'done' | 'error';

export default function Scan() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    if (aiStatus() !== 'ready') {
      setPhase('error');
      setMessage(
        'The smart scanner is still getting ready (or is not installed on this device). Please wait a moment and try again.',
      );
      return;
    }
    setPhase('working');
    let last: ImportResult | null = null;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setMessage(`Reading "${f.name}" (${i + 1} of ${files.length})…`);
        last = await importDocument({ file: f, mime: f.type || 'image/jpeg', origFilename: f.name });
      }
      setResult(last);
      setPhase('done');
    } catch (err) {
      setPhase('error');
      setMessage(String(err instanceof Error ? err.message : err));
    }
  }

  return (
    <div className="stack">
      <h1>Scan a Paper</h1>
      <p className="tile-sub">
        Take a photo of a document, or add a file already on this device. GrandVault reads
        it, files it in the right category, and makes it searchable — all on this device.
      </p>

      {phase === 'idle' || phase === 'error' ? (
        <div className="tiles">
          <button className="tile" onClick={() => cameraRef.current?.click()} style={{ cursor: 'pointer' }}>
            <span className="tile-icon" aria-hidden>📷</span>
            <span className="tile-title">Use the camera</span>
            <span className="tile-sub">Best on iPad — point at the paper</span>
          </button>
          <button className="tile" onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
            <span className="tile-icon" aria-hidden>📁</span>
            <span className="tile-title">Choose a file</span>
            <span className="tile-sub">Photos or PDF from this device</span>
          </button>
        </div>
      ) : null}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {phase === 'working' && (
        <div className="notice info" aria-live="polite">
          ⏳ {message}
          <div className="hint">This can take a few seconds per page. Everything stays on this device.</div>
        </div>
      )}

      {phase === 'error' && <div className="notice error">⚠️ {message}</div>}

      {phase === 'done' && result && (
        <div className="card stack">
          <div className="notice ok">✅ Saved “{result.title}”.</div>
          <p>
            Filed under <strong>{result.category}</strong>
            {result.categorySource === 'user' ? '' : ' (you can change this).'}
          </p>
          {(result.ssnRedactions > 0 || result.accountRedactions > 0) && (
            <div className="notice warn">
              🛡️ For your safety, GrandVault automatically hid{' '}
              {result.ssnRedactions > 0 && <>{result.ssnRedactions} Social Security number(s) </>}
              {result.accountRedactions > 0 && <>and {result.accountRedactions} account/card number(s) </>}
              found on this paper. Only the last 4 digits were kept.
            </div>
          )}
          <div className="row">
            <button className="btn-primary" onClick={() => navigate(`/documents/${result.id}`)}>
              View this document
            </button>
            <button className="btn-ghost" onClick={() => { setPhase('idle'); setResult(null); }}>
              Scan another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
