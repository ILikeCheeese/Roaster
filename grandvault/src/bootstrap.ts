/**
 * One-time app initialization: seed category prototypes (offline, via the worker)
 * and warm up the AI. Safe to call on every launch — it no-ops once seeded.
 */

import { db, getSetting, setSetting } from './db/dexie';
import { initAi, warmupAi, embedText } from './services/aiClient';
import { CATEGORY_SEED_TEXT, seedCategories } from './services/categorize';
import { bytesFromVector } from './services/embeddings';
import { loadWords } from './services/wordle';

let started = false;

export type AiStatus = 'idle' | 'loading' | 'ready' | 'error';
let status: AiStatus = 'idle';
const listeners = new Set<(s: AiStatus) => void>();

export function onAiStatus(fn: (s: AiStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}
function setStatus(s: AiStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export function aiStatus(): AiStatus {
  return status;
}

async function seedPrototypes(): Promise<void> {
  const done = await getSetting<boolean>('prototypes.seeded', false);
  if (done) return;
  for (const cat of seedCategories()) {
    const vec = await embedText(CATEGORY_SEED_TEXT[cat]);
    await db.prototypes.put({ category: cat, embedding: bytesFromVector(vec), exemplarCount: 1 });
  }
  await setSetting('prototypes.seeded', true);
}

export async function bootstrap(): Promise<void> {
  if (started) return;
  started = true;
  try {
    await loadWords(); // daily-code word list (cheap, offline)
    setStatus('loading');
    await initAi();
    await warmupAi(); // self-check: fails loudly here if models are missing
    await seedPrototypes();
    setStatus('ready');
  } catch (err) {
    console.error('AI init failed', err);
    setStatus('error');
  }
}
