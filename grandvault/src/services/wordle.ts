/**
 * Daily "only-you" code — the Wordle answer from N days ago (default N = 7).
 *
 * Fully offline: the code for any date is computed from a bundled ordered word
 * list (public/data/wordle-answers.json), never fetched. The grandparent never
 * sees the code; the grandchild recalls it either from a public Wordle archive
 * (if the bundled list is aligned to the official one — see the JSON note) or
 * from the master-PIN-protected reveal screen inside GrandVault.
 *
 * The code gates only "send / export / back up" actions. Viewing is never gated.
 */

// Epoch that index 0 in the word list corresponds to. Kept in UTC to avoid
// timezone drift changing "today's" word around midnight.
const EPOCH_UTC = Date.UTC(2021, 5, 19); // 2021-06-19 (Wordle day 0)
const DAY_MS = 86_400_000;

let WORDS: string[] = [];

/** Load the bundled word list once. Safe to call repeatedly. */
export async function loadWords(): Promise<string[]> {
  if (WORDS.length) return WORDS;
  const res = await fetch(new URL('./data/wordle-answers.json', document.baseURI));
  const json = (await res.json()) as { words: string[] };
  WORDS = json.words.map((w) => w.toLowerCase());
  return WORDS;
}

/** Whole-day index for a given date, in UTC. */
export function dayIndex(date: Date): number {
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((utcMidnight - EPOCH_UTC) / DAY_MS);
}

/** The word for a specific calendar date. */
export function wordForDate(date: Date): string {
  if (!WORDS.length) throw new Error('word list not loaded — call loadWords() first');
  const idx = ((dayIndex(date) % WORDS.length) + WORDS.length) % WORDS.length;
  return WORDS[idx];
}

/** The code required today = the word from `offsetDays` ago (default 7). */
export function codeForToday(offsetDays = 7, now = new Date()): string {
  const past = new Date(now.getTime() - offsetDays * DAY_MS);
  return wordForDate(past);
}

/** Case-insensitive, whitespace-tolerant comparison. */
export function checkCode(entered: string, offsetDays = 7, now = new Date()): boolean {
  return entered.trim().toLowerCase() === codeForToday(offsetDays, now);
}

/**
 * For the grandchild's reveal screen: the code for each of the last `days` days,
 * so they can see today's and glance back if a clock/timezone is off.
 */
export function recentCodes(offsetDays = 7, days = 5, now = new Date()): { date: string; code: string }[] {
  const out: { date: string; code: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const past = new Date(d.getTime() - offsetDays * DAY_MS);
    out.push({ date: d.toISOString().slice(0, 10), code: wordForDate(past) });
  }
  return out;
}
