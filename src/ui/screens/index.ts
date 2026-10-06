import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteName } from '../router';

type ScreenComponent = ComponentType<{ params: Record<string, string> }>;

/** Route → screen component (code-split). Owner: orchestrator (do not edit; add screens via the contract). */
export const SCREENS: Record<RouteName, LazyExoticComponent<ScreenComponent>> = {
  title: lazy(() => import('./TitleScreen')),
  'new-career': lazy(() => import('./NewCareerScreen')),
  hub: lazy(() => import('./HubScreen')),
  settings: lazy(() => import('./SettingsScreen')),
  inbox: lazy(() => import('./InboxScreen')),
  press: lazy(() => import('./PressScreen')),
  training: lazy(() => import('./TrainingScreen')),
  lifestyle: lazy(() => import('./LifestyleScreen')),
  people: lazy(() => import('./PeopleScreen')),
  transfers: lazy(() => import('./TransfersScreen')),
  competitions: lazy(() => import('./CompetitionsScreen')),
  news: lazy(() => import('./NewsScreen')),
  social: lazy(() => import('./SocialScreen')),
  career: lazy(() => import('./CareerScreen')),
  club: lazy(() => import('./ClubScreen')),
  legacy: lazy(() => import('./LegacyScreen')),
  match: lazy(() => import('./match/MatchScreen')),
  drill: lazy(() => import('./match/DrillScreen')),
};

/** Routes rendered full-bleed without the navigation layout. */
export const FULLSCREEN: RouteName[] = ['title', 'new-career', 'match', 'drill', 'legacy'];
