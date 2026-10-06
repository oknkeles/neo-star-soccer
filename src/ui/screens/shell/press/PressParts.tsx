/** Press-room visuals: flashing cameras, mic stand, newspaper clipping, journalist card. */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { Rng } from '../../../../core/rng';
import { formatDate } from '../helpers';

export function PressRoomBackdrop() {
  const flashes = useMemo(() => {
    const rng = new Rng(4242);
    return Array.from({ length: 9 }, (_, i) => ({ i, x: rng.float(4, 96), y: rng.float(30, 78), delay: rng.float(0, 6), every: rng.float(3.5, 8), size: rng.float(70, 150) }));
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(255,255,255,0.08), transparent 70%), linear-gradient(180deg, #0c1612, #070d0a)' }} />
      <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.6), transparent)' }} />
      {flashes.map((f) => (
        <motion.span
          key={f.i} className="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: f.size, height: f.size, marginLeft: -f.size / 2, marginTop: -f.size / 2, background: 'radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0) 65%)' }}
          initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.9, 0.15, 0] }}
          transition={{ duration: 0.45, delay: f.delay, repeat: Infinity, repeatDelay: f.every }}
        />
      ))}
    </div>
  );
}

export function MicStand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 120" className={className} aria-hidden>
      <g stroke="#2a3a31" strokeWidth="3" strokeLinecap="round" fill="none"><path d="M30 38 V108" /><path d="M16 112 H44" /></g>
      <rect x="22" y="8" width="16" height="30" rx="8" fill="#1b2a22" stroke="#4a6455" strokeWidth="2" />
      <g stroke="#4a6455" strokeWidth="1.2"><path d="M24 16 H36" /><path d="M24 22 H36" /><path d="M24 28 H36" /></g>
      <circle cx="30" cy="6" r="2.4" fill="#ff4f64"><animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" /></circle>
    </svg>
  );
}

export function Clipping({ outlet, headline, tilt = -1.2 }: { outlet: string; headline: string; tilt?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotate: tilt * 6, y: 30 }} animate={{ opacity: 1, scale: 1, rotate: tilt, y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.1 }}
      className="relative mx-auto max-w-md px-5 pt-3 pb-4 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.8)]"
      style={{ background: 'linear-gradient(180deg, #ece5d1, #ddd4bc)', color: '#1d1a14', fontFamily: 'Georgia, "Times New Roman", serif', borderRadius: 3 }}
    >
      <div className="flex items-center justify-between border-b-2 border-double border-[#1d1a14]/60 pb-1 text-[10px] tracking-[0.3em] uppercase font-bold">
        <span>{outlet}</span><span className="opacity-60">{formatDate(new Date().toISOString())}</span>
      </div>
      <div className="mt-2.5 text-[26px] sm:text-[30px] leading-[1.05] font-black tracking-tight">{headline}</div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 opacity-35" aria-hidden>
        {[0, 1, 2].map((c) => <div key={c} className="grid gap-1">{Array.from({ length: 4 }, (_, i) => <span key={i} className="block h-[3px] rounded bg-[#1d1a14]" style={{ width: `${70 + ((i * 17 + c * 11) % 30)}%` }} />)}</div>)}
      </div>
    </motion.div>
  );
}

export function JournalistBadge({ name, outlet, topic }: { name: string; outlet: string; topic?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid place-items-center size-12 rounded-full bg-white/8 border border-line text-ink font-display text-2xl">
        {name.trim().slice(0, 1).toUpperCase()}
        <span className="absolute -bottom-1 -right-1 grid place-items-center size-5 rounded-full bg-accent text-bg"><Mic size={11} /></span>
      </span>
      <div className="min-w-0 leading-tight">
        <div className="font-bold truncate">{name}</div>
        <div className="text-xs text-ink-dim truncate">{outlet}{topic ? ` · ${topic}` : ''}</div>
      </div>
    </div>
  );
}
