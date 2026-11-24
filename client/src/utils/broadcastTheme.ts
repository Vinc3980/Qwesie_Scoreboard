export type TeamBrandInput = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  textColor?: string | null;
  shortName?: string | null;
  name?: string | null;
};

function hexToRgb(hex?: string | null) {
  if (!hex) return null;
  const h = hex.replace('#', '').trim();
  if (![3,4,6,8].includes(h.length)) return null;
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0,6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function relLum(rgb: {r:number;g:number;b:number}) {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}
export function contrastRatio(a?: string | null, b?: string | null) {
  const A = hexToRgb(a); const B = hexToRgb(b);
  if (!A || !B) return 1;
  const L1 = relLum(A), L2 = relLum(B);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function colorDistance(a?: string | null, b?: string | null) {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return 999;
  return Math.sqrt((A.r-B.r)**2 + (A.g-B.g)**2 + (A.b-B.b)**2);
}
export function pickReadableText(bg?: string | null, preferred?: string | null) {
  if (preferred && contrastRatio(bg, preferred) >= 4.5) return preferred;
  const white = '#ffffff', dark = '#081018';
  return contrastRatio(bg, white) >= contrastRatio(bg, dark) ? white : dark;
}
export function resolveTeamColors(a: TeamBrandInput, b: TeamBrandInput) {
  let aMain = a.primaryColor || '#38bdf8';
  let bMain = b.primaryColor || '#c084fc';
  const aAlt = a.secondaryColor || aMain;
  const bAlt = b.secondaryColor || bMain;
  // if too similar, swap to secondary for contrast between teams
  if (colorDistance(aMain, bMain) < 80 || contrastRatio(aMain, bMain) < 1.6) {
    if (colorDistance(aAlt, bMain) >= colorDistance(aMain, bAlt)) aMain = aAlt; else bMain = bAlt;
  }
  return {
    a: { main: aMain, alt: aAlt, text: pickReadableText(aMain, a.textColor) },
    b: { main: bMain, alt: bAlt, text: pickReadableText(bMain, b.textColor) },
  };
}
export function applyTeamCssVars(el: HTMLElement | null, match: any) {
  if (!el) return;
  const ta = match?.teams?.A || {};
  const tb = match?.teams?.B || {};
  const { a, b } = resolveTeamColors(ta, tb);
  el.style.setProperty('--team-a', a.main);
  el.style.setProperty('--team-a-2', ta.secondaryColor || a.alt);
  el.style.setProperty('--team-a-text', a.text);
  el.style.setProperty('--team-b', b.main);
  el.style.setProperty('--team-b-2', tb.secondaryColor || b.alt);
  el.style.setProperty('--team-b-text', b.text);
}
