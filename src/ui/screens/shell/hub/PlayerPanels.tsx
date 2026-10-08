/** Hub panels about the player: a compact card and the short row of quick actions. */
import { Badge, Card, CountUp, Icon, Meter, clsx } from '../../../components/kit';
import type { GameState } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { overall } from '../../../../core/ratings';
import type { Agenda } from '../../../../game/api';
import Avatar from '../../../components/Avatar';
import { navigate } from '../../../router';
import { DEFAULT_KIT, money, posName, userView } from '../helpers';

export function PlayerCard({ state }: { state: GameState }) {
  const v = userView(state);
  if (!v) return null;
  const { player, club } = v;
  const ovr = overall(player);
  const age = state.season - player.birthYear;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full blur-3xl opacity-20" style={{ background: club?.kit.primary ?? '#b8ff3c' }} />
      <div className="relative flex items-center gap-4">
        <button onClick={() => navigate('career')} className="shrink-0 cursor-pointer" aria-label={t('shell.nav.career')}>
          <Avatar appearance={player.appearance} kit={club?.kit ?? DEFAULT_KIT} size={72} mood={player.morale >= 60 ? 'happy' : player.morale < 35 ? 'sad' : 'neutral'} ring="accent" blink />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-3xl leading-none truncate">{player.nickname || player.lastName}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{posName(player.position)}</Badge>
            <Badge>{age} {t('common.age').toLowerCase()}</Badge>
            {player.injury && <Badge tone="danger"><Icon name="hospital" size={11} />{t('shell.hub.injured', { n: player.injury.weeksLeft })}</Badge>}
          </div>
          <div className="mt-1.5 text-xs text-ink-dim">{t('common.value')} <span className="font-display text-lg text-gold align-middle">{money(player.value)}</span></div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-6xl leading-[0.85] text-accent neon-text"><CountUp value={ovr} /></div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-ink-mute mt-0.5">{t('common.overall')}</div>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-3">
        <Meter label={t('common.morale')} value={player.morale} icon="smile" size="sm" />
        <Meter label={t('common.energy')} value={state.career.energy} icon="zap" size="sm" />
        <Meter label={t('common.fitness')} value={player.fitness} icon="heart_pulse" size="sm" />
      </div>
    </Card>
  );
}

/** Three always-on shortcuts (+ the press conference when one is due). */
export function QuickActions({ state, agenda }: { state: GameState; agenda: Agenda }) {
  const left = state.career.actionsLeft;
  const max = Math.max(3, left);
  const items: { icon: string; label: string; on: () => void; badge?: boolean }[] = [
    { icon: 'dumbbell', label: t('shell.nav.training'), on: () => navigate('training') },
    { icon: 'gem', label: t('shell.nav.lifestyle'), on: () => navigate('lifestyle') },
    { icon: 'briefcase', label: t('shell.hub.agent'), on: () => navigate('people', { chat: 'agent' }) },
  ];
  if (agenda.pressAvailable) items.push({ icon: 'mic', label: t('shell.hub.pressShort'), on: () => navigate('press', { occasion: agenda.pressAvailable! }), badge: true });

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5 mb-2 px-1 text-[11px] text-ink-mute" title={t('shell.hub.actions', { n: left, max })}>
        {Array.from({ length: max }, (_, i) => <span key={i} className={clsx('size-2 rounded-full', i < left ? 'bg-accent shadow-[0_0_8px_rgba(184,255,60,0.8)]' : 'bg-white/12')} />)}
        <span className="ml-1 font-semibold">{left}/{max}</span>
      </div>
      <div className={clsx('grid gap-2.5', items.length > 3 ? 'grid-cols-4' : 'grid-cols-3')}>
        {items.map((it) => (
          <button
            key={it.icon} onClick={it.on}
            className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/5 hover:bg-white/9 border border-line hover:border-accent/40 px-1.5 py-3 min-h-[76px] text-[12px] leading-tight font-semibold text-center cursor-pointer transition-colors"
          >
            <Icon name={it.icon} size={20} className="text-accent shrink-0" />
            <span className="line-clamp-2">{it.label}</span>
            {it.badge && <span className="absolute top-2 right-2 size-2 rounded-full bg-danger animate-nss-pulse" />}
          </button>
        ))}
      </div>
    </div>
  );
}
