/**
 * Client-side anti-copy friction. This makes casual exfiltration hard; it is NOT
 * a cryptographic guarantee (a determined person can photograph a screen, and a
 * browser cannot block screenshots — see SETUP.md). The real anti-scam control
 * is that every "send / export / save a copy" action is code-gated.
 */

/** Disable text selection, context menu, drag, and copy shortcuts app-wide. */
export function installCopyGuards(): void {
  const block = (e: Event) => e.preventDefault();

  // Right-click / long-press context menu (would offer "Save image", "Copy").
  document.addEventListener('contextmenu', block);

  // Dragging images/canvas out of the app.
  document.addEventListener('dragstart', block);

  // Copy / cut / select-all keyboard shortcuts, except inside real inputs.
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const inField =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    const key = e.key.toLowerCase();
    const meta = e.ctrlKey || e.metaKey;
    if (meta && ['c', 'x', 'a', 's', 'p'].includes(key) && !inField) {
      e.preventDefault();
    }
  });

  // Clipboard copy of document content anywhere outside inputs.
  document.addEventListener('copy', (e) => {
    const sel = document.getSelection()?.toString() ?? '';
    const target = e.target as HTMLElement | null;
    const inField =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    if (!inField && sel) e.preventDefault();
  });
}

/** SHA-256 hex of a string (used for the master PIN — no secrets are stored). */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
