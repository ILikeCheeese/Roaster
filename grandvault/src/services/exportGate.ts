/**
 * The scam circuit-breaker. Every action that gets a file OUT of GrandVault —
 * send, export, download, or back up — must pass through requireExportCode(),
 * which demands today's daily code (the Wordle answer from N days ago). Viewing
 * is never gated.
 *
 * The idea: the grandparent must phone the grandchild to get the code, giving
 * the grandchild a chance to confirm the request is genuine and not a scammer
 * on the line.
 */

import { getSetting, setSetting } from '../db/dexie';
import { checkCode, codeForToday } from './wordle';

const OFFSET_KEY = 'exportCode.offsetDays';
const UNLOCK_KEY = 'exportCode.unlockedForDay'; // day-index string, to allow once-per-day unlock

export async function getOffsetDays(): Promise<number> {
  return getSetting<number>(OFFSET_KEY, 7);
}

export async function setOffsetDays(days: number): Promise<void> {
  await setSetting(OFFSET_KEY, days);
}

/** Verify an entered code against today's expected value. */
export async function verifyCode(entered: string): Promise<boolean> {
  const offset = await getOffsetDays();
  return checkCode(entered, offset);
}

/** The code the grandchild should expect today (for the reveal screen). */
export async function expectedCodeToday(): Promise<string> {
  const offset = await getOffsetDays();
  return codeForToday(offset);
}

/**
 * Once the correct code is entered, exports stay unlocked for the rest of that
 * calendar day so a batch of legitimate actions doesn't re-prompt endlessly.
 */
export async function markUnlockedToday(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await setSetting(UNLOCK_KEY, today);
}

export async function isUnlockedToday(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const stored = await getSetting<string>(UNLOCK_KEY, '');
  return stored === today;
}

export type ExportAction = 'download' | 'share' | 'backup';

export interface GateResult {
  allowed: boolean;
  reason?: 'need-code';
}

/**
 * Gatekeeper used by the UI. If already unlocked today, allow. Otherwise the UI
 * must show the code prompt and call verifyCode()/markUnlockedToday().
 */
export async function checkExportAllowed(): Promise<GateResult> {
  if (await isUnlockedToday()) return { allowed: true };
  return { allowed: false, reason: 'need-code' };
}
