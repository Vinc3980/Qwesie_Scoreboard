export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Prefer async Clipboard API in secure contexts where it's reliably available.
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy fallback (common on HTTP/LAN or restricted permissions).
  }

  // Legacy fallback for non-secure contexts (e.g. LAN over HTTP), older browsers,
  // or when Clipboard API is blocked/unavailable.
  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const active = document.activeElement as HTMLElement | null;
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const ok = document.execCommand('copy');

    document.body.removeChild(textarea);
    if (selectedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
    if (active && typeof active.focus === 'function') {
      try { active.focus(); } catch {}
    }

    return ok;
  } catch {
    return false;
  }
}
