import {
  ArrowLeftRight, AtSign, Building2, Dumbbell, Gem, House, IdCard, Inbox, Newspaper, Settings, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import type { RouteName } from '../../router';

export interface NavItem { route: RouteName; icon: LucideIcon; label: string }

/** The essentials: always visible in the sidebar. */
export const NAV_MAIN: NavItem[] = [
  { route: 'hub', icon: House, label: 'shell.nav.hub' },
  { route: 'inbox', icon: Inbox, label: 'shell.nav.inbox' },
  { route: 'training', icon: Dumbbell, label: 'shell.nav.training' },
  { route: 'transfers', icon: ArrowLeftRight, label: 'shell.nav.transfers' },
  { route: 'competitions', icon: Trophy, label: 'shell.nav.competitions' },
  { route: 'career', icon: IdCard, label: 'shell.nav.career' },
  { route: 'people', icon: Users, label: 'shell.nav.people' },
];

/** The "Daha fazla" group: everything that is not needed every week. */
export const NAV_MORE: NavItem[] = [
  { route: 'lifestyle', icon: Gem, label: 'shell.nav.lifestyle' },
  { route: 'news', icon: Newspaper, label: 'shell.nav.news' },
  { route: 'social', icon: AtSign, label: 'shell.nav.social' },
  { route: 'club', icon: Building2, label: 'shell.nav.club' },
  { route: 'settings', icon: Settings, label: 'shell.nav.settings' },
];

export const NAV: NavItem[] = [...NAV_MAIN, ...NAV_MORE];

/** Tabs pinned in the mobile bottom bar; everything else lives under "Daha fazla". */
export const PRIMARY_MOBILE: RouteName[] = ['hub', 'inbox', 'training', 'people'];
export const NAV_BY_ROUTE = Object.fromEntries(NAV.map((n) => [n.route, n])) as Record<string, NavItem>;
