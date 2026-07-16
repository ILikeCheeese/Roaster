/**
 * Hybrid offline search: keyword (MiniSearch / BM25) + semantic (MiniLM cosine),
 * fused with Reciprocal Rank Fusion. Small corpus → everything lives in memory.
 */

import MiniSearch from 'minisearch';
import { db, type DocumentRecord } from '../db/dexie';
import { cosine, vectorFromBytes } from './embeddings';

interface IndexedDoc {
  id: number;
  title: string;
  ocrText: string;
  tags: string;
  category: string;
}

let mini: MiniSearch<IndexedDoc> | null = null;
// Parallel arrays for the semantic leg.
let ids: number[] = [];
let vectors: Float32Array[] = [];

/** (Re)build both indexes from IndexedDB. Call after imports/edits. */
export async function rebuildIndex(): Promise<void> {
  const docs = await db.documents.toArray();

  mini = new MiniSearch<IndexedDoc>({
    fields: ['title', 'ocrText', 'tags', 'category'],
    storeFields: ['title'],
    searchOptions: { boost: { title: 3, tags: 2 }, prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(
    docs.map((d) => ({
      id: d.id!,
      title: d.title,
      ocrText: d.ocrText,
      tags: d.tags.join(' '),
      category: d.category,
    })),
  );

  ids = [];
  vectors = [];
  for (const d of docs) {
    if (d.embedding) {
      ids.push(d.id!);
      vectors.push(vectorFromBytes(d.embedding));
    }
  }
}

export interface SearchHit {
  id: number;
  score: number;
  title: string;
  snippet: string;
  category: string;
}

const RRF_K = 60;

/**
 * Run the hybrid search. `queryEmbedding` is produced by the worker (offline).
 * If it's absent (e.g. models still loading) we degrade gracefully to keyword-only.
 */
export async function search(
  query: string,
  queryEmbedding: Float32Array | null,
  limit = 30,
): Promise<SearchHit[]> {
  if (!mini) await rebuildIndex();

  // Keyword ranks.
  const kw = mini!.search(query).map((r) => r.id as number);
  const kwRank = new Map<number, number>();
  kw.forEach((id, i) => kwRank.set(id, i));

  // Semantic ranks.
  const semRank = new Map<number, number>();
  if (queryEmbedding && vectors.length) {
    const scored = ids
      .map((id, i) => ({ id, s: cosine(queryEmbedding, vectors[i]) }))
      .sort((a, b) => b.s - a.s);
    scored.forEach((x, i) => semRank.set(x.id, i));
  }

  // Reciprocal Rank Fusion.
  const fused = new Map<number, number>();
  const bump = (id: number, rank: number) =>
    fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + rank));
  kwRank.forEach((rank, id) => bump(id, rank));
  semRank.forEach((rank, id) => bump(id, rank));

  const rankedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

  const docs = await db.documents.bulkGet(rankedIds.map(([id]) => id));
  const hits: SearchHit[] = [];
  rankedIds.forEach(([id, score], i) => {
    const d = docs[i] as DocumentRecord | undefined;
    if (!d) return;
    hits.push({
      id,
      score,
      title: d.title,
      category: d.category,
      snippet: makeSnippet(d.ocrText, query),
    });
  });
  return hits;
}

/** A short context snippet around the first query-term match. */
function makeSnippet(text: string, query: string): string {
  if (!text) return '';
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, 160).trim() + (text.length > 160 ? '…' : '');
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + 100);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}
