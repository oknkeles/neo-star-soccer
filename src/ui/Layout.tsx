/**
 * App chrome for in-career screens: sidebar (desktop) / bottom bar (mobile) navigation,
 * top status strip (date, money, energy, fame, inbox badge). Owner: ui-shell agent.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Ellipsis, LogOut, Save } from 'lucide-react';
import { t } from '../core/i18n';
import { game, useGame } from '../game/api';
import { navigate, useRoute, type RouteName } from './router';
import Avatar from './components/Avatar';
import { clsx, toast } from './components/kit';
import StatusStrip from './screens/shell/StatusStrip';
import { DEFAULT_KIT, errText, posShort, useAgenda, useLang, userView } from './screens/shell/helpers';
import { NAV, PRIMARY_MOBILE, type NavItem } from './screens/shell/nav';
import './screens/shell/strings';

function badgeFor(route: RouteName, unread: number, events: number): number {
  if (route === 'inbox') return unread;
  if (route === 'hub') return events;
  return 0;
}

function SideItem({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  const Ico = item.icon;
  return (
    <button
      onClick={() => navigate(item.route)}
      className={clsx(
        'relative flex items-center gap-3 h-10 px-3 rounded-xl text-sm font-semibold cursor-pointer transition-colors text-left',
        active ? 'text-bg' : 'text-ink-dim hover:text-ink hover:bg-white/5',
      )}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-accent shadow-[0_0_24px_-8px_rgba(184,255,60,0.9)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <Ico size={18} className="relative shrink-0" />
      <span className="relative flex-1 truncate">{t(item.label)}</span>
      {badge > 0 && (
        <span className={clsx('relative min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center', active ? 'bg-bg text-accent' : 'bg-danger text-white')}>{badge}</span>
      )}
    </button>
  );
}

function TabItem({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  const Ico = item.icon;
  return (
    <button onClick={() => navigate(item.route)} className="relative flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer">
      <span className={clsx('relative grid place-items-center h-7 w-12 rounded-full transition-colors', active ? 'bg-accent text-bg' : 'text-ink-dim')}>
        <Ico size={19} />
        {badge > 0 && <span className="absolute -top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">{badge}</span>}
      </span>
      <span className={clsx('text-[10px] font-semibold leading-none', active ? 'text-accent' : 'text-ink-mute')}>{t(item.label)}</span>
    </button>
  );
}

function MoreSheet({ open, onClose, route, unread }: { open: boolean; onClose: () => void; route: RouteName; unread: number }) {
  const rest = NAV.filter((n) => !PRIMARY_MOBILE.includes(n.route));
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-bg-2 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+84px)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
            <div className="grid grid-cols-4 gap-2">
              {rest.map((n) => {
                const Ico = n.icon;
                const active = route === n.route;
                return (
                  <button
                    key={n.route}
                    onClick={() => { onClose(); navigate(n.route); }}
                    className={clsx('relative flex flex-col items-center gap-1.5 rounded-2xl py-3 cursor-pointer border', active ? 'bg-accent text-bg border-accent' : 'bg-white/4 border-line text-ink')}
                  >
                    <Ico size={22} />
                    <span className="text-[11px] font-semibold leading-none">{t(n.label)}</span>
                    {n.route === 'inbox' && unread > 0 && <span className="absolute top-1.5 right-2 size-2 rounded-full bg-danger" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const lang = useLang();
  const route = useRoute();
  const { state } = useGame();
  const agenda = useAgenda();
  const [more, setMore] = useState(false);
  useEffect(() => { setMore(false); }, [route.name]);
  const v = userView(state);
  const unread = agenda?.unread ?? 0;
  const events = agenda?.pendingEvents.filter((e) => e.choices.length > 0).length ?? 0;

  const saveNow = async () => {
    try {
      await game.save();
      toast(t('shell.nav.saved'), 'accent', 'check');
    } catch (e) {
      toast(`${t('shell.nav.saveFail')}: ${errText(e)}`, 'danger', 'shield_alert');
    }
  };
  const mainMenu = async () => {
    try { await game.save(); } catch { /* quitting anyway */ }
    game.quit();
    navigate('title');
  };

  // Without a running career there is no chrome — just the screen (it shows its own empty state).
  if (!state) return <div key={lang} className="min-h-full max-w-6xl mx-auto px-4 py-6">{children}</div>;

  const moreActive = !PRIMARY_MOBILE.includes(route.name) && NAV.some((n) => n.route === route.name);

  return (
    <div key={lang} className="min-h-full flex">
      <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-dvh border-r border-line bg-bg-2/60 backdrop-blur p-4 gap-1">
        <button onClick={() => navigate('hub')} className="flex items-center gap-2.5 px-2 pb-4 pt-1 cursor-pointer text-left">
          <span className="grid place-items-center size-10 rounded-xl bg-accent text-bg font-display text-2xl leading-none shadow-[0_0_24px_-6px_rgba(184,255,60,0.8)]">N</span>
          <span className="font-display text-2xl leading-[0.9] tracking-wide">NEO STAR<br /><span className="text-accent">SOCCER</span></span>
        </button>
        <nav className="flex flex-col gap-0.5 overflow-y-auto -mx-1 px-1">
          {NAV.map((n) => <SideItem key={n.route} item={n} active={route.name === n.route} badge={badgeFor(n.route, unread, events)} />)}
        </nav>
        <div className="mt-auto pt-3 border-t border-line flex flex-col gap-2">
          {v && (
            <button onClick={() => navigate('career')} className="flex items-center gap-2.5 rounded-xl p-2 hover:bg-white/5 cursor-pointer text-left">
              <Avatar appearance={v.player.appearance} kit={v.club?.kit ?? DEFAULT_KIT} size={38} mood="neutral" />
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-bold truncate">{v.player.nickname || `${v.player.firstName} ${v.player.lastName}`}</span>
                <span className="block text-[11px] text-ink-dim">{posShort(v.player.position)} · {state.season - v.player.birthYear} {t('common.age').toLowerCase()}</span>
              </span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={saveNow} className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-ink-dim hover:text-ink cursor-pointer"><Save size={14} />{t('shell.nav.save')}</button>
            <button onClick={mainMenu} className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-ink-dim hover:text-ink cursor-pointer"><LogOut size={14} />{t('shell.nav.mainMenu')}</button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <StatusStrip state={state} agenda={agenda} />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-5 pt-5 pb-28 lg:pb-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route.name}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] grid grid-cols-5 border-t border-line bg-bg/92 backdrop-blur-lg">
        {PRIMARY_MOBILE.map((r) => {
          const item = NAV.find((n) => n.route === r)!;
          return <TabItem key={r} item={item} active={route.name === r} badge={badgeFor(r, unread, events)} />;
        })}
        <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer">
          <span className={clsx('grid place-items-center h-7 w-12 rounded-full transition-colors', moreActive ? 'bg-accent text-bg' : 'text-ink-dim')}><Ellipsis size={20} /></span>
          <span className={clsx('text-[10px] font-semibold leading-none', moreActive ? 'text-accent' : 'text-ink-mute')}>{t('shell.nav.more')}</span>
        </button>
      </nav>
      <MoreSheet open={more} onClose={() => setMore(false)} route={route.name} unread={unread} />
    </div>
  );
}
