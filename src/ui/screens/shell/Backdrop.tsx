/**
 * Decorative 3D stadium backdrop for menus. Falls back to a pure-CSS night pitch with
 * floodlight beams when WebGL (or the view module) is unavailable.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Kit } from '../../../core/types';
import { mountStadiumBackdrop } from '../../../match/view/api';

function Fallback() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050b08]">
      <div className="absolute inset-x-0 bottom-0 h-[55%]" style={{
        background: 'repeating-linear-gradient(90deg, #0f2a1a 0 70px, #0b2115 70px 140px)',
        transform: 'perspective(500px) rotateX(58deg)', transformOrigin: 'bottom',
        boxShadow: 'inset 0 40px 80px #050b08',
      }} />
      {[12, 36, 64, 88].map((x, i) => (
        <motion.div
          key={x} className="absolute -top-10 h-[75%] w-40 origin-top"
          style={{ left: `${x}%`, background: 'linear-gradient(180deg, rgba(255,246,200,0.30), transparent 85%)', clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)', filter: 'blur(6px)' }}
          animate={{ opacity: [0.5, 0.9, 0.5], rotate: [i % 2 ? -6 : 6, i % 2 ? 4 : -4, i % 2 ? -6 : 6] }}
          transition={{ duration: 7 + i, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div className="absolute inset-x-0 top-[30%] h-24" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 3px, transparent 3px 9px)', maskImage: 'linear-gradient(180deg, transparent, #000, transparent)' }} />
    </div>
  );
}

export default function Backdrop({ kit, time = 'night' }: { kit?: Kit; time?: 'day' | 'dusk' | 'night' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let handle: { dispose(): void } | null = null;
    try {
      handle = mountStadiumBackdrop(el, { kit, time });
    } catch {
      setFailed(true);
    }
    return () => {
      try { handle?.dispose(); } catch { /* decorative */ }
    };
  }, [kit, time]);

  return (
    <div className="absolute inset-0 -z-0">
      {failed && <Fallback />}
      <div ref={ref} className="absolute inset-0" style={{ filter: 'brightness(1.85) contrast(1.06) saturate(1.1)' }} />
    </div>
  );
}
