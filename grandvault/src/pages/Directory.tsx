import { useEffect, useState } from 'react';
import { db, type Account, type Instruction } from '../db/dexie';
import { redactField, toLast4 } from '../services/redact';

type Tab = 'institutions' | 'accounts' | 'contacts' | 'locations' | 'instructions';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'institutions', label: 'Banks & Companies', icon: '🏦' },
  { key: 'accounts', label: 'Accounts', icon: '💳' },
  { key: 'contacts', label: 'People to Call', icon: '📞' },
  { key: 'locations', label: 'Where Papers Live', icon: '📍' },
  { key: 'instructions', label: 'Reminders', icon: '📌' },
];

export default function Directory() {
  const [tab, setTab] = useState<Tab>('institutions');
  return (
    <div className="stack">
      <h1>Accounts &amp; Contacts</h1>
      <div className="notice info" style={{ fontSize: 'var(--fs-sm)' }}>
        This is a safe list of <strong>where things are</strong> and <strong>who to call</strong>.
        It never stores passwords, full account numbers, or full Social Security numbers —
        only the last 4 digits, so you can recognize an account.
      </div>
      <div className="pill-row">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'pill' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      {tab === 'institutions' && <Institutions />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'contacts' && <Contacts />}
      {tab === 'locations' && <Locations />}
      {tab === 'instructions' && <Instructions />}
    </div>
  );
}

function useRows<T>(load: () => Promise<T[]>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const refresh = () => load().then(setRows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    refresh();
  }, deps);
  return { rows, refresh };
}

function Institutions() {
  const { rows, refresh } = useRows(() => db.institutions.orderBy('name').toArray());
  const [form, setForm] = useState({ name: '', type: '', website: '', phone: '', notes: '' });

  async function add() {
    if (!form.name.trim()) return;
    await db.institutions.add({
      name: form.name.trim(),
      type: form.type.trim(),
      website: form.website.trim(),
      phone: form.phone.trim(),
      notes: redactField(form.notes),
      createdAt: Date.now(),
    });
    setForm({ name: '', type: '', website: '', phone: '', notes: '' });
    refresh();
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 24 }}>
      <div className="card stack">
        <h3>Add a bank or company</h3>
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chase Bank" />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Kind</label>
            <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Bank, Insurance…" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="1-800-…" />
          </div>
        </div>
        <div className="field">
          <label>Website</label>
          <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="chase.com" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={add}>➕ Add</button>
      </div>

      <ul className="list">
        {rows.map((i) => (
          <li key={i.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{i.name}</strong>
                {i.type && <span className="badge" style={{ marginLeft: 10 }}>{i.type}</span>}
                <div className="tile-sub">
                  {i.phone && <>📞 {i.phone} </>}
                  {i.website && <>🌐 {i.website}</>}
                </div>
                {i.notes && <div style={{ marginTop: 6 }}>{i.notes}</div>}
              </div>
              <button className="btn-ghost" onClick={() => db.institutions.delete(i.id!).then(refresh)}>Remove</button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="tile-sub">Nothing added yet.</p>}
      </ul>
    </div>
  );
}

function Accounts() {
  const { rows, refresh } = useRows(() => db.accounts.toArray());
  const { rows: insts } = useRows(() => db.institutions.orderBy('name').toArray());
  const [form, setForm] = useState<Partial<Account>>({ label: '', last4: '', whereDocsLive: '', passwordManagerRef: '', notes: '' });

  async function add() {
    if (!form.label?.trim()) return;
    await db.accounts.add({
      label: form.label.trim(),
      institutionId: form.institutionId ? Number(form.institutionId) : undefined,
      last4: toLast4(form.last4 ?? ''),
      whereDocsLive: redactField(form.whereDocsLive ?? ''),
      passwordManagerRef: (form.passwordManagerRef ?? '').trim(),
      notes: redactField(form.notes ?? ''),
      createdAt: Date.now(),
    } as Account);
    setForm({ label: '', last4: '', whereDocsLive: '', passwordManagerRef: '', notes: '' });
    refresh();
  }

  const instName = (id?: number) => insts.find((x) => x.id === id)?.name;

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 24 }}>
      <div className="card stack">
        <h3>Add an account</h3>
        <div className="notice warn" style={{ fontSize: 'var(--fs-sm)' }}>
          Never type a full account number or password here. Only the <strong>last 4 digits</strong>
          are kept, and passwords belong in your password manager.
        </div>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>What is it?</label>
            <input value={form.label ?? ''} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Checking account" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Last 4 digits</label>
            <input inputMode="numeric" value={form.last4 ?? ''} onChange={(e) => setForm({ ...form, last4: toLast4(e.target.value) })} placeholder="1234" />
          </div>
        </div>
        <div className="field">
          <label>At which bank/company?</label>
          <select value={form.institutionId ?? ''} onChange={(e) => setForm({ ...form, institutionId: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">— choose —</option>
            {insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Where do the papers live?</label>
          <input value={form.whereDocsLive ?? ''} onChange={(e) => setForm({ ...form, whereDocsLive: e.target.value })} placeholder="Top desk drawer, blue folder" />
        </div>
        <div className="field">
          <label>Password is kept in…</label>
          <input value={form.passwordManagerRef ?? ''} onChange={(e) => setForm({ ...form, passwordManagerRef: e.target.value })} placeholder="Bitwarden (ask family)" />
        </div>
        <button className="btn-primary" onClick={add}>➕ Add</button>
      </div>

      <ul className="list">
        {rows.map((a) => (
          <li key={a.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{a.label}</strong>
                {a.last4 && <span className="badge" style={{ marginLeft: 10 }}>••••{a.last4}</span>}
                {instName(a.institutionId) && <div className="tile-sub">🏦 {instName(a.institutionId)}</div>}
                {a.whereDocsLive && <div>📄 {a.whereDocsLive}</div>}
                {a.passwordManagerRef && <div>🔑 Password in: {a.passwordManagerRef}</div>}
              </div>
              <button className="btn-ghost" onClick={() => db.accounts.delete(a.id!).then(refresh)}>Remove</button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="tile-sub">Nothing added yet.</p>}
      </ul>
    </div>
  );
}

function Contacts() {
  const { rows, refresh } = useRows(() => db.contacts.toArray());
  const [form, setForm] = useState({ name: '', role: '', phone: '', email: '', notes: '' });
  async function add() {
    if (!form.name.trim()) return;
    await db.contacts.add({
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notes: redactField(form.notes),
      createdAt: Date.now(),
    });
    setForm({ name: '', role: '', phone: '', email: '', notes: '' });
    refresh();
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 24 }}>
      <div className="card stack">
        <h3>Add a person to call</h3>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Who are they?</label>
            <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Banker, Doctor, Lawyer" />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <button className="btn-primary" onClick={add}>➕ Add</button>
      </div>
      <ul className="list">
        {rows.map((c) => (
          <li key={c.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{c.name}</strong>
                {c.role && <span className="badge" style={{ marginLeft: 10 }}>{c.role}</span>}
                <div className="tile-sub">{c.phone && <>📞 {c.phone} </>}{c.email && <>✉️ {c.email}</>}</div>
              </div>
              <button className="btn-ghost" onClick={() => db.contacts.delete(c.id!).then(refresh)}>Remove</button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="tile-sub">Nothing added yet.</p>}
      </ul>
    </div>
  );
}

function Locations() {
  const { rows, refresh } = useRows(() => db.locations.toArray());
  const [form, setForm] = useState({ label: '', physicalLocation: '', notes: '' });
  async function add() {
    if (!form.label.trim()) return;
    await db.locations.add({
      label: form.label.trim(),
      physicalLocation: redactField(form.physicalLocation),
      notes: redactField(form.notes),
      createdAt: Date.now(),
    });
    setForm({ label: '', physicalLocation: '', notes: '' });
    refresh();
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 24 }}>
      <div className="card stack">
        <h3>Add a place where papers are kept</h3>
        <div className="field">
          <label>What is it?</label>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Safe deposit box" />
        </div>
        <div className="field">
          <label>Where exactly?</label>
          <input value={form.physicalLocation} onChange={(e) => setForm({ ...form, physicalLocation: e.target.value })} placeholder="Chase Main St, box 3 — key in kitchen drawer" />
        </div>
        <button className="btn-primary" onClick={add}>➕ Add</button>
      </div>
      <ul className="list">
        {rows.map((l) => (
          <li key={l.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{l.label}</strong>
                <div>📍 {l.physicalLocation}</div>
              </div>
              <button className="btn-ghost" onClick={() => db.locations.delete(l.id!).then(refresh)}>Remove</button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="tile-sub">Nothing added yet.</p>}
      </ul>
    </div>
  );
}

function Instructions() {
  const { rows, refresh } = useRows(() => db.instructions.orderBy('priority').reverse().toArray());
  const [form, setForm] = useState({ title: '', body: '' });
  async function add() {
    if (!form.title.trim()) return;
    const max = rows.reduce((m, r) => Math.max(m, r.priority ?? 0), 0);
    await db.instructions.add({
      title: form.title.trim(),
      body: redactField(form.body),
      priority: max + 1,
      createdAt: Date.now(),
    } as Instruction);
    setForm({ title: '', body: '' });
    refresh();
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 24 }}>
      <div className="card stack">
        <h3>Add a reminder</h3>
        <div className="field">
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="If a bill looks wrong" />
        </div>
        <div className="field">
          <label>What to do</label>
          <textarea rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Call your daughter before paying." />
        </div>
        <button className="btn-primary" onClick={add}>➕ Add</button>
      </div>
      <ul className="list">
        {rows.map((i) => (
          <li key={i.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: 'var(--fs-lg)' }}>{i.title}</strong>
                <div style={{ marginTop: 4 }}>{i.body}</div>
              </div>
              <button className="btn-ghost" onClick={() => db.instructions.delete(i.id!).then(refresh)}>Remove</button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="tile-sub">Nothing added yet.</p>}
      </ul>
    </div>
  );
}
