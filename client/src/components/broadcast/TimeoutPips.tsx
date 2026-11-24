import React from 'react';

export const TimeoutPips: React.FC<{ total: number; used: number; color?: string; size?: number; }> = ({ total, used, color = 'currentColor', size = 14 }) => {
  const remaining = Math.max(0, total - used);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => {
        const on = i < remaining;
        return <span key={i} style={{ width: size, height: size, borderRadius: 999, background: on ? color : 'rgba(255,255,255,0.18)', boxShadow: on ? `0 0 10px ${color}` : 'none', display: 'inline-block' }} />;
      })}
    </div>
  );
};
