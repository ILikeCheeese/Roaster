/**
 * Redaction layer — the guarantee that GrandVault never persists secrets.
 *
 * Runs on every OCR text blob AND every free-text field the user types, BEFORE
 * anything is written to IndexedDB or into a backup file. It removes:
 *   - full Social Security numbers            -> ***-**-1234
 *   - long card / bank account digit runs     -> keep last 4 only (••••1234)
 *
 * This satisfies both the product promise ("pointers, not secrets") and the
 * hard organizational rule that full SSNs and full bank/account numbers must
 * never be stored.
 */

export interface RedactionResult {
  text: string;
  ssnCount: number;
  accountCount: number;
}

// SSN: 3-2-4 digits with optional separators, word-bounded.
const SSN_RE = /\b(\d{3})[-\s]?(\d{2})[-\s]?(\d{4})\b/g;

// Runs of 12–19 digits (optionally grouped by spaces/dashes) — cards & accounts.
const LONG_NUMBER_RE = /\b(?:\d[ -]?){12,19}\b/g;

/** Luhn check — true for valid credit-card-style numbers (reduces false hits). */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function redact(input: string): RedactionResult {
  let ssnCount = 0;
  let accountCount = 0;

  let text = input.replace(SSN_RE, (_m, _a, _b, last4) => {
    ssnCount++;
    return `***-**-${last4}`;
  });

  text = text.replace(LONG_NUMBER_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    // 12–19 digit runs: treat as a card if Luhn-valid, otherwise as a bank/account
    // number. Either way we only ever keep the last 4.
    if (digits.length < 12 || digits.length > 19) return match;
    // Skip if it looks like it was already an SSN we handled (9 digits handled above).
    if (luhnValid(digits) || digits.length >= 12) {
      accountCount++;
      return `••••${digits.slice(-4)}`;
    }
    return match;
  });

  return { text, ssnCount, accountCount };
}

/** Convenience for single fields; returns just the cleaned string. */
export function redactField(value: string): string {
  return redact(value).text;
}

/** Keep only the last 4 digits of whatever the user typed into an account field. */
export function toLast4(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.slice(-4);
}
