/** Top status strip: club + date, money, energy / morale / fame, weekly actions as dots. */
import { Coins, Smile, Star, Zap } from 'lucide-react';
import type { GameState } from '../../../core/types';
import { getLang } from '../../../core/i18n';
import { t } from '../../../core/i18n';
import type { Agenda } from '../../../game/api';
import { navigate } from '../../router';
import { CountUp, Crest, Meter, clsx } from '../../components/kit';
import { DEFAULT_KIT, formatDate, money, userView } from './helpers';

function Mini({ icon, value, label, tone, onClick }: { icon: React.ReactNode; value: number; label: string; tone: 'auto'; onClick?: () => void }) {
  return (
    <button onClick={onClick} title={`${label}: ${Math.round(value)}`} className="flex items-center gap-1.5 w-[52px] sm:w-[84px] cursor-pointer">
      <span className="text-ink-dim shrink-0">{icon}</span>
      <Meter value={value} tone={tone} showValue={false} size="sm" />
    </button>
  );
}

export default function StatusStrip({ state, agenda }: { state: GameState; agenda: Agenda | null }) {
  const v = userView(state);
  const lang = getLang();
  const club = v?.club ?? null;
  const week = agenda?.week;
  const label = week ? week.label[lang] ?? week.label.en : `${t('common.week')} ${state.week + 1}`;
  const date = formatDate(week?.date);
  const actions = state.career.actionsLeft;
  const maxActions = Math.max(3, actions);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 h-14 flex items-center gap-2 sm:gap-4">
        <button onClick={() => navigate('club')} className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer">
          <Crest kit={club?.kit ?? DEFAULT_KIT} label={club?.shortName} size={28} />
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold truncate">{club?.name ?? t('shell.status.noClub')}</div>
            <div className="text-[11px] text-ink-dim truncate">
              <span className="font-semibold text-ink/80">{label}</span>
              {date && <span className="hidden sm:inline"> · {date}</span>}
              <span className="hidden sm:inline"> · {state.season}/{String((state.season + 1) % 100).padStart(2, '0')}</span>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('career')}
          className="flex items-center gap-1.5 rounded-xl bg-gold/10 border border-gold/25 px-2.5 h-9 text-gold font-display text-xl leading-none cursor-pointer shrink-0"
          title={t('common.money')}
        >
          <Coins size={15} className="shrink-0" />
          <span className="tabular-nums pt-0.5"><CountUp value={state.career.money} format={money} /></span>
        </button>

        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
            <Mini icon={<Zap size={13} />} value={state.career.energy} label={t('common.energy')} tone="auto" onClick={() => navigate('lifestyle')} />
            <Mini icon={<Smile size={13} />} value={v?.player.morale ?? 50} label={t('common.morale')} tone="auto" onClick={() => navigate('people')} />
          </div>
          <div className="hidden sm:flex items-center gap-1 text-sm font-bold text-gold tabular-nums" title={t('common.fame')}>
            <Star size={14} />{Math.round(state.career.fame)}
          </div>
          <div className="flex items-center gap-1" title={t('shell.status.actions', { n: actions })}>
            {Array.from({ length: maxActions }, (_, i) => (
              <span key={i} className={clsx('size-2 rounded-full transition-colors', i < actions ? 'bg-accent shadow-[0_0_8px_rgba(184,255,60,0.8)]' : 'bg-white/12')} />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
