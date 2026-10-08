/**
 * Typewriter text; click (or `skip`) to finish instantly.
 * Wall-clock based: any text types out in about `MAX_MS` at most, even when the browser throttles timers.
 */
import { useEffect, useRef, useState } from 'react';
import { clsx } from '../../components/kit';

const MAX_MS = 2200;

export default function Typewriter({ text, speed = 16, onDone, className, skip }: {
  text: string; speed?: number; onDone?: () => void; className?: string; skip?: boolean;
}) {
  const [n, setN] = useState(0);
  const done = n >= text.length;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (skip || !text.length) { setN(text.length); return; }
    setN(0);
    const total = Math.min(MAX_MS, Math.max(500, text.length * 14));
    const start = Date.now();
    const id = setInterval(() => {
      const k = Math.min(text.length, Math.ceil(((Date.now() - start) / total) * text.length));
      setN((prev) => Math.max(prev, k));
      if (k >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, skip]);
  // Also fires for an empty text, so a caller waiting on `onDone` can never get stuck.
  useEffect(() => { if (done) doneRef.current?.(); }, [done, text]);

  return (
    <p className={clsx('whitespace-pre-line', className)} onClick={() => setN(text.length)}>
      {skip ? text : text.slice(0, n)}
      {!done && !skip && <span className="inline-block w-[2px] h-[1.1em] align-[-0.15em] ml-0.5 bg-accent animate-nss-pulse" />}
    </p>
  );
}
