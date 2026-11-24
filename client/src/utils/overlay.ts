import type { CSSProperties } from 'react';

/**
 * Overlay outputs (/out/*, /overlay/*, /broadcast/* graphics) must be
 * transparent by default so OBS/vMix can composite them over video. Solid/
 * checker/video-like backgrounds are preview helpers ONLY via `?bg=` and must
 * never be baked into copied on-air links.
 */
export type OverlayBg = 'transparent' | 'checker' | 'dark' | 'green' | 'video';

export function parseOverlayBg(value?: string | null): OverlayBg {
  const v = (value || '').toLowerCase().trim();
  if (v === 'checker' || v === 'check' || v === 'grid') return 'checker';
  if (v === 'dark' || v === 'black') return 'dark';
  if (v === 'green' || v === 'greenscreen' || v === 'chroma') return 'green';
  if (v === 'video' || v === 'video-like' || v === 'footage') return 'video';
  return 'transparent';
}

export function overlayBgStyle(bg: OverlayBg): CSSProperties {
  switch (bg) {
    case 'checker':
      return {
        backgroundColor: 'var(--app-surface-raised)',
        backgroundImage:
          'linear-gradient(45deg, var(--app-border) 25%, transparent 25%), linear-gradient(-45deg, var(--app-border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--app-border) 75%), linear-gradient(-45deg, transparent 75%, var(--app-border) 75%)',
        backgroundSize: '32px 32px',
        backgroundPosition: '0 0, 0 16px, 16px -16px, -16px 0px',
      };
    case 'dark':
      return { backgroundColor: 'var(--app-background)' };
    case 'green':
      return { backgroundColor: 'rgb(0 177 64)' }; // chroma key preview (no hex literal)
    case 'video':
      return {
        backgroundColor: 'var(--app-surface-sunken)',
        backgroundImage:
          'radial-gradient(circle at 20% 25%, color-mix(in srgb, var(--app-muted) 55%, transparent), transparent 35%, color-mix(in srgb, var(--app-background) 85%, transparent) 70%), linear-gradient(120deg, color-mix(in srgb, var(--app-surface) 90%, transparent), color-mix(in srgb, var(--app-background) 95%, transparent))',
      };
    default:
      return { backgroundColor: 'transparent' };
  }
}

/** Append a preview background param to an overlay URL (for "Open/preview" only). */
export function withOverlayBg(url: string, bg: OverlayBg = 'checker'): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (bg === 'transparent') u.searchParams.delete('bg');
    else u.searchParams.set('bg', bg);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    if (bg === 'transparent') return url.replace(/([?&])bg=[^&]*(&?)/, (_, a, b) => (b ? a : '')).replace(/[?&]$/, '');
    return `${url}${sep}bg=${encodeURIComponent(bg)}`;
  }
}
