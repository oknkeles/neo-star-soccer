/** Settings → Help & About: the Falso Çizgisi gesture explained with a small illustration. */
import { motion } from 'framer-motion';
import { t } from '../../../../core/i18n';
import { Card, Icon } from '../../../components/kit';

/** Top-down free kick: the drawn bow, the straight "aim" line and the ball that bends around the wall. */
function CurlIllustration() {
  return (
    <svg viewBox="0 0 320 230" className="w-full max-w-md mx-auto" role="img" aria-label={t('shell.set.help.curlTitle')}>
      <defs>
        <linearGradient id="pitchg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14301f" /><stop offset="100%" stopColor="#0c2016" /></linearGradient>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#ffcb47" /></marker>
      </defs>
      <rect x="2" y="2" width="316" height="226" rx="16" fill="url(#pitchg)" stroke="#20352a" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="2" y={2 + i * 45} width="316" height="22" fill="#fff" opacity="0.025" />)}
      <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5">
        <rect x="70" y="2" width="180" height="62" /><rect x="120" y="2" width="80" height="24" />
        <path d="M130 64 A28 28 0 0 0 190 64" />
      </g>
      <rect x="132" y="-2" width="56" height="6" fill="#e9f5ee" opacity="0.9" />
      {/* wall */}
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={134 + i * 17} cy="108" r="6.5" fill="#ff4f64" opacity="0.9" />)}
      {/* straight aim (dashed) */}
      <path d="M200 205 L152 12" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeDasharray="4 6" fill="none" />
      {/* the drawn gesture */}
      <motion.path d="M200 205 C 250 160, 250 90, 214 52" fill="none" stroke="#ffcb47" strokeWidth="3.5" strokeLinecap="round" markerEnd="url(#arr)"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: false }} transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.6 }} />
      {/* resulting ball path (bends the other way) */}
      <path d="M200 205 C 150 160, 140 90, 178 30" fill="none" stroke="#b8ff3c" strokeWidth="3" strokeLinecap="round" />
      <circle r="8" fill="#fff" stroke="#0b1711" strokeWidth="1.5">
        <animateMotion dur="2.2s" repeatCount="indefinite" path="M200 205 C 150 160, 140 90, 178 30" />
      </circle>
      <circle cx="200" cy="205" r="9" fill="#fff" stroke="#0b1711" strokeWidth="1.5" opacity="0.5" />
      <text x="312" y="198" textAnchor="end" fill="#ffcb47" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700">{t('shell.set.help.drawn')}</text>
      <text x="26" y="150" fill="#b8ff3c" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700">{t('shell.set.help.ball')}</text>
      <text x="108" y="132" fill="#ff8a96" fontFamily="Inter, sans-serif" fontSize="10" fontWeight="600">{t('shell.set.help.wall')}</text>
    </svg>
  );
}

const STEPS = ['move', 'shoot', 'curl', 'loft', 'after', 'pass', 'defend', 'camera'] as const;

export default function HelpSection() {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title={t('shell.set.help.curlTitle')} icon="target" glow="accent">
        <CurlIllustration />
        <p className="text-sm text-ink/90 leading-relaxed mt-3">{t('shell.set.help.curlBody')}</p>
      </Card>
      <Card title={t('shell.set.help.controls')} icon="gamepad">
        <ul className="grid grid-cols-1 gap-2.5">
          {STEPS.map((s) => (
            <li key={s} className="flex gap-3 text-sm">
              <span className="grid place-items-center size-8 rounded-lg bg-accent/10 text-accent shrink-0"><Icon name={t(`shell.set.help.${s}.icon`)} size={16} /></span>
              <span className="min-w-0"><span className="font-bold">{t(`shell.set.help.${s}.t`)}</span><span className="block text-ink-dim">{t(`shell.set.help.${s}.d`)}</span></span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t('shell.set.about.title')} icon="info">
        <div className="text-sm text-ink-dim leading-relaxed grid gap-2">
          <p><span className="font-display text-2xl text-ink">NEO STAR SOCCER</span> · v0.1</p>
          <p>{t('shell.set.about.body')}</p>
          <p className="text-xs text-ink-mute">{t('shell.title.credits')}</p>
        </div>
      </Card>
    </div>
  );
}
