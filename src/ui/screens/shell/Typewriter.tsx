/** Typewriter text; click (or `skip`) to finish instantly. */
import { useEffect, useState } from 'react';
import { clsx } from '../../components/kit';

export default function Typewriter({ text, speed = 16, onDone, className, skip }: {
  text: string; speed?: number; onDone?: () => void; className?: string; skip?: boolean;
}) {
  const [n, setN] = useState(0);
  const done = n >= text.length;

  useEffect(() => { setN(0); }, [text]);
  useEffect(() => {
    if (skip) { setN(text.length); return; }
    if (done) return;
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + (text[x] === ' ' ? 2 : 1))), speed);
    return () => clearTimeout(id);
  }, [n, text, speed, skip, done]);
  useEffect(() => { if (done && text.length) onDone?.(); }, [done, text.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <p className={clsx('whitespace-pre-line', className)} onClick={() => setN(text.length)}>
      {text.slice(0, n)}
      {!done && <span className="inline-block w-[2px] h-[1.1em] align-[-0.15em] ml-0.5 bg-accent animate-nss-pulse" />}
    </p>
  );
}
