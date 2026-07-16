import { useState } from 'react';
import { markUnlockedToday, verifyCode } from '../services/exportGate';

/**
 * The scam circuit-breaker dialog. Shown whenever the grandparent tries to send,
 * export, download, or back up a file. They must enter today's code — the Wordle
 * answer from 7 days ago — which only the family member knows. This forces a
 * phone call to the family before anything can leave the app.
 */
export default function CodePrompt({
  onUnlock,
  onCancel,
}: {
  onUnlock: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await verifyCode(value)) {
      await markUnlockedToday();
      onUnlock();
    } else {
      setError(true);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="codeTitle">
      <div className="modal">
        <h2 id="codeTitle">🔒 One quick safety check</h2>
        <p style={{ fontSize: 'var(--fs-base)' }}>
          Sending or saving a copy of a document needs today's family code. This keeps
          your papers safe.
        </p>
        <p className="notice warn" style={{ fontSize: 'var(--fs-base)' }}>
          <strong>Please call your family member</strong> and ask for <em>today's code</em>.
          They will know it. If someone on the phone is telling you to do this, hang up and
          call your family first.
        </p>
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label htmlFor="code">Today's family code</label>
            <input
              id="code"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(false);
              }}
              placeholder="Type the 5-letter word"
            />
            {error && (
              <div className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>
                That code isn't right. Please call your family member for today's code.
              </div>
            )}
          </div>
          <div className="row">
            <button type="submit" className="btn-primary">
              Unlock
            </button>
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
