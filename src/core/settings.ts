import type { AIFeature, Settings } from './types';
import { setLang } from './i18n';

/**
 * Global (non-save) settings, persisted in localStorage of this browser only.
 * The Claude API key also lives here: it never leaves the browser except in the
 * request to api.anthropic.com.
 */
const KEY = 'nss.settings.v1';
/** Bump to migrate stored settings once (see load()). */
const VERSION = 2;

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
] as const;

const ALL_FEATURES: AIFeature[] = ['genesis', 'news', 'social', 'press', 'negotiation', 'events', 'chat', 'biography'];

export function defaultSettings(): Settings {
  return {
    lang: 'tr',
    ai: {
      enabled: false,
      apiKey: '',
      model: 'claude-opus-5-5',
      features: Object.fromEntries(ALL_FEATURES.map((f) => [f, true])) as Record<AIFeature, boolean>,
    },
    graphics: { quality: 'medium', shadows: true },
    audio: { master: 0.8, sfx: 0.9, crowd: 0.7, muted: false },
    camera: 'behind',
    difficulty: 'easy',
    slowmoAim: false,
    matchSpeed: 2,
    matchView: '3d',
    version: VERSION,
  };
}

let settings: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  const base = defaultSettings();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.matchView === undefined) {
      // settings saved before the 2D view: move the old defaults to the new, easier ones once
      if (parsed.difficulty === 'normal') parsed.difficulty = 'easy';
      parsed.slowmoAim = false;
    }
    if ((parsed.version ?? 0) < 2) {
      // v2: back to the 3D view by default (2D stays selectable), smoother defaults, brisker ticker
      if (parsed.matchView === '2d' || parsed.matchView === undefined) parsed.matchView = '3d';
      if (parsed.graphics?.quality === 'high') parsed.graphics = { ...parsed.graphics, quality: 'medium' };
      if (parsed.matchSpeed === undefined || parsed.matchSpeed === 1) parsed.matchSpeed = 2;
      parsed.slowmoAim = false;
    }
    parsed.version = VERSION;
    return {
      ...base,
      ...parsed,
      ai: { ...base.ai, ...parsed.ai, features: { ...base.ai.features, ...parsed.ai?.features } },
      graphics: { ...base.graphics, ...parsed.graphics },
      audio: { ...base.audio, ...parsed.audio },
    };
  } catch {
    return base;
  }
}

export function getSettings(): Settings {
  return settings;
}

export function updateSettings(patch: (s: Settings) => Settings | void): Settings {
  const draft = structuredClone(settings);
  const next = patch(draft) ?? draft;
  settings = next;
  setLang(settings.lang);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode) — keep in memory */
  }
  listeners.forEach((fn) => fn(settings));
  return settings;
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the given AI feature should call Claude (key present + enabled). */
export function aiEnabled(feature: AIFeature): boolean {
  const ai = settings.ai;
  return ai.enabled && ai.apiKey.trim().length > 10 && ai.features[feature];
}

setLang(settings.lang);
