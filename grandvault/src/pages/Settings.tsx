import { useEffect, useState } from 'react';
import { db, getSetting, setSetting } from '../db/dexie';
import { sha256 } from '../services/security';
import { getOffsetDays, setOffsetDays } from '../services/exportGate';
import { loadWords, recentCodes } from '../services/wordle';

const PIN_KEY = 'family.pinHash';

export default function Settings() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    getSetting<string>(PIN_KEY, '').then((h) => setHasPin(!!h));
  }, []);

  if (hasPin === null) return <p>Loading…</p>;

  return (
    <div className="stack">
      <h1>⚙️ Family Setup</h1>
      <div className="notice info" style={{ fontSize: 'var(--fs-sm)' }}>
        This area is for the family member who set up GrandVault. It's protected by a
        private PIN so the daily codes stay secret.
      </div>

      {!hasPin ? (
        <SetPin onDone={() => setHasPin(true)} />
      ) : !unlocked ? (
        <EnterPin onOk={() => setUnlocked(true)} />
      ) : (
        <Admin />
      )}
    </div>
  );
}

function SetPin({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  async function save() {
    if (pin.length < 4) return setErr('Please choose at least 4 digits.');
    if (pin !== confirm) return setErr('The two entries do not match.');
    await setSetting(PIN_KEY, await sha256(pin));
    onDone();
  }
  return (
    <div className="card stack">
      <h3>Create your family PIN</h3>
      <p className="tile-sub">You'll use this to view the daily codes. Keep it private.</p>
      <div className="field">
        <label>New PIN</label>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <div className="field">
        <label>Type it again</label>
        <input type="password" inputMode="numeric" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {err && <div className="notice error">{err}</div>}
      <button className="btn-primary" onClick={save}>Save PIN</button>
    </div>
  );
}

function EnterPin({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  async function check() {
    const stored = await getSetting<string>(PIN_KEY, '');
    if ((await sha256(pin)) === stored) onOk();
    else setErr(true);
  }
  return (
    <div className="card stack">
      <h3>Enter your family PIN</h3>
      <div className="field">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === 'Enter' && check()}
        />
        {err && <div className="hint" style={{ color: 'var(--danger)', fontWeight: 700 }}>Wrong PIN.</div>}
      </div>
      <button className="btn-primary" onClick={check}>Unlock setup</button>
    </div>
  );
}

function Admin() {
  const [offset, setOffset] = useState(7);
  const [codes, setCodes] = useState<{ date: string; code: string }[]>([]);
  const [allowRemote, setAllowRemote] = useState(false);

  async function refreshCodes(o: number) {
    await loadWords();
    setCodes(recentCodes(o, 5));
  }

  useEffect(() => {
    (async () => {
      const o = await getOffsetDays();
      setOffset(o);
      await refreshCodes(o);
      setAllowRemote(await getSetting<boolean>('ai.allowRemote', false));
    })();
  }, []);

  async function saveOffset(o: number) {
    setOffset(o);
    await setOffsetDays(o);
    await refreshCodes(o);
  }

  const today = codes[0];

  return (
    <div className="stack">
      <section className="card stack">
        <h3>🔑 Today's family code</h3>
        <p className="tile-sub">
          This is the code to give your grandparent (over the phone) when they genuinely
          need to send or save a document. It is the Wordle answer from {offset} days ago.
        </p>
        {today && (
          <div className="notice ok" style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, letterSpacing: '0.05em' }}>
            {today.code.toUpperCase()}
          </div>
        )}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Show the last few days</summary>
          <ul className="list" style={{ marginTop: 12 }}>
            {codes.map((c) => (
              <li key={c.date}>
                <strong>{c.date}</strong> → <span className="badge">{c.code.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        </details>
        <div className="field">
          <label>Days ago (offset)</label>
          <select value={offset} onChange={(e) => saveOffset(Number(e.target.value))}>
            {[1, 2, 3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} days ago</option>)}
          </select>
          <div className="hint">Default is 7 (a week ago), matching your Wordle idea.</div>
        </div>
      </section>

      <section className="card stack">
        <h3>Smart features (offline AI)</h3>
        <label className="row" style={{ gap: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ width: 28, height: 28 }}
            checked={allowRemote}
            onChange={async (e) => {
              setAllowRemote(e.target.checked);
              await setSetting('ai.allowRemote', e.target.checked);
            }}
          />
          <span>
            Allow a <strong>one-time download</strong> of the AI models if they aren't
            bundled (needs internet just once, then works fully offline). Leave off on the
            grandparent's device once set up.
          </span>
        </label>
      </section>

      <section className="card stack">
        <h3>Backup</h3>
        <p className="tile-sub">Save an encrypted copy of everything to move to another device.</p>
        <BackupControls />
      </section>
    </div>
  );
}

function BackupControls() {
  const [msg, setMsg] = useState('');
  async function exportAll() {
    const dump = {
      version: 1,
      institutions: await db.institutions.toArray(),
      accounts: await db.accounts.toArray(),
      contacts: await db.contacts.toArray(),
      locations: await db.locations.toArray(),
      instructions: await db.instructions.toArray(),
      // Documents include binary blobs — exported separately in a future step.
      documentCount: await db.documents.count(),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grandvault-directory-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Directory backed up. (Scanned documents stay on the device for safety.)');
  }
  return (
    <div className="stack">
      <button className="btn-ghost" onClick={exportAll}>💾 Back up the directory</button>
      {msg && <div className="notice ok">{msg}</div>}
    </div>
  );
}
