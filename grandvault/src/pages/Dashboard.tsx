import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type Instruction } from '../db/dexie';

export default function Dashboard() {
  const [counts, setCounts] = useState({ docs: 0, institutions: 0, contacts: 0 });
  const [instructions, setInstructions] = useState<Instruction[]>([]);

  useEffect(() => {
    (async () => {
      setCounts({
        docs: await db.documents.count(),
        institutions: await db.institutions.count(),
        contacts: await db.contacts.count(),
      });
      const ins = await db.instructions.orderBy('priority').reverse().limit(4).toArray();
      setInstructions(ins);
    })();
  }, []);

  return (
    <div className="stack">
      <h1>Welcome back</h1>
      <p className="tile-sub">
        Everything about your money and important papers, in one safe place on this
        device. Nothing here goes to the internet.
      </p>

      <div className="tiles">
        <Link to="/directory" className="tile">
          <span className="tile-icon" aria-hidden>📇</span>
          <span className="tile-title">Accounts &amp; Contacts</span>
          <span className="tile-sub">
            {counts.institutions} places, {counts.contacts} people to call
          </span>
        </Link>
        <Link to="/documents" className="tile">
          <span className="tile-icon" aria-hidden>🗂️</span>
          <span className="tile-title">My Documents</span>
          <span className="tile-sub">{counts.docs} papers saved</span>
        </Link>
        <Link to="/scan" className="tile">
          <span className="tile-icon" aria-hidden>📸</span>
          <span className="tile-title">Scan a Paper</span>
          <span className="tile-sub">Add a new document with your camera</span>
        </Link>
        <Link to="/search" className="tile">
          <span className="tile-icon" aria-hidden>🔎</span>
          <span className="tile-title">Search</span>
          <span className="tile-sub">Find anything by what it means</span>
        </Link>
      </div>

      {instructions.length > 0 && (
        <section className="card stack">
          <h2>📌 Important reminders</h2>
          {instructions.map((i) => (
            <div key={i.id} className="notice info">
              <strong>{i.title}</strong>
              <div style={{ marginTop: 6 }}>{i.body}</div>
            </div>
          ))}
        </section>
      )}

      <section className="notice warn">
        <strong>Staying safe:</strong> No one from a bank, the government, or "tech
        support" should ever ask you to send these papers. If someone does, hang up and
        call your family. GrandVault will ask for a family code before anything can be
        sent.
      </section>
    </div>
  );
}
