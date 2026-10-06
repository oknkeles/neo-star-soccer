import { useSyncExternalStore } from 'react';

/** All screens. Each maps to a file in src/ui/screens (see screens/index.ts). */
export type RouteName =
  | 'title' | 'new-career' | 'hub' | 'settings' | 'inbox' | 'press'
  | 'training' | 'lifestyle' | 'people' | 'transfers' | 'competitions' | 'news' | 'social'
  | 'career' | 'club' | 'legacy' | 'match' | 'drill';

export interface Route { name: RouteName; params: Record<string, string> }

let current: Route = { name: 'title', params: {} };
const stack: Route[] = [];
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function navigate(name: RouteName, params: Record<string, string> = {}): void {
  stack.push(current);
  if (stack.length > 30) stack.shift();
  current = { name, params };
  emit();
  if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

/** Replace without history (e.g. after finishing a match). */
export function replace(name: RouteName, params: Record<string, string> = {}): void {
  current = { name, params };
  emit();
}

export function back(fallback: RouteName = 'hub'): void {
  current = stack.pop() ?? { name: fallback, params: {} };
  emit();
}

export function getRoute(): Route { return current; }

export function useRoute(): Route {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getRoute, getRoute);
}
