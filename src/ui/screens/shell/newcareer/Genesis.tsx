/** Genesis reveal: backstory typewriter, motto, destiny hint, family & agent, rival, goals. */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Flag, Quote, Sparkles, Target } from 'lucide-react';
import type { GameState, Person } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { overall } from '../../../../core/ratings';
import Avatar from '../../../components/Avatar';
import { Badge, Button, Crest, Icon } from '../../../components/kit';
import Typewriter from '../Typewriter';
import { DEFAULT_KIT, posName } from '../helpers';

const ROLE_ICON: Record<string, string> = { father: 'user', mother: 'heart', sibling: 'users', partner: 'heart', friend: 'smile', agent: 'briefcase', journalist: 'mic', director: 'building' };

function PersonCard({ p, tone = 'neutral' }: { p: Person; tone?: 'neutral' | 'gold' }) {
  return (
    <div className="rounded-2xl border border-line bg-white/4 p-3.5 flex gap-3">
      <span className={`grid place-items-center size-11 rounded-xl shrink-0 ${tone === 'gold' ? 'bg-gold/12 text-gold' : 'bg-accent/10 text-accent'}`}><Icon name={ROLE_ICON[p.role] ?? 'user'} size={20} /></span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-bold truncate">{p.name}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-ink-mute">{t(`shell.role.${p.role}`)}</span>
        </div>
        <div className="text-xs text-accent/80 mt-0.5">{p.personality}</div>
        <div className="text-xs text-ink-dim mt-1 leading-relaxed">{p.bio}</div>
      </div>
    </div>
  );
}

function Reveal({ show, children, className }: { show: boolean; children: React.ReactNode; className?: string }) {
  if (!show) return null;
  return <motion.section className={className} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>{children}</motion.section>;
}

export default function Genesis({ state, onNext }: { state: GameState; onNext: () => void }) {
  const g = state.career.genesis;
  const player = state.world.players[state.career.playerId];
  const rival = state.world.players[state.career.rivalId];
  const rivalClub = rival?.clubId ? state.world.clubs[rival.clubId] : null;
  const [stage, setStage] = useState(0);
  const [skip, setSkip] = useState(false);

  // After the typewriter ends, reveal the rest section by section.
  useEffect(() => {
    if (stage < 1 || stage >= 5 || skip) return;
    const id = setTimeout(() => setStage((s) => s + 1), 450);
    return () => clearTimeout(id);
  }, [stage, skip]);

  // "Atla": show the whole story at once (text, motto, family, rival, goals and the continue button).
  const skipAll = () => { setSkip(true); setStage(5); };

  return (
    <div className="relative min-h-dvh px-4 py-8 sm:py-12 bg-bg overflow-x-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(70% 40% at 50% 0%, rgba(184,255,60,0.12), transparent 70%)' }} />
      <div className="relative max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-7">
          <div className="text-[11px] tracking-[0.4em] uppercase text-accent font-bold">{t('shell.nc.gen.kicker')}</div>
          <h1 className="font-display text-5xl sm:text-6xl leading-none mt-1">{t('shell.nc.gen.title')}</h1>
          {g.ai && <Badge tone="violet" className="mt-2"><Sparkles size={11} />{t('shell.nc.gen.ai')}</Badge>}
        </motion.div>

        <div className="rounded-3xl border border-line bg-white/4 p-5 sm:p-7">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-3"><Icon name="book_open" size={13} />{player.firstName} {player.lastName} · {g.hometown}</div>
          <Typewriter text={g.backstory} className="text-[17px] sm:text-lg leading-relaxed text-ink/95" skip={skip} onDone={() => setStage((s) => (s === 0 ? 1 : s))} />
          {stage < 5 && <button onClick={skipAll} className="mt-3 inline-flex items-center h-9 px-3 rounded-xl bg-white/6 hover:bg-white/10 text-xs font-semibold text-ink-dim hover:text-ink cursor-pointer">{t('shell.nc.gen.skip')} →</button>}
        </div>

        <div className="grid grid-cols-1 gap-4 mt-4">
          <Reveal show={stage >= 1} className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-white/4 p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-1.5"><Quote size={12} />{t('shell.nc.gen.motto')}</div>
              <div className="font-display text-3xl leading-tight text-accent">“{g.motto}”</div>
            </div>
            <div className="rounded-2xl border border-line bg-white/4 p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-1.5"><Flag size={12} />{t('shell.nc.gen.dream')}</div>
              <div className="text-[15px] leading-relaxed">{g.dream}</div>
              {g.theme && <div className="mt-2.5"><Badge tone="info">{g.theme}</Badge></div>}
            </div>
          </Reveal>

          <Reveal show={stage >= 2}>
            <div className="relative overflow-hidden rounded-2xl border border-gold/35 p-4 sm:p-5" style={{ background: 'linear-gradient(135deg, rgba(255,203,71,0.12), rgba(169,139,255,0.08))' }}>
              <motion.div className="absolute -right-6 -top-6 size-28 rounded-full bg-gold/15 blur-2xl" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 4, repeat: Infinity }} />
              <div className="relative flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-gold mb-1.5"><Eye size={13} />{t('shell.nc.gen.destiny')}</div>
              <div className="relative font-display text-2xl sm:text-3xl leading-snug text-gold/95 italic">{g.destinyHint}</div>
            </div>
          </Reveal>

          <Reveal show={stage >= 3} className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute -mb-1">{t('shell.nc.gen.people')}</div>
            <PersonCard p={g.agent} tone="gold" />
            {g.family.map((f) => <PersonCard key={f.id} p={f} />)}
          </Reveal>

          <Reveal show={stage >= 4}>
            {rival && (
              <div className="relative overflow-hidden rounded-2xl border border-danger/35 bg-danger/6 p-4 flex gap-4 items-center">
                <Avatar appearance={rival.appearance} kit={rivalClub?.kit ?? DEFAULT_KIT} size={76} mood="angry" ring="none" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-danger mb-1"><Icon name="swords" size={13} />{t('shell.nc.gen.rival')}</div>
                  <div className="font-display text-3xl leading-none truncate">{rival.firstName} {rival.lastName}</div>
                  <div className="text-xs text-ink-dim mt-1 flex items-center gap-2">
                    {rivalClub && <><Crest kit={rivalClub.kit} label={rivalClub.shortName} size={16} /><span className="truncate">{rivalClub.name}</span><span>·</span></>}
                    <span>{posName(rival.position)}</span><span>·</span><span>{t('common.overall')} {overall(rival)}</span>
                  </div>
                  {g.rivalBlurb && <p className="text-sm text-ink/85 mt-1.5 leading-relaxed">{g.rivalBlurb}</p>}
                </div>
              </div>
            )}
          </Reveal>

          <Reveal show={stage >= 5} className="rounded-2xl border border-line bg-white/4 p-4">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2.5"><Target size={13} />{t('shell.nc.gen.goals')}</div>
            <ul className="grid grid-cols-1 gap-2">
              {g.goals.map((goal, i) => (
                <motion.li key={goal.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex items-start gap-3 text-[15px]">
                  <span className="grid place-items-center size-6 rounded-full border border-accent/50 text-accent text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>{goal.text}
                </motion.li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end">
              <Button variant="primary" size="lg" icon="arrow_right" onClick={onNext}>{t('shell.nc.gen.next')}</Button>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
