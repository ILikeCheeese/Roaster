import Dexie, { type EntityTable } from 'dexie';

/**
 * GrandVault local database (IndexedDB via Dexie).
 *
 * Everything lives on-device. There is NO password field anywhere by design —
 * the app stores pointers to where real credentials live, never the credentials
 * themselves. Account numbers are stored as last-4 only; the redaction layer
 * (services/redact.ts) enforces this before anything is written.
 */

export type Category =
  | 'Banking'
  | 'Insurance'
  | 'Medical'
  | 'Taxes'
  | 'Utilities'
  | 'Legal/Estate'
  | 'Investments'
  | 'Property'
  | 'Government/ID'
  | 'Subscriptions'
  | 'Uncategorized';

export const CATEGORIES: Category[] = [
  'Banking',
  'Insurance',
  'Medical',
  'Taxes',
  'Utilities',
  'Legal/Estate',
  'Investments',
  'Property',
  'Government/ID',
  'Subscriptions',
  'Uncategorized',
];

export interface Institution {
  id?: number;
  name: string;
  type: Category | string;
  website?: string;
  phone?: string;
  notes?: string;
  createdAt: number;
}

export interface Account {
  id?: number;
  institutionId?: number;
  label: string; // e.g. "Checking", "Medicare Part B"
  kind?: string;
  last4?: string; // ONLY the last 4 digits — enforced <= 4 chars
  whereDocsLive?: string; // "top drawer, blue folder"
  passwordManagerRef?: string; // WHICH manager / where the master hint is — never a password
  notes?: string;
  createdAt: number;
}

export interface Contact {
  id?: number;
  institutionId?: number;
  name: string;
  role?: string; // "Banker", "Attorney", "Doctor"
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: number;
}

export interface DocLocation {
  id?: number;
  label: string; // "Safe deposit box"
  physicalLocation: string; // "Chase, Main St branch, box 3"
  notes?: string;
  createdAt: number;
}

export interface Instruction {
  id?: number;
  title: string; // "If a bill looks wrong"
  body: string;
  priority?: number; // higher = shown first
  createdAt: number;
}

export type CategorySource = 'rule' | 'embedding' | 'user';

export interface DocumentRecord {
  id?: number;
  title: string;
  institutionId?: number;
  category: Category;
  categorySource: CategorySource;
  categoryConfidence?: number;
  ocrText: string; // already redacted
  pageCount: number;
  docDate?: string; // ISO date if detected
  tags: string[];
  /** 384-dim MiniLM embedding, unit-normalized, stored as Float32 bytes. */
  embedding?: ArrayBuffer;
  /** Original file bytes (image or pdf), rendered to <canvas> on view. */
  fileBlob: Blob;
  mime: string;
  origFilename?: string;
  importedAt: number;
}

/** One prototype embedding per category, refined by user overrides. */
export interface CategoryPrototype {
  category: Category;
  embedding: ArrayBuffer; // unit-normalized mean of exemplars
  exemplarCount: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

const db = new Dexie('grandvault') as Dexie & {
  institutions: EntityTable<Institution, 'id'>;
  accounts: EntityTable<Account, 'id'>;
  contacts: EntityTable<Contact, 'id'>;
  locations: EntityTable<DocLocation, 'id'>;
  instructions: EntityTable<Instruction, 'id'>;
  documents: EntityTable<DocumentRecord, 'id'>;
  prototypes: EntityTable<CategoryPrototype, 'category'>;
  settings: EntityTable<Setting, 'key'>;
};

db.version(1).stores({
  institutions: '++id, name, type',
  accounts: '++id, institutionId, label',
  contacts: '++id, institutionId, name',
  locations: '++id, label',
  instructions: '++id, priority',
  documents: '++id, category, importedAt, *tags, institutionId',
  prototypes: 'category',
  settings: 'key',
});

export { db };

/** Read a setting with a typed default. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
