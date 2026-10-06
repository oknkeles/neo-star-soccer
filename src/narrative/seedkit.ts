/** Builds structured news seeds (see news.ts) whose lede is already written in the player's language. */
import type { NewsSeed } from '../core/narrative-types';
import type { Lang } from '../core/types';
import type { Rng } from '../core/rng';
import { encodeFacts, fill, type Loc, type Slots } from './grammar';

export interface SeedOpts {
  importance?: number;
  tags?: string[];
  aboutUser?: boolean;
  /** Extra slots used to write the lede but not stored in the seed (player, club …). */
  base?: Slots;
}

/** `key` selects a headline bank from the news data; `say` is the factual lede in `lang`. */
export function mkSeed(
  kind: NewsSeed['kind'], key: string, slots: Slots, say: Loc, lang: Lang, rng: Rng, opts: SeedOpts = {},
): NewsSeed {
  const lede = fill(say[lang] || say.en, { ...(opts.base ?? {}), ...slots }, rng, lang);
  const flat: Record<string, string | number | null | undefined> = { k: key, say: lede };
  for (const [k, v] of Object.entries(slots)) flat[k] = v;
  return {
    kind,
    facts: encodeFacts(flat),
    aboutUser: opts.aboutUser ?? false,
    importance: Math.max(0, Math.min(1, opts.importance ?? 0.4)),
    tags: opts.tags ?? [],
  };
}
