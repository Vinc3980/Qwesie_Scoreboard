import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const ScoreDigits: React.FC<{ value: number | string; className?: string; style?: React.CSSProperties; }> = ({ value, className = '', style }) => {
  return (
    <div className={`relative overflow-hidden tabular-score ${className}`} style={style}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={String(value)} initial={{ y: '-35%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '35%', opacity: 0 }} transition={{ duration: 0.22, ease: [0.22,1,0.36,1] }} style={{ display: 'inline-block' }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};
