import React, { useState } from 'react';

type Mode = 'light' | 'dark';

const Swatch: React.FC<{ name: string; value: string; text?: string; note?: string }> = ({ name, value, text = '#fff', note }) => (
  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(127,127,127,0.25)' }}>
    <div style={{ height: 56, background: value }} />
    <div style={{ padding: '8px 10px', background: 'rgba(127,127,127,0.08)' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
      <div style={{ fontSize: 12, opacity: 0.8, fontFamily: 'ui-monospace, monospace' }}>{value}{note ? ` · ${note}` : ''}</div>
    </div>
  </div>
);

const MarkA = ({ color = '#F59E0B' }: { color?: string }) => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-label="Qwesie mark A">
    <rect x="4" y="4" width="36" height="36" rx="10" fill="#141414" stroke={color} strokeWidth="2.5" />
    <path d="M12 30V14h8.5c4.7 0 7.5 2.6 7.5 6.7 0 2.8-1.3 4.8-3.6 5.8L29 30h-4.6l-3.9-3h-4.3v3H12Zm4.2-6.4h4.1c2.2 0 3.5-1.1 3.5-3s-1.3-3-3.5-3h-4.1v6Z" fill="#F5F5F4" />
    <circle cx="31.5" cy="31.5" r="4.5" fill={color} />
  </svg>
);

const MarkB = ({ color = '#0F766E' }: { color?: string }) => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-label="Qwesie mark B">
    <circle cx="22" cy="22" r="17" fill="#0B1320" stroke={color} strokeWidth="2.5" />
    <path d="M14 22c0-4.7 3.6-8.2 8.5-8.2 2.3 0 4.2.7 5.6 2l-2.4 2.6c-.8-.8-1.8-1.2-3.1-1.2-2.6 0-4.5 2-4.5 4.8s1.9 4.8 4.5 4.8c1.3 0 2.4-.4 3.2-1.3l2.4 2.5c-1.4 1.4-3.4 2.2-5.8 2.2-4.8 0-8.4-3.5-8.4-8.2Z" fill="#F8FAFC" />
    <path d="M26.5 14.5h3.2v15h-3.2v-15Z" fill={color} />
    <path d="M26.5 26.8l6.5 4.7h-4l-2.5-1.8v-2.9Z" fill={color} />
  </svg>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ border: '1px solid rgba(127,127,127,0.25)', borderRadius: 16, padding: 16, background: 'rgba(127,127,127,0.04)' }}>
    <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 10, fontWeight: 700 }}>{title}</div>
    {children}
  </div>
);

const VariantCard: React.FC<{
  id: 'A' | 'B';
  name: string;
  tagline: string;
  mark: React.ReactNode;
  palettes: { light: Record<string,string>; dark: Record<string,string> };
  type: { display: string; ui: string; notes: string };
  rules: string[];
  icon: string[];
}> = ({ id, name, tagline, mark, palettes, type, rules, icon }) => {
  const [mode, setMode] = useState<Mode>('dark');
  const p = palettes[mode];
  return (
    <section style={{ border: '1px solid rgba(127,127,127,0.3)', borderRadius: 20, overflow: 'hidden', background: mode === 'dark' ? '#0b0d10' : '#f6f7f9', color: mode === 'dark' ? '#f3f4f6' : '#111827' }}>
      <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', borderBottom: '1px solid rgba(127,127,127,0.25)', background: mode === 'dark' ? 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent)' : 'linear-gradient(180deg, rgba(0,0,0,0.03), transparent)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {mark}
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.7, fontWeight: 700 }}>Variant {id}</div>
            <h2 style={{ margin: '2px 0 0', fontSize: 34, lineHeight: 1, fontFamily: '"Barlow Condensed", Inter, sans-serif', letterSpacing: '0.02em' }}>{name}</h2>
            <div style={{ marginTop: 4, opacity: 0.85 }}>{tagline}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['light','dark'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(127,127,127,0.35)', background: mode===m ? p.accent : 'transparent', color: mode===m ? p.onAccent : 'inherit', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <Panel title="Color system">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            {Object.entries(p).filter(([k]) => !['onAccent','onPrimary'].includes(k)).slice(0,8).map(([k,v]) => <Swatch key={k} name={k} value={v} />)}
          </div>
        </Panel>
        <Panel title="Type pairing (offline)">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif', fontSize: 44, fontWeight: 800, lineHeight: 0.95 }}>Display / Score 25–23</div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, fontWeight: 700 }}>UI Heading & Controls</div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, opacity: 0.85 }}>{type.notes}</div>
            <div style={{ fontSize: 13, padding: 10, borderRadius: 10, background: p.surfaceAlt, border: `1px solid ${p.border}` }}><b>Display:</b> {type.display}<br/><b>UI:</b> {type.ui}</div>
          </div>
        </Panel>
        <Panel title="Spacing, radii, components">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={{ height: 44, padding: '0 16px', borderRadius: p.radiusBtn as any, border: 'none', background: p.accent, color: p.onAccent, fontWeight: 800, fontFamily: 'Inter' }}>Primary action</button>
              <button style={{ height: 44, padding: '0 16px', borderRadius: p.radiusBtn as any, border: `1px solid ${p.border}`, background: p.surfaceAlt, color: p.text, fontWeight: 700, fontFamily: 'Inter' }}>Secondary</button>
              <span style={{ padding: '6px 10px', borderRadius: 999, background: p.successBg, color: p.success, fontWeight: 700, fontSize: 12 }}>LIVE</span>
            </div>
            <div style={{ padding: 14, borderRadius: p.radiusCard as any, background: p.surface, border: `1px solid ${p.border}` }}>
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: '0.12em' }}>MATCH CARD</div>
              <div style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif', fontSize: 30, fontWeight: 800 }}>ELW vs NAVY · SET 3</div>
              <div style={{ height: 6, borderRadius: 999, background: p.border, marginTop: 8, overflow: 'hidden' }}><div style={{ width: '62%', height: '100%', background: p.accent }} /></div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, opacity: 0.9 }}>{rules.map(r => <li key={r}>{r}</li>)}</ul>
          </div>
        </Panel>
        <Panel title={`Mode preview: ${mode}`}>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${p.border}`, background: p.bg }}>
            <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: p.surface, borderBottom: `1px solid ${p.border}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{mark}<b style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif', fontSize: 22, letterSpacing: '0.04em' }}>QWESIE TV</b></div>
              <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: p.successBg, color: p.success, fontWeight: 700 }}>Connected</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', minHeight: 160 }}>
              <div style={{ padding: 10, borderRight: `1px solid ${p.border}`, background: p.surfaceAlt, display: 'grid', gap: 6, alignContent: 'start', fontSize: 13 }}>
                {['Today', 'Prepare', 'Go Live', 'Review'].map((n,i)=><div key={n} style={{ padding:'8px 10px', borderRadius:10, background: i===2?p.accent:'transparent', color: i===2?p.onAccent:p.text, fontWeight:700 }}>{n}</div>)}
              </div>
              <div style={{ padding: 12, display: 'grid', gap: 8, alignContent: 'start' }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>GO LIVE · COURT 1</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ padding: 10, borderRadius: 12, background: p.surface, border: `1px solid ${p.border}` }}><div style={{ fontSize: 12, opacity: 0.7 }}>ELW</div><div style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif', fontSize: 40, fontWeight: 800 }}>24</div></div>
                  <div style={{ padding: 10, borderRadius: 12, background: p.surface, border: `1px solid ${p.border}` }}><div style={{ fontSize: 12, opacity: 0.7 }}>NAVY</div><div style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif', fontSize: 40, fontWeight: 800 }}>22</div></div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Iconography & usage rules">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 6, opacity: 0.92 }}>{icon.map(r => <li key={r}>{r}</li>)}</ul>
        </Panel>
      </div>
    </section>
  );
};

export const IdentityPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#f3f4f6', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 20px 40px', display: 'grid', gap: 18 }}>
        <header style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a3a3a3', fontWeight: 700 }}>Stage 6 · Identity exploration</div>
          <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1, fontFamily: '"Barlow Condensed", Inter, sans-serif', letterSpacing: '0.02em' }}>Qwesie TV — Operator App Identity (choose before applying)</h1>
          <p style={{ margin: 0, color: '#d4d4d4', maxWidth: 980, fontSize: 16 }}>
            Two moodboard-style directions for the operator/admin app (not the broadcast overlays). Both use the same offline fonts (Inter + Barlow Condensed), keep Tailwind-compatible tokens, and include light/dark modes. Review and tell me which to apply: <b>Variant A</b> or <b>Variant B</b> (and your preferred default mode).
          </p>
          <div style={{ padding: '12px 14px', border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', borderRadius: 12, color: '#fde68a' }}>
            <b>Decision needed:</b> reply with “Apply Variant A (light/dark default)” or “Apply Variant B (light/dark default)”. I will only apply the chosen identity across RootLayout/pages/components after your selection.
          </div>
        </header>

        <VariantCard
          id="A"
          name="Signal Amber"
          tagline="Broadcast-control identity: graphite surfaces, amber command accents, high operational contrast."
          mark={<MarkA />}
          palettes={{
            light: { bg:'#F3F4F6', surface:'#FFFFFF', surfaceAlt:'#ECEFF3', text:'#111827', muted:'#4B5563', border:'#D6DBE3', accent:'#D97706', onAccent:'#111111', primary:'#111827', onPrimary:'#FFFFFF', success:'#047857', successBg:'#D1FAE5', warn:'#B45309', warnBg:'#FEF3C7', danger:'#B91C1C', dangerBg:'#FEE2E2', radiusBtn:'10px', radiusCard:'14px' },
            dark: { bg:'#0B0D10', surface:'#141821', surfaceAlt:'#1A2030', text:'#F3F4F6', muted:'#9CA3AF', border:'#2A3345', accent:'#F59E0B', onAccent:'#111111', primary:'#F3F4F6', onPrimary:'#111111', success:'#34D399', successBg:'rgba(16,185,129,0.15)', warn:'#FBBF24', warnBg:'rgba(245,158,11,0.16)', danger:'#F87171', dangerBg:'rgba(239,68,68,0.16)', radiusBtn:'10px', radiusCard:'14px' },
          }}
          type={{ display: 'Barlow Condensed 700/800 for scores, set labels, nav/workflow titles', ui: 'Inter 500/600/700 for controls, tables, forms, body', notes: 'Dense, legible control-room feel. Tabular numerals for scores/timers/stats. Short operational labels, all-caps reserved for states (LIVE/FINAL).' }}
          rules={['Spacing: 4px base grid (4/8/12/16/24)', 'Radii: 10px controls, 14px cards/panels, pill for status chips', 'Borders: 1px low-contrast; elevation via subtle contrast, not heavy shadow', 'Touch targets: >=44px for primary controls', 'Focus: 2px amber ring with offset on all interactive elements']}
          icon={['Lucide icons, 1.5px stroke, consistent 16/20/24 sizes', 'Filled/status icons only for live/alert states; outline for navigation', 'Icon + short label for primary workflow actions; avoid icon-only on critical controls', 'Color = meaning (accent action, green live/success, amber warn, red danger), never sole indicator']}
        />

        <VariantCard
          id="B"
          name="Court Teal"
          tagline="Sports-tech identity: deep ink, teal command accents, clean ivory light mode for long operations."
          mark={<MarkB />}
          palettes={{
            light: { bg:'#F4F6F5', surface:'#FFFFFF', surfaceAlt:'#EAF0EE', text:'#0F172A', muted:'#475569', border:'#D3DDD9', accent:'#0F766E', onAccent:'#FFFFFF', primary:'#0B1320', onPrimary:'#FFFFFF', success:'#15803D', successBg:'#DCFCE7', warn:'#B45309', warnBg:'#FEF3C7', danger:'#BE123C', dangerBg:'#FFE4E6', radiusBtn:'12px', radiusCard:'16px' },
            dark: { bg:'#081018', surface:'#0F1A24', surfaceAlt:'#132231', text:'#EAF2F7', muted:'#93A7B8', border:'#22384B', accent:'#14B8A6', onAccent:'#062A27', primary:'#EAF2F7', onPrimary:'#081018', success:'#4ADE80', successBg:'rgba(34,197,94,0.15)', warn:'#FBBF24', warnBg:'rgba(245,158,11,0.16)', danger:'#FB7185', dangerBg:'rgba(244,63,94,0.16)', radiusBtn:'12px', radiusCard:'16px' },
          }}
          type={{ display: 'Barlow Condensed 700/800 for scores, match headers, key numerals', ui: 'Inter 500/600/700 for navigation, forms, tables, dense data', notes: 'Calmer, modern operations feel with strong data clarity. Teal reserved for primary/active actions and live workflow focus. Tabular numerals everywhere numbers compare.' }}
          rules={['Spacing: 4px base grid (4/8/12/16/24/32)', 'Radii: 12px controls, 16px cards, pill for status chips', 'Surfaces layered by tone (bg/surface/surfaceAlt) with 1px borders', 'Touch targets: >=44px; min 16px text for dense control labels', 'Focus: 2px teal ring with offset, visible in both modes']}
          icon={['Lucide icons, 1.5px stroke, 16/20/24 sizes aligned to 4px grid', 'Outline by default; duotone/filled accent only for selected nav or live state', 'Workflow nav groups icons + labels (Today/Prepare/Go Live/Review)', 'Semantic color only with text/badge support for accessibility']}
        />

        <footer style={{ color: '#a3a3a3', fontSize: 13, borderTop: '1px solid rgba(127,127,127,0.25)', paddingTop: 14 }}>
          No app-wide styles/layouts/pages changed yet. Once you choose a variant (and default mode), I’ll apply it across RootLayout, navigation, shared UI components, and operator pages per Stage 6.
        </footer>
      </div>
    </div>
  );
};

export default IdentityPage;
