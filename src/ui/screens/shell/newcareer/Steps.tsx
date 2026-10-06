/** The wizard steps of the new-career flow (name, nation, position, look, trait, fate). */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Dices, Search } from 'lucide-react';
import type { Appearance, Foot, NationCode, PlayablePosition, TraitId } from '../../../../core/types';
import { Rng, freshSeed } from '../../../../core/rng';
import { getLang, t, tl } from '../../../../core/i18n';
import { NATIONS, randomName, getNation } from '../../../../world/api';
import { TRAITS } from '../../../../career/api';
import Avatar, { BEARD_STYLES, FACE_COUNT, HAIR_STYLES, SKIN_TONES, faceHeight, faceIndex } from '../../../components/Avatar';
import { TextField } from '../../../components/controls';
import { Button, EmptyState, Icon, clsx, toast } from '../../../components/kit';
import { attempt } from '../helpers';
import { BOOT_COLORS, HAIR_COLORS, POSITIONS, rollAppearance, type Draft } from './data';

export interface StepProps { draft: Draft; set: (patch: Partial<Draft>) => void }

function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-4xl sm:text-5xl leading-none">{title}</h2>
      {sub && <p className="text-ink-dim mt-2 text-sm sm:text-base max-w-xl">{sub}</p>}
    </div>
  );
}

function Swatch({ color, active, onClick, label, size = 34 }: { color: string; active: boolean; onClick: () => void; label?: string; size?: number }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label ?? color} title={label}
      className={clsx('relative rounded-full border-2 cursor-pointer transition-transform hover:scale-110', active ? 'border-accent scale-110 shadow-[0_0_14px_rgba(184,255,60,0.6)]' : 'border-white/15')}
      style={{ background: color, width: size, height: size }}
    >
      {active && <Check size={14} className="absolute inset-0 m-auto" style={{ color: color === '#ffffff' || color === '#e9e4d8' || color === '#f6d7c3' || color === '#b8ff3c' || color === '#ffcb47' ? '#000' : '#fff' }} strokeWidth={3} />}
    </button>
  );
}

// ───────── 1. name ─────────

export function NameStep({ draft, set }: StepProps) {
  const roll = () => {
    try {
      const n = randomName(new Rng(freshSeed()), draft.nation);
      set({ first: n.first, last: n.last });
    } catch {
      toast(t('shell.nc.name.diceFail'), 'danger', 'dice');
    }
  };
  return (
    <div>
      <StepTitle title={t('shell.nc.name.title')} sub={t('shell.nc.name.sub')} />
      <div className="grid grid-cols-1 gap-4 max-w-xl">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label={t('shell.nc.name.first')} value={draft.first} maxLength={18} autoFocus autoComplete="off"
            onChange={(e) => set({ first: e.target.value })} placeholder={t('shell.nc.name.firstPh')} />
          <TextField label={t('shell.nc.name.last')} value={draft.last} maxLength={20} autoComplete="off"
            onChange={(e) => set({ last: e.target.value })} placeholder={t('shell.nc.name.lastPh')} />
        </div>
        <TextField label={t('shell.nc.name.nick')} value={draft.nickname} maxLength={14} autoComplete="off"
          onChange={(e) => set({ nickname: e.target.value })} placeholder={t('shell.nc.name.nickPh')} />
        <p className="text-xs text-ink-mute -mt-2">{t('shell.nc.name.nickHint')}</p>
        <div>
          <Button variant="secondary" onClick={roll}><Dices size={17} />{t('shell.nc.name.dice')}</Button>
        </div>
      </div>
    </div>
  );
}

// ───────── 2. nation ─────────

export function NationStep({ draft, set }: StepProps) {
  const [q, setQ] = useState('');
  const lang = getLang();
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en');
    const all = [...NATIONS].sort((a, b) => {
      if (a.code === 'TUR') return -1;
      if (b.code === 'TUR') return 1;
      return a.name[lang].localeCompare(b.name[lang], lang);
    });
    return needle ? all.filter((n) => n.name[lang].toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en').includes(needle) || n.code.toLowerCase().includes(needle)) : all;
  }, [q, lang]);

  return (
    <div>
      <StepTitle title={t('shell.nc.nation.title')} sub={t('shell.nc.nation.sub')} />
      <div className="relative max-w-md mb-4">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('shell.nc.nation.search')}
          className="w-full h-11 rounded-xl bg-white/5 border border-line pl-10 pr-3 outline-none focus:border-accent/60"
        />
      </div>
      {NATIONS.length === 0 ? (
        <EmptyState icon="globe" title={t('shell.nc.nation.none')} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[52vh] md:max-h-[58vh] overflow-y-auto pr-1 -mr-1">
          {list.map((n) => {
            const active = draft.nation === n.code;
            return (
              <motion.button
                key={n.code} layout="position" whileTap={{ scale: 0.97 }}
                onClick={() => set({ nation: n.code })}
                className={clsx('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left cursor-pointer transition-colors',
                  active ? 'border-accent bg-accent/12 shadow-[0_0_20px_-8px_rgba(184,255,60,0.8)]' : 'border-line bg-white/4 hover:bg-white/8')}
              >
                <span className="text-2xl leading-none shrink-0">{n.flag}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{n.name[lang]}</span>
                  {n.league && <span className="block text-[10px] uppercase tracking-wider text-accent/80 font-bold">{t('shell.nc.nation.league')}</span>}
                </span>
                {active && <Check size={16} className="ml-auto text-accent shrink-0" strokeWidth={3} />}
              </motion.button>
            );
          })}
          {list.length === 0 && <div className="col-span-full text-ink-dim text-sm py-6 text-center">{t('shell.nc.nation.empty')}</div>}
        </div>
      )}
    </div>
  );
}

// ───────── 3. position ─────────

function PitchSpot({ spot }: { spot: [number, number] }) {
  return (
    <svg viewBox="0 0 100 100" className="w-14 h-[72px] shrink-0 rounded-lg bg-[#0d2418] border border-line" aria-hidden>
      <g fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5">
        <rect x="6" y="6" width="88" height="88" /><line x1="6" y1="50" x2="94" y2="50" /><circle cx="50" cy="50" r="12" />
        <rect x="26" y="6" width="48" height="18" /><rect x="26" y="76" width="48" height="18" />
      </g>
      <circle cx={spot[0]} cy={spot[1]} r="9" fill="#b8ff3c" opacity="0.25" />
      <circle cx={spot[0]} cy={spot[1]} r="5" fill="#b8ff3c" />
    </svg>
  );
}

export function PositionStep({ draft, set }: StepProps) {
  return (
    <div>
      <StepTitle title={t('shell.nc.pos.title')} sub={t('shell.nc.pos.sub')} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {POSITIONS.map((p, i) => {
          const active = draft.position === p.id;
          return (
            <motion.button
              key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.98 }} onClick={() => set({ position: p.id })}
              className={clsx('flex gap-3 rounded-2xl border p-3.5 text-left cursor-pointer transition-colors',
                active ? 'border-accent bg-accent/10 shadow-[0_0_28px_-10px_rgba(184,255,60,0.8)]' : 'border-line bg-white/4 hover:bg-white/7')}
            >
              <PitchSpot spot={p.spot} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Icon name={p.icon} size={16} className={active ? 'text-accent' : 'text-ink-mute'} />
                  <span className="font-display text-2xl leading-none">{t(`shell.pos.${p.id}`)}</span>
                </span>
                <span className="block text-xs text-ink-dim mt-1.5 leading-relaxed">{t(`shell.nc.pos.desc.${p.id}`)}</span>
                <span className="flex flex-wrap gap-1 mt-2">
                  {p.attrs.map((a) => <span key={a} className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-ink-dim">{t(`common.attr.${a}`)}</span>)}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ───────── 4. look ─────────

function Thumb({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className={clsx('rounded-xl p-1 border-2 cursor-pointer transition-all hover:scale-105', active ? 'border-accent bg-accent/10 shadow-[0_0_16px_-4px_rgba(184,255,60,0.7)]' : 'border-transparent bg-white/4')}>
      {children}
    </button>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-mute mb-2">{title}</div>
      {children}
    </div>
  );
}

export function LookStep({ draft, set }: StepProps) {
  const a = draft.appearance;
  const patch = (p: Partial<Appearance>) => set({ appearance: { ...a, ...p } });
  const nationKit = attempt(() => getNation(draft.nation).kit, undefined);
  const feet: { id: Foot; label: string }[] = [{ id: 'L', label: t('shell.nc.look.left') }, { id: 'R', label: t('shell.nc.look.right') }];
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <StepTitle title={t('shell.nc.look.title')} sub={t('shell.nc.look.sub')} />
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => set({ appearance: rollAppearance(draft.nation) })}><Dices size={15} />{t('shell.nc.look.random')}</Button>
      </div>
      <div className="grid grid-cols-1 gap-5">
        <Row title={t('shell.nc.look.foot')}>
          <div className="flex gap-2">
            {feet.map((f) => (
              <button key={f.id} onClick={() => set({ foot: f.id })}
                className={clsx('flex-1 max-w-[180px] h-12 rounded-xl border font-semibold cursor-pointer transition-colors',
                  draft.foot === f.id ? 'border-accent bg-accent text-bg' : 'border-line bg-white/4 text-ink-dim hover:text-ink')}>{f.label}</button>
            ))}
          </div>
          <p className="text-xs text-ink-mute mt-1.5">{t('shell.nc.look.footHint')}</p>
        </Row>
        <Row title={t('shell.nc.look.skin')}>
          <div className="flex flex-wrap gap-2.5">{SKIN_TONES.map((c, i) => <Swatch key={c} color={c} active={a.skin === i} onClick={() => patch({ skin: i })} size={38} />)}</div>
        </Row>
        <Row title={t('shell.nc.look.face')}>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: FACE_COUNT }, (_, k) => (
              <Thumb key={k} active={faceIndex(a) === k} onClick={() => patch({ height: faceHeight(k) })}>
                <Avatar appearance={{ ...a, height: faceHeight(k) }} kit={nationKit} size={52} />
              </Thumb>
            ))}
          </div>
        </Row>
        <Row title={t('shell.nc.look.hairStyle')}>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: HAIR_STYLES }, (_, i) => (
              <Thumb key={i} active={a.hairStyle === i} onClick={() => patch({ hairStyle: i })}>
                <Avatar appearance={{ ...a, hairStyle: i }} kit={nationKit} size={52} />
              </Thumb>
            ))}
          </div>
        </Row>
        <Row title={t('shell.nc.look.hairColor')}>
          <div className="flex flex-wrap gap-2.5">{HAIR_COLORS.map((c) => <Swatch key={c} color={c} active={a.hairColor === c} onClick={() => patch({ hairColor: c })} />)}</div>
        </Row>
        <Row title={t('shell.nc.look.beard')}>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: BEARD_STYLES }, (_, i) => (
              <Thumb key={i} active={a.beard === i} onClick={() => patch({ beard: i })}>
                <Avatar appearance={{ ...a, beard: i }} kit={nationKit} size={52} />
              </Thumb>
            ))}
          </div>
        </Row>
        <Row title={t('shell.nc.look.boots')}>
          <div className="flex flex-wrap gap-2.5">{BOOT_COLORS.map((c) => <Swatch key={c} color={c} active={a.boots === c} onClick={() => patch({ boots: c })} />)}</div>
        </Row>
      </div>
    </div>
  );
}

// ───────── 5. trait ─────────

export function TraitStep({ draft, set, offered }: StepProps & { offered: TraitId[] }) {
  const defs = offered.map((id) => TRAITS.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div>
      <StepTitle title={t('shell.nc.trait.title')} sub={t('shell.nc.trait.sub')} />
      {defs.length === 0 ? <EmptyState icon="sparkles" title={t('shell.nc.trait.none')} /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {defs.map((d, i) => {
            const active = draft.trait === d.id;
            return (
              <motion.button
                key={d.id} initial={{ opacity: 0, y: 14, rotateX: 25 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.07 }}
                whileTap={{ scale: 0.98 }} onClick={() => set({ trait: d.id })}
                className={clsx('relative text-left rounded-2xl border p-4 cursor-pointer transition-colors overflow-hidden',
                  active ? 'border-accent bg-accent/10 shadow-[0_0_30px_-10px_rgba(184,255,60,0.9)]' : 'border-line bg-white/4 hover:bg-white/7')}
              >
                <span className="flex items-center gap-3">
                  <span className={clsx('grid place-items-center size-11 rounded-xl shrink-0', active ? 'bg-accent text-bg' : 'bg-white/8 text-accent')}><Icon name={d.icon} size={22} /></span>
                  <span className="font-display text-2xl leading-none">{tl(d.name)}</span>
                  {active && <Check size={18} className="ml-auto text-accent" strokeWidth={3} />}
                </span>
                <span className="block text-sm text-ink-dim mt-2.5 leading-relaxed">{tl(d.desc)}</span>
              </motion.button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-ink-mute mt-4 flex items-center gap-1.5"><Icon name="eye" size={13} />{t('shell.nc.trait.hidden')}</p>
    </div>
  );
}

// ───────── 6. fate ─────────

export function FateStep({ draft, onForge, error }: { draft: Draft; onForge: () => void; error: string | null }) {
  const nation = attempt(() => getNation(draft.nation), null);
  const trait = TRAITS.find((x) => x.id === draft.trait);
  const rows: [string, string][] = [
    [t('shell.nc.fate.name'), `${draft.first.trim()} ${draft.last.trim()}${draft.nickname.trim() ? ` “${draft.nickname.trim()}”` : ''}`],
    [t('shell.nc.step.nation'), nation ? `${nation.flag} ${tl(nation.name)}` : draft.nation],
    [t('shell.nc.step.position'), `${t(`shell.pos.${draft.position as PlayablePosition}`)} · ${draft.foot === 'L' ? t('shell.nc.look.left') : t('shell.nc.look.right')}`],
    [t('shell.nc.step.trait'), trait ? tl(trait.name) : '—'],
  ];
  return (
    <div>
      <StepTitle title={t('shell.nc.fate.title')} sub={t('shell.nc.fate.sub')} />
      <div className="rounded-2xl border border-line bg-white/4 divide-y divide-line/70 max-w-xl">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-ink-mute uppercase tracking-wider text-[11px] font-bold">{k}</span>
            <span className="font-semibold text-right">{v}</span>
          </div>
        ))}
      </div>
      {error && <div className="mt-4 max-w-xl rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{t('shell.nc.forge.fail', { msg: error })}</div>}
      <motion.div className="mt-7" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
        <button onClick={onForge}
          className="relative w-full max-w-xl h-16 rounded-2xl bg-accent text-bg font-display text-3xl tracking-wide cursor-pointer overflow-hidden shadow-[0_0_50px_-8px_rgba(184,255,60,0.9)]">
          <span className="absolute inset-0 shine" />
          <span className="relative flex items-center justify-center gap-3"><Icon name="sparkles" size={24} />{t('shell.nc.fate.cta')}</span>
        </button>
      </motion.div>
    </div>
  );
}
