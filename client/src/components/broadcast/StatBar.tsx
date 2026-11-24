import React from 'react';
import { motion } from 'framer-motion';

export const StatBar: React.FC<{ valueA: number; valueB: number; colorA?: string; colorB?: string; height?: number; label?: string; }> = ({ valueA, valueB, colorA = 'var(--team-a)', colorB = 'var(--team-b)', height = 18, label }) => {
  const total = Math.max(1, (valueA || 0) + (valueB || 0));
  const pa = ((valueA || 0) / total) * 100;
  const pb = ((valueB || 0) / total) * 100;
  return (
    <div style={{ width: '100%' }}>
      {label && <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 8, color: 'var(--broadcast-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>}
      <div style={{ width: '100%', height, background: 'rgba(255,255,255,0.12)', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pa}%` }} transition={{ duration: 0.45, ease: [0.22,1,0.36,1] }} style={{ height: '100%', background: colorA }} />
        <motion.div initial={{ width: 0 }} animate={{ width: `${pb}%` }} transition={{ duration: 0.45, ease: [0.22,1,0.36,1] }} style={{ height: '100%', background: colorB }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 30, fontWeight: 700 }} className="tabular-score">
        <span style={{ color: colorA }}>{valueA ?? 0}</span>
        <span style={{ color: colorB }}>{valueB ?? 0}</span>
      </div>
    </div>
  );
};
