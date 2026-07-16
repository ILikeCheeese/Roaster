/**
 * Import orchestrator: file → (worker) preprocess+OCR+embed → redact → categorize
 * → store in IndexedDB → refresh search index.
 *
 * Redaction happens on the MAIN thread here, after OCR, and BEFORE anything is
 * written — so full SSNs / account numbers never reach the database or a backup.
 */

import { db, type Category, type DocumentRecord } from '../db/dexie';
import { processFile } from './aiClient';
import { redact } from './redact';
import { categorize, reinforcePrototype } from './categorize';
import { vectorFromBytes } from './embeddings';
import { rebuildIndex } from './search';

export interface ImportInput {
  file: Blob;
  mime: string;
  origFilename?: string;
  title?: string;
  institutionId?: number;
}

export interface ImportResult {
  id: number;
  title: string;
  category: Category;
  categorySource: DocumentRecord['categorySource'];
  ssnRedactions: number;
  accountRedactions: number;
}

function guessTitle(filename?: string, text?: string): string {
  if (filename) return filename.replace(/\.[^.]+$/, '');
  const firstLine = (text ?? '').split('\n').map((s) => s.trim()).find((s) => s.length > 3);
  return firstLine?.slice(0, 60) || 'Untitled document';
}

export async function importDocument(input: ImportInput): Promise<ImportResult> {
  const { ocrText, pageCount, embedding } = await processFile(input.file, input.mime);

  // Redact BEFORE persisting.
  const { text: safeText, ssnCount, accountCount } = redact(ocrText);

  const vec = vectorFromBytes(embedding);
  const guess = await categorize(safeText, vec);

  const title = input.title?.trim() || guessTitle(input.origFilename, safeText);

  const record: DocumentRecord = {
    title,
    institutionId: input.institutionId,
    category: guess.category,
    categorySource: guess.source,
    categoryConfidence: guess.confidence,
    ocrText: safeText,
    pageCount,
    tags: [],
    embedding,
    fileBlob: input.file instanceof Blob ? input.file : new Blob([input.file], { type: input.mime }),
    mime: input.mime,
    origFilename: input.origFilename,
    importedAt: Date.now(),
  };

  const id = (await db.documents.add(record)) as number;
  await rebuildIndex();

  return {
    id,
    title,
    category: guess.category,
    categorySource: guess.source,
    ssnRedactions: ssnCount,
    accountRedactions: accountCount,
  };
}

/** Change a document's category and teach the classifier from the correction. */
export async function setCategory(docId: number, category: Category): Promise<void> {
  const doc = await db.documents.get(docId);
  if (!doc) return;
  await db.documents.update(docId, { category, categorySource: 'user' });
  if (doc.embedding) await reinforcePrototype(category, vectorFromBytes(doc.embedding));
  await rebuildIndex();
}
