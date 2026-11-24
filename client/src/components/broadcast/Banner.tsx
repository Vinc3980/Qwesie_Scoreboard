import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const Banner: React.FC<{ show?: boolean; children: React.ReactNode; side?: 'left'|'right'|'bottom'; color?: string; textColor?: string; className?: string; }> = ({ show = true, children, side = 'bottom', color = 'var(--broadcast-surface-2)', textColor = 'var(--broadcast-text)', className = '' }) => {
  const from = side === 'left' ? { x: -120, opacity: 0 } : side === 'right' ? { x: 120, opacity: 0 } : { y: 80, opacity: 0 };
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={from} animate={{ x: 0, y: 0, opacity: 1 }} exit={from} transition={{ duration: 0.32, ease: [0.22,1,0.36,1] }} className={className} style={{ background: color, color: textColor }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
