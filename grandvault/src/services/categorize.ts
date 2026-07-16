/**
 * Offline auto-categorization: high-precision rules first, then embedding-to-
 * prototype similarity as a fallback, always overridable by the user.
 */

import { CATEGORIES, type Category, db } from '../db/dexie';
import { cosine, vectorFromBytes, bytesFromVector } from './embeddings';

/** Keyword/regex lexicon per category. Order matters only for readability;
 *  scoring counts matches across all categories. */
const RULES: Record<Exclude<Category, 'Uncategorized'>, RegExp[]> = {
  Banking: [/\bcheck(ing)?\b/i, /\bsavings\b/i, /\brouting\b/i, /\bstatement\b/i, /\bdeposit\b/i, /\boverdraft\b/i, /\bwire transfer\b/i],
  Insurance: [/\bpremium\b/i, /\bdeductible\b/i, /\bpolicy (no|number|#)\b/i, /\bcoverage\b/i, /\bclaim\b/i, /\binsured\b/i, /\bEOB\b/],
  Medical: [/\bpatient\b/i, /\bdiagnos/i, /\bprescription\b/i, /\bcopay\b/i, /\bMedicare\b/i, /\bMedicaid\b/i, /\bexplanation of benefits\b/i, /\bpharmacy\b/i],
  Taxes: [/\b1099\b/, /\bW-?2\b/i, /\bIRS\b/, /\bForm 1040\b/i, /\btax(able)? (year|return)\b/i, /\bwithholding\b/i, /\brefund\b/i],
  Utilities: [/\bkWh\b/i, /\bmeter (reading|no)\b/i, /\bgas\b/i, /\belectric(ity)?\b/i, /\bwater bill\b/i, /\bservice address\b/i, /\butility\b/i],
  'Legal/Estate': [/\bwill\b/i, /\btrust\b/i, /\bpower of attorney\b/i, /\bexecutor\b/i, /\bestate\b/i, /\bnotar/i, /\bbeneficiar/i, /\bcodicil\b/i],
  Investments: [/\bbrokerage\b/i, /\bmutual fund\b/i, /\bdividend\b/i, /\bportfolio\b/i, /\b401\(?k\)?\b/i, /\bIRA\b/, /\bshares?\b/i, /\bcapital gain/i],
  Property: [/\bmortgage\b/i, /\bescrow\b/i, /\bdeed\b/i, /\bparcel\b/i, /\bproperty tax\b/i, /\bHOA\b/, /\bappraisal\b/i, /\btitle\b/i],
  'Government/ID': [/\bpassport\b/i, /\bdriver'?s license\b/i, /\bsocial security\b/i, /\bbirth certificate\b/i, /\bvoter\b/i, /\bDMV\b/],
  Subscriptions: [/\bsubscription\b/i, /\bmonthly plan\b/i, /\brenewal\b/i, /\bauto-?renew\b/i, /\bmembership\b/i],
};

export interface CategoryGuess {
  category: Category;
  source: 'rule' | 'embedding';
  confidence: number; // 0..1
}

/** Stage 1: rule scoring. Returns the best category if clearly ahead. */
export function categorizeByRules(text: string): CategoryGuess | null {
  const scores = new Map<Category, number>();
  for (const [cat, regexes] of Object.entries(RULES) as [Category, RegExp[]][]) {
    let hits = 0;
    for (const re of regexes) if (re.test(text)) hits++;
    if (hits) scores.set(cat, hits);
  }
  if (!scores.size) return null;

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topCat, topHits] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  // Confident when the leader is clearly ahead.
  if (topHits >= 2 && topHits > runnerUp) {
    return { category: topCat, source: 'rule', confidence: Math.min(1, 0.6 + 0.1 * topHits) };
  }
  if (topHits === 1 && runnerUp === 0) {
    return { category: topCat, source: 'rule', confidence: 0.55 };
  }
  return null;
}

const EMBED_THRESHOLD = 0.28; // below this, leave as Uncategorized

/** Stage 2: nearest category prototype by cosine. */
export async function categorizeByEmbedding(embedding: Float32Array): Promise<CategoryGuess> {
  const protos = await db.prototypes.toArray();
  if (!protos.length) return { category: 'Uncategorized', source: 'embedding', confidence: 0 };

  let best: { cat: Category; score: number } = { cat: 'Uncategorized', score: -1 };
  for (const p of protos) {
    const score = cosine(embedding, vectorFromBytes(p.embedding));
    if (score > best.score) best = { cat: p.category, score };
  }
  if (best.score < EMBED_THRESHOLD) {
    return { category: 'Uncategorized', source: 'embedding', confidence: best.score };
  }
  return { category: best.cat, source: 'embedding', confidence: best.score };
}

/** Full pipeline: rules first, embedding fallback. */
export async function categorize(text: string, embedding?: Float32Array): Promise<CategoryGuess> {
  const byRule = categorizeByRules(text);
  if (byRule) return byRule;
  if (embedding) return categorizeByEmbedding(embedding);
  return { category: 'Uncategorized', source: 'rule', confidence: 0 };
}

/**
 * User override feedback: fold this doc's embedding into the target category's
 * prototype (running mean, re-normalized). Cheap, local personalization.
 */
export async function reinforcePrototype(category: Category, embedding: Float32Array): Promise<void> {
  if (category === 'Uncategorized') return;
  const existing = await db.prototypes.get(category);
  if (!existing) {
    await db.prototypes.put({ category, embedding: bytesFromVector(embedding), exemplarCount: 1 });
    return;
  }
  const prev = vectorFromBytes(existing.embedding);
  const n = existing.exemplarCount;
  const merged = new Float32Array(prev.length);
  let norm = 0;
  for (let i = 0; i < prev.length; i++) {
    merged[i] = (prev[i] * n + embedding[i]) / (n + 1);
    norm += merged[i] * merged[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < merged.length; i++) merged[i] /= norm;
  await db.prototypes.put({
    category,
    embedding: bytesFromVector(merged),
    exemplarCount: n + 1,
  });
}

/**
 * Seed category prototypes from short descriptions. Called once at first run
 * (the embeddings are produced by the worker and passed in here).
 */
export const CATEGORY_SEED_TEXT: Record<Exclude<Category, 'Uncategorized'>, string> = {
  Banking: 'bank checking savings account statement deposits withdrawals routing number balance',
  Insurance: 'insurance policy premium deductible coverage claim insured beneficiary explanation of benefits',
  Medical: 'medical doctor hospital patient prescription diagnosis medicare pharmacy health copay',
  Taxes: 'income tax return IRS form 1040 W-2 1099 withholding refund taxable year',
  Utilities: 'electricity gas water utility bill meter reading kilowatt service address monthly usage',
  'Legal/Estate': 'will trust estate power of attorney executor beneficiary legal notarized codicil',
  Investments: 'brokerage investment mutual fund stocks shares dividends portfolio retirement IRA 401k capital gains',
  Property: 'mortgage home property deed escrow parcel property tax HOA appraisal title real estate',
  'Government/ID': 'passport driver license social security card birth certificate government identification voter',
  Subscriptions: 'subscription membership monthly plan renewal auto-renew recurring service',
};

export function seedCategories(): Exclude<Category, 'Uncategorized'>[] {
  return CATEGORIES.filter((c) => c !== 'Uncategorized') as Exclude<Category, 'Uncategorized'>[];
}
