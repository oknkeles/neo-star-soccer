/** Top status strip, kept minimal: club + date, money, energy. */
import { Coins, Zap } from 'lucide-react';
import type { GameState } from '../../../core/types';
import { getLang } from '../../../core/i18n';
import { t } from '../../../core/i18n';
import type { Agenda } from '../../../game/api';
import { navigate } from '../../router';
import { CountUp, Crest, Meter } from '../../components/kit';
import { DEFAULT_KIT, formatDate, money, userView } from './helpers';

export default function StatusStrip({ state, agenda }: { state: GameState; agenda: Agenda | null }) {
  const v = userView(state);
  const lang = getLang();
  const club = v?.club ?? null;
  const week = agenda?.week;
  const label = week ? week.label[lang] ?? week.label.en : `${t('common.week')} ${state.week + 1}`;
  const date = formatDate(week?.date);

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

        <button onClick={() => navigate('lifestyle')} title={`${t('common.energy')}: ${Math.round(state.career.energy)}`} className="flex items-center gap-1.5 w-[64px] sm:w-[92px] shrink-0 cursor-pointer">
          <Zap size={14} className="text-ink-dim shrink-0" />
          <Meter value={state.career.energy} tone="auto" showValue={false} size="sm" />
        </button>
      </div>
    </header>
  );
}
