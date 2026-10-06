import {
  ArrowLeftRight, AtSign, Building2, Dumbbell, Gem, House, IdCard, Inbox, Newspaper, Settings, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import type { RouteName } from '../../router';

export interface NavItem { route: RouteName; icon: LucideIcon; label: string }

export const NAV: NavItem[] = [
  { route: 'hub', icon: House, label: 'shell.nav.hub' },
  { route: 'inbox', icon: Inbox, label: 'shell.nav.inbox' },
  { route: 'training', icon: Dumbbell, label: 'shell.nav.training' },
  { route: 'lifestyle', icon: Gem, label: 'shell.nav.lifestyle' },
  { route: 'people', icon: Users, label: 'shell.nav.people' },
  { route: 'transfers', icon: ArrowLeftRight, label: 'shell.nav.transfers' },
  { route: 'competitions', icon: Trophy, label: 'shell.nav.competitions' },
  { route: 'news', icon: Newspaper, label: 'shell.nav.news' },
  { route: 'social', icon: AtSign, label: 'shell.nav.social' },
  { route: 'career', icon: IdCard, label: 'shell.nav.career' },
  { route: 'club', icon: Building2, label: 'shell.nav.club' },
  { route: 'settings', icon: Settings, label: 'shell.nav.settings' },
];

/** Tabs pinned in the mobile bottom bar; everything else lives under "More". */
export const PRIMARY_MOBILE: RouteName[] = ['hub', 'inbox', 'training', 'lifestyle'];
export const NAV_BY_ROUTE = Object.fromEntries(NAV.map((n) => [n.route, n])) as Record<string, NavItem>;
