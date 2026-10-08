/**
 * GameController implementation — orchestrates every module through its api.ts, owns
 * persistence and the external store used by React. See ./api.ts for the public surface.
 */
import type {
  ContractTerms, Effects, Fixture, Footballer, GameEvent, GameState, InboxMessage, MatchContext, MatchSummary,
  MomentType, NewsArticle, PersonRole, RelKey, SocialPost, SponsorDeal, TrainingFocus, TransferOffer, WeekReport,
} from '../core/types';
import type {
  NarrativeContext, NegotiationReply, NewsSeed, PersonaKind, PressEvaluation, PressOccasion, PressQuestion, SocialTrigger,
} from '../core/narrative-types';
import { Rng, freshSeed } from '../core/rng';
import { absWeek, age, clamp, cloneJson, formatMoney, fullName, nextId } from '../core/util';
import { t } from '../core/i18n';
import { aiEnabled, getSettings, onSettingsChange } from '../core/settings';
import { overall } from '../core/ratings';
import * as worldApi from '../world/api';
import * as comp from '../competition/api';
import * as career from '../career/api';
import * as narrative from '../narrative/api';
import { LiveMatch } from '../match/flow/api';
import type { Agenda, NewCareerOptions, PressSession, SaveMeta } from './api';
import { autoStorage, type SaveStorage } from './storage';
import {
  CAPS, INDEX_KEY, SAVE_SCHEMA, SAVE_SLOTS, SPONSOR_FLAG, SaveError, enforceCaps, envelope, isSaveMeta, makeMeta,
  parseSave, parseSaveJson, saveKey, trimForSave,
} from './persist';
import {
  type NarratorSource, articlesFromSeeds, callNarrator, defaultOutlet, fallbackEvaluation, fallbackQuestions, isEvaluation, isNegotiationReply,
  isQuestionList, narrativeContext, sanitizeDynamicEvent, sanitizeEffectsSafe, sanitizePosts, validTerms,
} from './narration';
import {
  FLAG, computeAgenda, compName, markUserPlayed, needsClub, pendingEvents, teamName, userPlayedIds, userSide, userTeamIds,
} from './agenda';
import {
  SEED_FLAVORS, START_SEASON, buildGenesis, chooseHometown, chooseRival, createUserFootballer, fallbackGenesis, isGenesis,
  startingRelationships,
} from './genesis';
import './strings';

export type NoticeKind =
  | 'goal' | 'callup' | 'offer' | 'sponsor' | 'award' | 'trophy' | 'season' | 'transfer' | 'event' | 'info' | 'retire' | 'injury' | 'milestone';
export type NoticeTone = 'accent' | 'gold' | 'danger' | 'info' | 'violet' | 'neutral';
/** Toast-worthy things that happened (UI subscribes via `game.onNotice`). */
export interface GameNotice { kind: NoticeKind; text: string; icon: string; tone: NoticeTone }

export class GameBlockedError extends Error {
  constructor(public blockers: string[]) {
    super(blockers[0] ?? t('game.err.blocked'));
    this.name = 'GameBlockedError';
  }
}

export interface GameControllerOptions {
  /** Save backend (default: IndexedDB with in-memory fallback). */
  storage?: SaveStorage;
  /** Autosave debounce in ms after a commit; 0 disables autosave. */
  autosaveMs?: number;
}

export const MAX_PENDING_EVENTS = 3;
const MILESTONE_GOALS = [1, 10, 25, 50, 100, 150, 200, 250, 300, 400, 500];
const PERSONA_REL: Partial<Record<PersonaKind, RelKey>> = { agent: 'agent', manager: 'manager', mentor: 'teammates', partner: 'partner', family: 'family' };

const deepClone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : cloneJson(v));

function restoreInPlace(target: GameState, snap: GameState): void {
  for (const k of Object.keys(target)) if (!(k in snap)) delete (target as unknown as Record<string, unknown>)[k];
  Object.assign(target, snap);
}

function safe<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    console.warn(`[game] ${label} failed`, e);
    return undefined;
  }
}

function aiOn(feature: Parameters<typeof aiEnabled>[0]): boolean {
  try { return aiEnabled(feature); } catch { return false; }
}

const PRESS_LIMITS = { rel: 8, fame: 4, morale: 6 };
function clampPressEffects(e: Effects): Effects {
  const out: Effects = { ...e };
  if (out.fame !== undefined) out.fame = clamp(out.fame, -PRESS_LIMITS.fame, PRESS_LIMITS.fame);
  if (out.morale !== undefined) out.morale = clamp(out.morale, -PRESS_LIMITS.morale, PRESS_LIMITS.morale);
  if (out.rel) out.rel = Object.fromEntries(Object.entries(out.rel).map(([k, v]) => [k, clamp(v ?? 0, -PRESS_LIMITS.rel, PRESS_LIMITS.rel)]));
  delete out.money; delete out.injuryWeeks; delete out.flags; delete out.xp;
  return out;
}

function postTone(text: string): string {
  const s = text.toLocaleLowerCase('tr');
  if (/(teşekkür|sağ ?olun|thank|grateful|minnettar)/.test(s)) return 'grateful';
  if (/(hakem|referee|eleştir|critic|haters|kıskan|jealous|susun|shut up)/.test(s)) return 'defiant';
  if ((text.match(/!/g)?.length ?? 0) >= 2 || /(hadi|come on|let'?s go|vamos)/.test(s)) return 'excited';
  if (/(üzgün|sorry|özür|kötü|bad day|zor)/.test(s)) return 'sad';
  if (text.includes('?')) return 'curious';
  return 'casual';
}

function handleOf(p: Footballer): string {
  const base = (p.nickname ?? `${p.firstName}${p.lastName}`)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/[^A-Za-z0-9]/g, '');
  return `@${base.slice(0, 18) || 'player'}`;
}

interface WeekPlan {
  report: WeekReport;
  seeds: NewsSeed[];
  wantDynamic: boolean;
  socialCount: number;
}

export class GameController {
  state: GameState | null = null;
  version = 0;
  /** Save slot (0-based) of the running career; null until saved. */
  slot: number | null = null;
  /** The live match started by `startMatch` (cleared by `finishMatch`). */
  activeMatch: { fixtureId: string; ctx: MatchContext; live: LiveMatch } | null = null;
  /** True while the sporting director is "typing" (narrator call in flight). */
  negotiationBusy = false;
  /** True while `advanceWeek` runs. */
  advancing = false;

  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: GameNotice) => void>();
  private noticeBuffer: GameNotice[] | null = null;
  private storage: SaveStorage;
  private autosaveMs: number;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saveChain: Promise<void> = Promise.resolve();
  private presses = new Map<string, PressSession>();
  private bg = new Set<Promise<void>>();
  private advanceJob: Promise<WeekReport> | null = null;
  private snap: { state: GameState | null; version: number } = { state: null, version: -1 };
  private seq = 0;

  constructor(opts: GameControllerOptions = {}) {
    this.storage = opts.storage ?? autoStorage();
    this.autosaveMs = opts.autosaveMs ?? 1500;
    onSettingsChange((s) => {
      if (this.state && this.state.lang !== s.lang) {
        this.state.lang = s.lang;
        this.commit();
      }
    });
  }

  /** Swap storage / autosave delay (tests, or a future cloud backend). */
  configure(opts: GameControllerOptions): void {
    if (opts.storage) this.storage = opts.storage;
    if (opts.autosaveMs !== undefined) this.autosaveMs = opts.autosaveMs;
  }

  // ───────────────────────── store ─────────────────────────

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  getVersion(): number { return this.version; }

  /** Stable `{ state, version }` per version — the useSyncExternalStore snapshot. */
  getSnapshot(): { state: GameState | null; version: number } {
    if (this.snap.version !== this.version || this.snap.state !== this.state) this.snap = { state: this.state, version: this.version };
    return this.snap;
  }

  /** Bump version, notify, schedule autosave. */
  commit(): void { this.bump(true); }

  private bump(persist: boolean): void {
    this.version++;
    if (persist) this.dirty = true;
    for (const fn of [...this.listeners]) {
      try { fn(); } catch (e) { console.error('[game] listener failed', e); }
    }
    if (persist) this.scheduleAutosave();
  }

  /** Toast-worthy notifications (offers, call-ups, goals reached, trophies …). */
  onNotice(fn: (n: GameNotice) => void): () => void {
    this.noticeListeners.add(fn);
    return () => { this.noticeListeners.delete(fn); };
  }

  private notify(kind: NoticeKind, text: string, icon: string, tone: NoticeTone = 'accent'): void {
    const n: GameNotice = { kind, text, icon, tone };
    if (this.noticeBuffer) { this.noticeBuffer.push(n); return; }
    for (const fn of [...this.noticeListeners]) {
      try { fn(n); } catch (e) { console.error(e); }
    }
  }

  private requireState(): GameState {
    if (!this.state) throw new Error(t('game.err.noState'));
    return this.state;
  }

  /** Fire-and-forget narration (news/social); tracked so tests can `await whenIdle()`. */
  private background(task: () => Promise<unknown>): void {
    const p: Promise<void> = task()
      .then(() => undefined, (e) => console.warn('[game] background task failed', e))
      .finally(() => { this.bg.delete(p); });
    this.bg.add(p);
  }

  /** Resolves once background narration and pending saves have settled. */
  async whenIdle(): Promise<void> {
    while (this.bg.size) await Promise.allSettled([...this.bg]);
    await this.saveChain;
  }

  /** Run `fn`; if it throws, restore the state exactly as before and rethrow. */
  private transact<T>(s: GameState, fn: () => T): T {
    const snapshot = deepClone(s);
    try {
      return fn();
    } catch (e) {
      restoreInPlace(s, snapshot);
      throw e;
    }
  }

  private resetSession(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.presses.clear();
    this.activeMatch = null;
    this.negotiationBusy = false;
  }

  // ───────────────────────── saves ─────────────────────────

  private scheduleAutosave(): void {
    if (!this.state || this.slot === null || this.autosaveMs <= 0) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.save().catch((e) => console.warn('[game] autosave failed', e));
    }, this.autosaveMs);
  }

  private async readIndex(): Promise<SaveMeta[]> {
    try {
      const raw = await this.storage.get<unknown>(INDEX_KEY);
      if (Array.isArray(raw)) return raw.filter(isSaveMeta);
    } catch (e) {
      console.warn('[game] save index unreadable', e);
    }
    const out: SaveMeta[] = [];
    for (const slot of SAVE_SLOTS) {
      try {
        const raw = await this.storage.get<unknown>(saveKey(slot));
        if (raw) out.push(makeMeta(typeof raw === 'string' ? parseSaveJson(raw) : parseSave(raw), slot));
      } catch { /* corrupt slot: not listed */ }
    }
    return out;
  }

  private async writeSlot(slot: number, json: string, meta: SaveMeta): Promise<void> {
    await this.storage.set(saveKey(slot), json);
    const index = (await this.readIndex()).filter((m) => m.slot !== slot);
    index.push(meta);
    index.sort((a, b) => a.slot - b.slot);
    await this.storage.set(INDEX_KEY, index);
  }

  private queueWrite(slot: number, state: GameState): Promise<void> {
    // Serialize synchronously so the stored copy is exactly this moment's state.
    const json = JSON.stringify(envelope(trimForSave(state)));
    const meta = makeMeta(state, slot);
    const job = this.saveChain.then(() => this.writeSlot(slot, json, meta));
    this.saveChain = job.catch(() => undefined);
    return job;
  }

  async listSaves(): Promise<SaveMeta[]> {
    return (await this.readIndex()).sort((a, b) => a.slot - b.slot);
  }

  async save(): Promise<void> {
    const s = this.state;
    const slot = this.slot;
    if (!s || slot === null) return;
    if (this.autosaveTimer) { clearTimeout(this.autosaveTimer); this.autosaveTimer = null; }
    if (this.advancing) { this.dirty = true; return; } // never persist a half-advanced week; commit() reschedules
    s.savedAt = Date.now();
    this.dirty = false;
    await this.queueWrite(slot, s);
  }

  async load(slot: number): Promise<void> {
    if (this.state && this.dirty && this.slot !== null) await this.save().catch(() => undefined);
    const raw = await this.storage.get<unknown>(saveKey(slot));
    if (raw === undefined || raw === null) throw new SaveError('missing');
    const state = typeof raw === 'string' ? parseSaveJson(raw) : parseSave(raw);
    state.lang = getSettings().lang;
    this.resetSession();
    this.state = state;
    this.slot = slot;
    this.dirty = false;
    this.bump(false);
  }

  /** Load the most recently saved slot. Returns false when there is none. */
  async continueLatest(): Promise<boolean> {
    const metas = await this.listSaves();
    if (!metas.length) return false;
    const latest = metas.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
    await this.load(latest.slot);
    return true;
  }

  async deleteSave(slot: number): Promise<void> {
    await this.saveChain;
    await this.storage.del(saveKey(slot));
    const index = (await this.readIndex()).filter((m) => m.slot !== slot);
    await this.storage.set(INDEX_KEY, index);
    if (this.slot === slot) {
      this.slot = null;
      if (this.autosaveTimer) { clearTimeout(this.autosaveTimer); this.autosaveTimer = null; }
    }
  }

  exportSave(): string {
    const s = this.requireState();
    s.savedAt = Date.now();
    return JSON.stringify(envelope(trimForSave(s)));
  }

  /**
   * Validate + migrate an exported save and store it in `slot`. It also becomes the running
   * career when nothing is loaded or when it overwrites the running career's slot.
   */
  async importSave(json: string, slot: number): Promise<void> {
    const state = parseSaveJson(json);
    state.schema = SAVE_SCHEMA;
    state.savedAt = Date.now();
    await this.queueWrite(slot, state);
    if (!this.state || this.slot === slot) {
      state.lang = getSettings().lang;
      this.resetSession();
      this.state = state;
      this.slot = slot;
      this.dirty = false;
      this.bump(false);
    }
  }

  quit(): void {
    if (this.state && this.dirty && this.slot !== null && !this.advancing) void this.save().catch(() => undefined);
    this.resetSession();
    this.state = null;
    this.slot = null;
    this.dirty = false;
    this.bump(false);
  }

  // ───────────────────────── new career ─────────────────────────

  async newCareer(opts: NewCareerOptions, slot: number): Promise<void> {
    const seed = (opts.seed ?? freshSeed()) >>> 0;
    const rng = new Rng(seed);
    const season = START_SEASON;
    const lang = getSettings().lang;
    const world = worldApi.generateWorld(rng, { startSeason: season, userNation: opts.nation });

    const now = Date.now();
    const s: GameState = {
      schema: SAVE_SCHEMA, id: `career-${seed.toString(36)}-${now.toString(36)}`, createdAt: now, savedAt: now, seed,
      rng: rng.state(), lang, season, week: 0, world, competitions: {},
      career: undefined as unknown as GameState['career'],
      inbox: [], news: [], social: [], events: [], offers: [], negotiation: null, storylines: [], seasons: [], flags: {},
      idCounter: 1, chats: {},
    };

    const user = createUserFootballer(rng, world, opts, season);
    const startClubs = worldApi.pickStartingClubs(world, rng, opts.nation).filter((id) => !!world.clubs[id]);
    const rival = chooseRival(rng, s, user.position, startClubs);
    const hometown = chooseHometown(rng, world, opts.nation);
    const traits = user.traits;
    const followerBoost = traits.includes('showman') || traits.includes('media_darling') ? 1.8 : 1;

    s.career = {
      playerId: user.id,
      money: rng.int(20, 50) * 100,
      fame: rng.int(2, 6),
      followers: Math.round(rng.float(300, 3000) * followerBoost),
      energy: 100,
      relationships: startingRelationships(traits),
      people: [],
      partnerId: null,
      rivalId: rival.id,
      mentorId: null,
      inventory: [],
      sponsors: [],
      xp: {},
      trainingFocus: 'balanced',
      actionsLeft: career.ACTIONS_PER_WEEK,
      trophies: [],
      awards: [],
      history: [],
      matches: [],
      genesis: {
        hometown: hometown.city, hometownClubId: hometown.clubId, backstory: '', motto: '', dream: '', theme: '', destinyHint: '',
        family: [], agent: { id: 'PER-0', name: '', role: 'agent', personality: '', bio: '', relationship: 60 },
        rivalBlurb: '', mentorBlurb: '', goals: [], ai: false,
      },
      setPieces: { freeKicks: traits.includes('set_piece_specialist'), penalties: traits.includes('clinical'), corners: traits.includes('set_piece_specialist') },
      transferListed: false,
      nationalTeamId: null,
      calledUp: false,
      retired: false,
      hallOfFame: 0,
    };

    // Trial invitations from the starting clubs.
    const trials = career.trialOffers(s, startClubs);
    for (const o of trials) if (!s.offers.some((x) => x.id === o.id)) s.offers.push(o);
    s.competitions = comp.createSeasonCompetitions(s, rng);

    // Genesis: Claude (when enabled) or templates; never fails.
    const nationName = safe('nation', () => worldApi.getNation(opts.nation).name[lang]) ?? opts.nation;
    const positionName = safe('positionName', () => worldApi.positionName(opts.position)) ?? opts.position;
    const trialClubs = s.offers.filter((o) => o.kind === 'trial').map((o) => world.clubs[o.fromClubId]).filter(Boolean);
    const headline = [...trialClubs].sort((a, b) => b.reputation - a.reputation)[0];
    const input = {
      lang, firstName: user.firstName, lastName: user.lastName, nation: opts.nation, nationName,
      position: opts.position, positionName, foot: opts.foot, traits: [...traits], hometownHint: hometown.city,
      rivalName: fullName(rival), rivalClub: rival.clubId ? world.clubs[rival.clubId]?.name ?? '' : '',
      mentorName: null, startingClubName: headline?.name ?? '', seedFlavor: rng.pick(SEED_FLAVORS),
    };
    const fbRng = new Rng(rng.seed());
    s.rng = rng.state();
    const { value: g } = await callNarrator((n) => n.genesis(input), () => fallbackGenesis(fbRng, input), isGenesis, 60_000);
    const rng2 = new Rng(s.rng);
    s.career.genesis = buildGenesis(s, rng2, g, hometown, user.lastName);
    s.career.people = [s.career.genesis.agent, ...s.career.genesis.family];
    s.career.genesis.goals = safe('goals', () => career.makeCareerGoals(s, rng2)) ?? [];
    s.storylines = safe('storylines', () => narrative.initialStorylines(s, rng2)) ?? [];
    s.rng = rng2.state();

    this.welcomeInbox(s, trialClubs.map((c) => c.name));
    this.resetSession();
    this.state = s;
    this.slot = slot;
    this.bump(false);
    try {
      await this.save();
    } catch (e) {
      console.warn('[game] initial save failed — playing unsaved', e);
    }

    // A small splash in the papers and on social media about the new talent.
    const facts = t('game.facts.newTalent', {
      name: fullName(user), age: age(user, season), town: s.career.genesis.hometown, pos: positionName,
      clubs: trialClubs.map((c) => c.name).join(', '),
    });
    const stamp = { season: s.season, week: s.week };
    this.background(() => this.publishNews(s, [{ kind: 'story', facts, aboutUser: true, importance: 0.45, tags: ['user', 'youth'] }], stamp));
    this.background(() => this.publishSocial(s, { kind: 'event', facts }, 3, stamp));
  }

  private msg(s: GameState, m: Omit<InboxMessage, 'id' | 'season' | 'week' | 'read'> & { read?: boolean }): InboxMessage {
    const full: InboxMessage = { id: nextId(s, 'M'), season: s.season, week: s.week, ...m, read: m.read ?? false };
    s.inbox.push(full);
    return full;
  }

  private welcomeInbox(s: GameState, clubNames: string[]): void {
    const g = s.career.genesis;
    const p = s.world.players[s.career.playerId];
    if (g.destinyHint) {
      this.msg(s, { kind: 'story', from: t('game.welcome.scoutFrom'), subject: t('game.welcome.scoutSubject'), body: t('game.welcome.scoutBody', { hint: g.destinyHint }) });
    }
    const fam = g.family[0];
    if (fam) {
      this.msg(s, {
        kind: 'story', from: fam.name, subject: t(`game.welcome.familySubject.${fam.role === 'mother' ? 'mother' : fam.role === 'sibling' ? 'sibling' : 'father'}`),
        body: t('game.welcome.familyBody', { first: p.firstName, town: g.hometown, motto: g.motto, dream: g.dream }),
      });
    }
    for (const o of s.offers) if (o.status === 'pending') this.offerMessage(s, o);
    this.msg(s, {
      kind: 'info', from: g.agent.name, subject: t('game.welcome.agentSubject', { first: p.firstName }),
      body: t('game.welcome.agentBody', { first: p.firstName, agent: g.agent.name, clubs: clubNames.join(', '), n: clubNames.length }),
    });
  }

  private termsLine(o: TransferOffer): string {
    const lang = this.state?.lang ?? 'tr';
    const parts = [
      t('game.offer.terms', {
        wage: formatMoney(o.terms.wage, lang), years: o.terms.years, role: t(`common.role.${o.terms.role}`),
      }),
    ];
    if (o.fee > 0) parts.push(t('game.offer.fee', { fee: formatMoney(o.fee, lang) }));
    if (o.terms.signingBonus > 0) parts.push(t('game.offer.bonus', { bonus: formatMoney(o.terms.signingBonus, lang) }));
    return parts.join(' · ');
  }

  private offerMessage(s: GameState, o: TransferOffer): InboxMessage {
    const club = s.world.clubs[o.fromClubId];
    const name = club?.name ?? '?';
    return this.msg(s, {
      kind: o.kind === 'renewal' ? 'contract' : 'offer',
      from: name,
      subject: t(`game.offer.subject.${o.kind}`, { club: name }),
      body: [o.note, this.termsLine(o)].filter(Boolean).join('\n\n'),
      ref: { type: 'offer', id: o.id },
    });
  }

  // ───────────────────────── week view & actions ─────────────────────────

  agenda(): Agenda {
    return computeAgenda(this.requireState());
  }

  /** Can / must the player retire now? */
  retirementStatus(): { canRetire: boolean; forced: boolean } {
    const s = this.requireState();
    if (s.career.retired) return { canRetire: false, forced: false };
    const st = safe('retirementStatus', () => career.retirementStatus(s)) ?? { canRetire: false, forced: false };
    return { canRetire: st.canRetire || !!s.flags[FLAG.forcedRetire], forced: st.forced || !!s.flags[FLAG.forcedRetire] };
  }

  setTrainingFocus(f: TrainingFocus): void {
    const s = this.requireState();
    s.career.trainingFocus = f;
    this.commit();
  }

  doActivity(id: string): { ok: boolean; text: string; notes: string[] } {
    const s = this.requireState();
    const rng = new Rng(s.rng);
    try {
      return career.doActivity(s, rng, id);
    } finally {
      s.rng = rng.state();
      this.commit();
    }
  }

  completeDrill(type: MomentType, score: number): string[] {
    const s = this.requireState();
    const notes = career.applyDrill(s, type, clamp(score, 0, 100));
    this.commit();
    return notes.map((n) => `${t(`common.attr.${n.attr}`)} ${n.delta > 0 ? '+' : ''}${n.delta}`);
  }

  buyItem(id: string): { ok: boolean; reason?: string } {
    const s = this.requireState();
    const res = career.buyItem(s, id);
    this.commit();
    return res;
  }

  sellItem(id: string): { ok: boolean; refund: number } {
    const s = this.requireState();
    const res = career.sellItem(s, id);
    this.commit();
    return res;
  }

  resolveEvent(eventId: string, choiceId: string): string {
    const s = this.requireState();
    const ev = s.events.find((e) => e.id === eventId);
    if (!ev) throw new Error(t('game.err.noEvent'));
    if (ev.resolved) return ev.resolved.text;
    const snapshot = deepClone(s);
    const rng = new Rng(s.rng);
    let text: string;
    try {
      text = narrative.resolveEvent(s, eventId, choiceId, rng);
      s.rng = rng.state();
    } catch (e) {
      // Never leave the player stuck on an event: apply the choice locally instead.
      console.warn('[game] narrative.resolveEvent failed, resolving locally', e);
      restoreInPlace(s, snapshot);
      const live = s.events.find((x) => x.id === eventId)!;
      const choice = live.choices.find((c) => c.id === choiceId) ?? live.choices[0];
      if (choice) safe('applyEffects', () => career.applyEffects(s, sanitizeEffectsSafe(choice.effects)));
      text = choice?.resultText ?? '';
      live.resolved = { choiceId: choice?.id ?? choiceId, text };
    }
    const live = s.events.find((x) => x.id === eventId);
    if (live && !live.resolved) live.resolved = { choiceId, text };
    for (const m of s.inbox) if (m.ref?.type === 'event' && m.ref.id === eventId) m.read = true;
    this.commit();
    return text;
  }

  markRead(messageId: string): void {
    const s = this.requireState();
    const m = s.inbox.find((x) => x.id === messageId);
    if (!m || m.read) return;
    m.read = true;
    this.commit();
  }

  /** Mark every inbox message read. */
  markAllRead(): void {
    const s = this.requireState();
    let changed = false;
    for (const m of s.inbox) if (!m.read) { m.read = true; changed = true; }
    if (changed) this.commit();
  }

  /** The sponsor proposal behind an inbox message (null when answered or expired). */
  pendingSponsor(messageId: string): SponsorDeal | null {
    const s = this.state;
    const m = s?.inbox.find((x) => x.id === messageId);
    if (!s || !m || m.ref?.type !== 'sponsor') return null;
    const raw = s.flags[SPONSOR_FLAG + m.ref.id];
    if (typeof raw !== 'string') return null;
    try { return (JSON.parse(raw) as { deal: SponsorDeal }).deal; } catch { return null; }
  }

  acceptSponsor(messageId: string, accept: boolean): void {
    const s = this.requireState();
    const m = s.inbox.find((x) => x.id === messageId);
    if (!m || m.ref?.type !== 'sponsor') return;
    const deal = this.pendingSponsor(messageId);
    const key = SPONSOR_FLAG + m.ref.id;
    m.read = true;
    delete s.flags[key];
    if (deal && accept) {
      career.acceptSponsor(s, deal);
      this.notify('sponsor', t('game.notice.sponsorSigned', { brand: deal.brand }), 'handshake', 'gold');
      const facts = t('game.facts.sponsor', { name: fullName(s.world.players[s.career.playerId]), brand: deal.brand });
      const stamp = { season: s.season, week: s.week };
      this.background(() => this.publishSocial(s, { kind: 'event', facts }, 2, stamp));
    }
    this.commit();
  }

  // ───────────────────────── narration helpers ─────────────────────────

  private async publishNews(s: GameState, seeds: NewsSeed[], stamp: { season: number; week: number }, ctx?: NarrativeContext, commit = true): Promise<void> {
    if (!seeds.length) return;
    const c = ctx ?? narrativeContext(s);
    const { value, source } = await callNarrator((n) => n.news(c, seeds), () => [], (v) => Array.isArray(v));
    if (this.state !== s) return;
    for (const a of articlesFromSeeds(s, seeds, value, source === 'claude')) {
      s.news.push({ ...a, id: nextId(s, 'N'), season: stamp.season, week: stamp.week });
    }
    if (s.news.length > CAPS.news) s.news = s.news.slice(-CAPS.news);
    if (commit) this.commit();
  }

  private async publishSocial(s: GameState, trigger: SocialTrigger, count: number, stamp: { season: number; week: number }, ctx?: NarrativeContext, commit = true): Promise<SocialPost[]> {
    if (count <= 0) return [];
    const c = ctx ?? narrativeContext(s);
    const { value } = await callNarrator((n) => n.social(c, trigger, count), () => [], (v) => Array.isArray(v));
    if (this.state !== s) return [];
    const posts: SocialPost[] = sanitizePosts(value).map((p) => ({ ...p, id: nextId(s, 'S'), season: stamp.season, week: stamp.week }));
    s.social.push(...posts);
    if (s.social.length > CAPS.social) s.social = s.social.slice(-CAPS.social);
    if (commit && posts.length) this.commit();
    return posts;
  }

  private addEvents(s: GameState, events: GameEvent[] | undefined, report?: WeekReport): GameEvent[] {
    const added: GameEvent[] = [];
    for (const e of events ?? []) {
      if (!e || typeof e.id !== 'string' || s.events.some((x) => x.id === e.id)) continue;
      if (!Array.isArray(e.choices) || e.choices.length === 0) {
        e.resolved ??= { choiceId: 'none', text: '' };
      } else if (pendingEvents(s).length >= MAX_PENDING_EVENTS) {
        continue;
      }
      s.events.push(e);
      added.push(e);
      this.msg(s, {
        kind: 'event', from: e.persona ?? t('game.inbox.eventFrom'), subject: e.title, body: e.body,
        ref: { type: 'event', id: e.id }, read: !!e.resolved,
      });
    }
    if (added.length && report) report.messages.push(t('game.events.note', { n: added.length }));
    return added;
  }

  // ───────────────────────── press, chat, social ─────────────────────────

  private pressFacts(s: GameState, occasion: PressOccasion): string {
    const p = s.world.players[s.career.playerId];
    const name = fullName(p);
    const club = p.clubId ? s.world.clubs[p.clubId]?.name ?? '' : t('game.facts.noClub');
    switch (occasion) {
      case 'pre_match': {
        const ag = computeAgenda(s);
        const fx = ag.fixtures.find((x) => !x.fixture.played) ?? ag.fixtures[0];
        if (fx) return t('game.press.facts.pre_match', { name, club, opp: fx.opponent, comp: fx.compName });
        break;
      }
      case 'post_match': {
        const m = s.career.matches[s.career.matches.length - 1];
        if (m) return t('game.press.facts.post_match', { name, club, opp: m.opponent, gf: m.goalsFor, ga: m.goalsAgainst, rating: m.rating.toFixed(1), goals: m.goals, assists: m.assists });
        break;
      }
      case 'transfer': {
        const clubs = s.offers.filter((o) => o.status === 'pending' && o.kind !== 'trial').map((o) => s.world.clubs[o.fromClubId]?.name).filter(Boolean);
        return t('game.press.facts.transfer', { name, club, clubs: clubs.join(', ') || t('common.none'), listed: s.career.transferListed ? t('common.yes') : t('common.no') });
      }
      case 'unveiling':
        return t('game.press.facts.unveiling', { name, club });
      case 'scandal': {
        const st = s.storylines.find((x) => x.active && /scandal/.test(x.kind));
        return t('game.press.facts.scandal', { name, club, kind: st?.kind ?? 'scandal' });
      }
      case 'milestone':
        return t('game.press.facts.milestone', { name, club, goals: p.career.goals, apps: p.career.apps });
    }
    return t('game.press.facts.generic', { name, club });
  }

  async startPress(occasion: PressOccasion): Promise<PressSession> {
    const s = this.requireState();
    const facts = this.pressFacts(s, occasion);
    const ctx = narrativeContext(s);
    const outlet = defaultOutlet(s);
    const { value } = await callNarrator(
      (n) => n.pressQuestions(ctx, occasion, facts),
      () => fallbackQuestions(occasion, facts, outlet),
      isQuestionList,
    );
    const seen = new Set<string>();
    const questions: PressQuestion[] = value.slice(0, 5).map((q, i) => {
      let id = typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`;
      if (seen.has(id)) id = `${id}-${i}`;
      seen.add(id);
      const options = (q.options ?? []).filter((o) => o && typeof o.text === 'string').map((o, j) => ({ ...o, id: o.id || `${id}o${j + 1}` }));
      return { ...q, id, outlet: q.outlet || outlet, options: options.length ? options : fallbackQuestions(occasion, facts, outlet)[0].options };
    });
    const session: PressSession = { id: `press-${++this.seq}`, occasion, questions, answered: {} };
    this.presses.set(session.id, session);
    if (this.state === s) {
      const now = absWeek(s.season, s.week);
      s.flags[FLAG.pressPrefix + occasion] = now;
      if (occasion === 'unveiling' && typeof s.flags[FLAG.unveil] === 'number') s.flags[FLAG.unveilDone] = s.flags[FLAG.unveil];
      if (occasion === 'scandal') {
        const st = s.storylines.find((x) => x.active && /scandal/.test(x.kind));
        if (st) s.flags[FLAG.pressPrefix + 'scandal'] = `${st.id}:${st.stage}`;
      }
      this.commit();
    }
    return session;
  }

  /** A press session started earlier in this session (kept in memory only). */
  pressSession(sessionId: string): PressSession | null {
    return this.presses.get(sessionId) ?? null;
  }

  async answerPress(sessionId: string, questionId: string, answer: { optionId?: string; text?: string }): Promise<PressEvaluation> {
    const s = this.requireState();
    const session = this.presses.get(sessionId);
    if (!session) throw new Error(t('game.err.noPress'));
    const q = session.questions.find((x) => x.id === questionId);
    if (!q) throw new Error(t('game.err.noQuestion'));
    const already = session.answered[questionId];
    if (already) return already;
    const clean = { optionId: answer.optionId, text: answer.text?.trim().slice(0, 600) || undefined };
    const p = s.world.players[s.career.playerId];
    const ctx = narrativeContext(s);
    const { value, source } = await callNarrator(
      (n) => n.evaluatePress(ctx, q, clean),
      () => fallbackEvaluation(q, clean, fullName(p)),
      isEvaluation,
    );
    const effects = clampPressEffects(sanitizeEffectsSafe(value.effects));
    const evaluation: PressEvaluation = {
      tone: value.tone,
      effects,
      headline: value.headline.trim().slice(0, 140) || t(`game.press.headline.${value.tone}`, { name: fullName(p) }),
      feedback: typeof value.feedback === 'string' ? value.feedback.trim().slice(0, 400) : '',
    };
    session.answered[questionId] = evaluation;
    if (this.state !== s) return evaluation;
    safe('press effects', () => career.applyEffects(s, effects));
    const answerText = clean.text ?? q.options.find((o) => o.id === clean.optionId)?.text ?? '';
    const article: NewsArticle = {
      id: nextId(s, 'N'), season: s.season, week: s.week, outlet: q.outlet || defaultOutlet(s), headline: evaluation.headline,
      body: t('game.press.articleBody', { journalist: q.journalist, question: q.text, name: fullName(p), answer: answerText, feedback: evaluation.feedback }),
      tags: ['press', 'user', q.topic].filter(Boolean), importance: clamp(0.35 + Math.abs(effects.fame ?? 0) * 0.1, 0, 1),
      aboutUser: true, ai: source === 'claude',
    };
    s.news.push(article);
    if (s.news.length > CAPS.news) s.news = s.news.slice(-CAPS.news);
    this.commit();
    return evaluation;
  }

  private personaName(s: GameState, persona: PersonaKind): string {
    const people = s.career.people;
    const byRole = (...roles: PersonRole[]) => people.find((x) => roles.includes(x.role))?.name;
    const p = s.world.players[s.career.playerId];
    switch (persona) {
      case 'agent': return byRole('agent') ?? s.career.genesis.agent.name ?? t('game.persona.agent');
      case 'manager': {
        const club = p.clubId ? s.world.clubs[p.clubId] : null;
        const m = club ? s.world.managers[club.managerId] : null;
        return m ? `${m.firstName} ${m.lastName}` : t('game.persona.manager');
      }
      case 'mentor': {
        const m = s.career.mentorId ? s.world.players[s.career.mentorId] : null;
        return m ? fullName(m) : t('game.persona.mentor');
      }
      case 'partner': return people.find((x) => x.id === s.career.partnerId)?.name ?? byRole('partner') ?? t('game.persona.partner');
      case 'family': return byRole('mother', 'father', 'sibling') ?? t('game.persona.family');
      case 'rival': {
        const r = s.world.players[s.career.rivalId];
        return r ? fullName(r) : t('game.persona.rival');
      }
    }
    return persona;
  }

  async chat(persona: PersonaKind, message: string): Promise<string> {
    const s = this.requireState();
    const text = message.trim().slice(0, 600);
    if (!text) return '';
    s.chats ??= {};
    const history = (s.chats[persona] ?? []).slice(-20);
    const name = this.personaName(s, persona);
    (s.chats[persona] ??= []).push({ from: 'user', text });
    this.commit();
    const ctx = narrativeContext(s);
    const { value } = await callNarrator(
      (n) => n.chat(ctx, persona, name, history, text),
      () => t('game.chat.fallback', { name }),
      (v) => typeof v === 'string' && v.trim().length > 0,
    );
    const reply = value.trim().slice(0, 1500);
    if (this.state !== s) return reply;
    const list = (s.chats[persona] ??= []);
    list.push({ from: 'persona', text: reply });
    if (list.length > CAPS.chat) s.chats[persona] = list.slice(-CAPS.chat);
    // Keeping in touch helps a little (once per week per persona).
    const rel = PERSONA_REL[persona];
    const key = `game.chat.${persona}`;
    const now = absWeek(s.season, s.week);
    if (rel && s.flags[key] !== now) {
      s.flags[key] = now;
      safe('chat rel', () => career.applyEffects(s, { rel: { [rel]: 1 } }));
    }
    this.commit();
    return reply;
  }

  chatHistory(persona: PersonaKind): { from: 'user' | 'persona'; text: string }[] {
    return this.state?.chats?.[persona] ?? [];
  }

  async postSocial(text: string): Promise<void> {
    const s = this.requireState();
    const body = text.trim().slice(0, 280);
    if (!body) return;
    const p = s.world.players[s.career.playerId];
    const rng = new Rng(s.rng);
    const followers = s.career.followers;
    s.social.push({
      id: nextId(s, 'S'), season: s.season, week: s.week,
      author: { name: fullName(p), handle: handleOf(p), kind: 'user', verified: s.career.fame >= 35 },
      text: body,
      likes: Math.round(followers * rng.float(0.01, 0.06)) + rng.int(0, 25),
      reposts: Math.round(followers * rng.float(0.001, 0.008)),
      sentiment: 0,
      ai: false,
    });
    s.rng = rng.state();
    this.commit();

    const tone = postTone(body);
    const count = clamp(2 + Math.floor(s.career.fame / 25), 2, 6);
    const stamp = { season: s.season, week: s.week };
    const reactions = await this.publishSocial(s, { kind: 'user_post', text: body, tone }, count, stamp, undefined, false);
    if (this.state !== s) return;
    const avg = reactions.length ? reactions.reduce((a, r) => a + r.sentiment, 0) / reactions.length : 0;
    const now = absWeek(s.season, s.week);
    const [w, c] = String(s.flags[FLAG.postsWeek] ?? '').split(':').map(Number);
    const n = w === now ? c || 0 : 0;
    const factor = n === 0 ? 1 : n === 1 ? 0.5 : n < 4 ? 0.15 : 0;
    const base = 15 + s.career.followers * 0.004 + s.career.fame * 4;
    const delta = Math.round(base * factor * (0.6 + avg));
    s.flags[FLAG.postsWeek] = `${now}:${n + 1}`;
    const fans = avg > 0.3 ? 1 : avg < -0.3 ? -1 : 0;
    safe('post effects', () => career.applyEffects(s, { followers: delta, ...(fans ? { rel: { fans } } : {}) }));
    this.commit();
  }

  // ───────────────────────── transfers ─────────────────────────

  private readOfferMessages(s: GameState, offerId: string): void {
    for (const m of s.inbox) if (m.ref?.type === 'offer' && m.ref.id === offerId) m.read = true;
  }

  respondOffer(offerId: string, action: 'accept' | 'reject'): void {
    const s = this.requireState();
    const offer = s.offers.find((o) => o.id === offerId);
    if (!offer) throw new Error(t('game.err.noOffer'));
    if (offer.status !== 'pending' && offer.status !== 'negotiating') return;
    if (action === 'reject') {
      safe('rejectOffer', () => career.rejectOffer(s, offerId));
      if (offer.status === 'pending' || offer.status === 'negotiating') offer.status = 'rejected';
      if (s.negotiation?.offerId === offerId) s.negotiation = null;
      this.readOfferMessages(s, offerId);
      this.commit();
      return;
    }
    this.signOffer(s, offer);
    this.commit();
  }

  /** Sign an offer (optionally with negotiated terms) and tell the world about it. */
  private signOffer(s: GameState, offer: TransferOffer, terms?: ContractTerms): void {
    const p = s.world.players[s.career.playerId];
    const fromClubId = p.clubId;
    this.transact(s, () => career.acceptOffer(s, offer.id, terms));
    if (offer.status === 'pending' || offer.status === 'negotiating') offer.status = 'accepted';
    s.negotiation = null;
    this.readOfferMessages(s, offer.id);
    s.flags[FLAG.everSigned] = true;
    if (offer.kind === 'trial') {
      // Choosing one trial club withdraws the other invitations AND removes their messages from the inbox.
      for (const o of s.offers) {
        if (o !== offer && o.kind === 'trial' && (o.status === 'pending' || o.status === 'negotiating')) o.status = 'withdrawn';
      }
      const dropped = new Set(s.offers.filter((o) => o !== offer && o.kind === 'trial' && o.status === 'withdrawn').map((o) => o.id));
      if (dropped.size) s.inbox = s.inbox.filter((m) => !(m.ref?.type === 'offer' && dropped.has(m.ref.id)));
    }
    const toClubId = p.clubId;
    const club = toClubId ? s.world.clubs[toClubId] : null;
    const lang = s.lang;
    const contract = p.contract;
    const vars = {
      name: fullName(p), from: fromClubId ? s.world.clubs[fromClubId]?.name ?? '' : t('game.facts.noClub'), to: club?.name ?? '',
      fee: formatMoney(offer.fee, lang), wage: formatMoney(contract?.wage ?? offer.terms.wage, lang),
      years: contract ? Math.max(1, contract.endSeason - s.season + 1) : offer.terms.years,
    };
    const seeds: NewsSeed[] = [];
    const rng = new Rng(s.rng);
    if (club && toClubId !== fromClubId) {
      s.flags[FLAG.unveil] = absWeek(s.season, s.week);
      const mgr = s.world.managers[club.managerId];
      this.msg(s, {
        kind: 'manager', from: mgr ? `${mgr.firstName} ${mgr.lastName}` : club.name,
        subject: t('game.sign.welcomeSubject', { club: club.name }),
        body: t(offer.kind === 'trial' ? 'game.sign.trialBody' : 'game.sign.welcomeBody', { first: p.firstName, club: club.name, city: club.city, nick: club.nickname }),
      });
      this.notify('transfer', t('game.notice.signed', { club: club.name }), 'handshake', 'gold');
      const story = safe('storylines(transfer)', () => narrative.updateStorylines(s, rng, { kind: 'transfer', fromClubId, toClubId: club.id }));
      if (story) { this.addEvents(s, story.events); seeds.push(...story.seeds); }
      const factsKey = offer.kind === 'trial' ? 'trial' : offer.kind === 'loan' ? 'loan' : offer.kind === 'free' || offer.fee <= 0 ? 'free' : 'transfer';
      seeds.unshift({
        kind: 'transfer_done', facts: t(`game.facts.${factsKey}`, vars), aboutUser: true,
        importance: clamp(0.4 + club.reputation / 200 + (offer.fee > 10_000_000 ? 0.2 : 0), 0, 1), tags: ['transfer', 'user'],
      });
    } else if (club) {
      this.msg(s, { kind: 'contract', from: club.name, subject: t('game.sign.renewSubject', { club: club.name }), body: t('game.sign.renewBody', vars) });
      this.notify('transfer', t('game.notice.renewed', { club: club.name }), 'handshake', 'accent');
      seeds.push({ kind: 'transfer_done', facts: t('game.facts.renewal', vars), aboutUser: true, importance: 0.35, tags: ['contract', 'user'] });
    }
    s.rng = rng.state();
    const stamp = { season: s.season, week: s.week };
    if (seeds.length) {
      this.background(() => this.publishNews(s, seeds, stamp));
      if (club && toClubId !== fromClubId) this.background(() => this.publishSocial(s, { kind: 'transfer', facts: seeds[0].facts }, 4, stamp));
    }
  }

  async openNegotiation(offerId: string): Promise<void> {
    const s = this.requireState();
    const offer = s.offers.find((o) => o.id === offerId);
    if (!offer) throw new Error(t('game.err.noOffer'));
    if (offer.status !== 'pending' && offer.status !== 'negotiating') throw new Error(t('game.err.offerClosed'));
    if (s.negotiation?.offerId === offerId && s.negotiation.status === 'open') return;
    if (s.negotiation && s.negotiation.offerId !== offerId) {
      const prev = s.offers.find((o) => o.id === s.negotiation!.offerId);
      if (prev?.status === 'negotiating') prev.status = 'pending';
    }
    const neg = career.startNegotiation(s, offerId);
    if (offer.status === 'pending') offer.status = 'negotiating';
    const club = s.world.clubs[offer.fromClubId];
    if (!neg.lines.length) neg.lines.push({ from: 'club', text: offer.note || t('game.neg.opening', { club: club?.name ?? '' }), terms: { ...neg.current } });
    // The agent whispers an opinion on the opening offer.
    const p = s.world.players[s.career.playerId];
    const fair = safe('fairWage', () => career.fairWage(s, p, offer.fromClubId));
    if (fair && fair > 0) {
      const ratio = neg.current.wage / fair;
      const verdict = ratio < 0.85 ? 'low' : ratio > 1.15 ? 'generous' : 'fair';
      const agent = s.career.people.find((x) => x.role === 'agent')?.name ?? t('game.persona.agent');
      neg.lines.push({ from: 'agent', text: t(`game.neg.agent.${verdict}`, { agent, fair: formatMoney(fair, s.lang) }) });
    }
    s.negotiation = neg;
    this.readOfferMessages(s, offerId);
    this.commit();
  }

  async negotiate(ask: ContractTerms, message: string | null): Promise<void> {
    const s = this.requireState();
    const neg = s.negotiation;
    if (!neg || neg.status !== 'open' || this.negotiationBusy) return;
    const offer = s.offers.find((o) => o.id === neg.offerId);
    const said = message?.trim().slice(0, 500) || null;
    const lang = s.lang;

    // 1) Deterministic game logic decides the club's move (before any narration).
    const before = { round: neg.round, patience: neg.patience, current: neg.current };
    let step: { accepted: boolean; collapsed: boolean; terms: ContractTerms; patienceDelta: number } | null = null;
    if (before.round < neg.maxRounds) {
      const rng = new Rng(s.rng);
      try {
        step = career.negotiationStep(s, ask, rng);
      } finally {
        s.rng = rng.state();
      }
    }
    s.negotiation = neg; // the step must not swap the object under us
    neg.lines.push({
      from: 'player',
      text: said ?? t('game.neg.playerAsk', { wage: formatMoney(ask.wage, lang), years: ask.years, role: t(`common.role.${ask.role}`) }),
      terms: { ...ask },
    });
    if (!step) {
      neg.status = 'collapsed';
    } else {
      neg.round = before.round + 1;
      neg.patience = clamp(before.patience + (Number(step.patienceDelta) || 0), 0, 100);
      neg.current = career.clampTerms(neg, validTerms(step.terms) ? step.terms : before.current);
      if (step.accepted) {
        neg.status = 'agreed';
        neg.current = career.clampTerms(neg, ask);
      } else if (step.collapsed || neg.patience <= 0) {
        neg.status = 'collapsed';
      } else {
        neg.status = 'open';
      }
    }
    this.commit();

    // 2) The narrator voices the director (Claude may nudge within the hard limits).
    this.negotiationBusy = true;
    let reply: { value: NegotiationReply; source: NarratorSource };
    try {
      const ctx = narrativeContext(s);
      const snapshot = cloneJson(neg);
      reply = await callNarrator(
        (n) => n.negotiate(ctx, snapshot, ask, said),
        () => ({ text: '', terms: { ...neg.current }, patienceDelta: 0, walkAway: false }),
        isNegotiationReply,
        30_000,
      );
    } finally {
      this.negotiationBusy = false;
    }
    if (this.state !== s || s.negotiation !== neg) { this.commit(); return; }
    const r = reply.value;
    if (neg.status === 'open' && reply.source === 'claude') {
      if (validTerms(r.terms)) neg.current = career.clampTerms(neg, r.terms);
      neg.patience = clamp(neg.patience + clamp(Number(r.patienceDelta) || 0, -30, 10), 0, 100);
      if (r.walkAway || neg.patience <= 0) neg.status = 'collapsed';
    }
    const clubName = s.world.clubs[neg.clubId]?.name ?? '';
    const text = r.text.trim().slice(0, 800) || t(`game.neg.club.${neg.status}`, { club: clubName });
    neg.lines.push({ from: 'club', text, terms: { ...neg.current } });
    if (neg.status === 'agreed') neg.lines.push({ from: 'system', text: t('game.neg.agreed') });
    else if (neg.status === 'collapsed') {
      neg.lines.push({ from: 'system', text: t('game.neg.collapsed', { club: clubName }) });
      if (offer && (offer.status === 'pending' || offer.status === 'negotiating')) offer.status = 'withdrawn';
      this.msg(s, { kind: 'offer', from: clubName, subject: t('game.neg.collapsedSubject', { club: clubName }), body: t('game.neg.collapsedBody', { club: clubName }) });
    } else if (neg.round >= neg.maxRounds) {
      neg.lines.push({ from: 'system', text: t('game.neg.finalOffer') });
    }
    this.commit();
  }

  acceptNegotiatedTerms(): void {
    const s = this.requireState();
    const neg = s.negotiation;
    if (!neg || neg.status === 'collapsed') return;
    const offer = s.offers.find((o) => o.id === neg.offerId);
    if (!offer || (offer.status !== 'pending' && offer.status !== 'negotiating')) {
      s.negotiation = null;
      this.commit();
      return;
    }
    const terms = career.clampTerms(neg, neg.current);
    neg.status = 'agreed';
    this.signOffer(s, offer, terms);
    s.negotiation = null;
    this.commit();
  }

  walkAway(): void {
    const s = this.requireState();
    const neg = s.negotiation;
    if (!neg) return;
    const offer = s.offers.find((o) => o.id === neg.offerId);
    if (offer && (offer.status === 'pending' || offer.status === 'negotiating')) {
      safe('rejectOffer', () => career.rejectOffer(s, offer.id));
      if (offer.status === 'pending' || offer.status === 'negotiating') offer.status = 'rejected';
    }
    s.negotiation = null;
    this.commit();
  }

  setTransferListed(on: boolean): void {
    const s = this.requireState();
    career.setTransferListed(s, on);
    this.commit();
  }

  // ───────────────────────── matches ─────────────────────────

  startMatch(fixtureId: string): { ctx: MatchContext; live: LiveMatch } {
    const s = this.requireState();
    const fixture = comp.findFixture(s, fixtureId);
    if (!fixture) throw new Error(t('game.err.noFixture'));
    if (fixture.played) throw new Error(t('game.err.alreadyPlayed'));
    const role = career.selectionFor(s, fixture);
    const rng = new Rng(s.rng);
    const ctx = comp.buildMatchContext(s, fixture, role, rng);
    const live = new LiveMatch(s, ctx, rng.fork());
    s.rng = rng.state();
    this.activeMatch = { fixtureId, ctx, live };
    this.commit();
    return { ctx, live };
  }

  async finishMatch(fixtureId: string, summary: MatchSummary): Promise<string[]> {
    const s = this.requireState();
    const fixture = comp.findFixture(s, fixtureId);
    if (!fixture) throw new Error(t('game.err.noFixture'));
    if (fixture.played || userPlayedIds(s).includes(fixtureId)) return [];
    if (this.activeMatch?.fixtureId === fixtureId) this.activeMatch = null;

    const p = s.world.players[s.career.playerId];
    const side = userSide(s, fixture) ?? 'home';
    const wasInjured = !!p.injury;
    const goalsBefore = p.career.goals;
    const notes: string[] = [];
    const seeds: NewsSeed[] = [];
    const rng = new Rng(s.rng);

    this.transact(s, () => {
      comp.applyResult(s, fixtureId, summary);
      markUserPlayed(s, fixtureId);
    });
    const after = safe('afterUserMatch', () => career.afterUserMatch(s, fixtureId, summary, rng));
    if (after) notes.push(...after);

    const gf = side === 'home' ? summary.homeGoals : summary.awayGoals;
    const ga = side === 'home' ? summary.awayGoals : summary.homeGoals;
    let won: boolean | null = gf > ga ? true : gf < ga ? false : null;
    if (won === null && summary.pens) won = side === 'home' ? summary.pens.home > summary.pens.away : summary.pens.away > summary.pens.home;
    const userGoals = summary.user?.stats.goals ?? 0;
    const userAssists = summary.user?.stats.assists ?? 0;
    const rating = summary.user?.rating ?? summary.ratings[p.id] ?? 6;
    const oppId = side === 'home' ? fixture.awayId : fixture.homeId;
    const ourId = side === 'home' ? fixture.homeId : fixture.awayId;
    const rival = s.world.players[s.career.rivalId];
    const vsRival = !!rival?.clubId && rival.clubId === oppId;
    const derby = !!s.world.clubs[ourId]?.derbyRivals.includes(oppId);
    const played = (summary.user?.stats.minutes ?? summary.minutes?.[p.id] ?? 0) > 0;

    const story = safe('storylines(match)', () => narrative.updateStorylines(s, rng, { kind: 'match', fixtureId, won, userGoals, rating, vsRival }));
    if (story) { this.addEvents(s, story.events); seeds.push(...story.seeds); }

    // Injury picked up in the match.
    if (!wasInjured && p.injury) {
      this.notify('injury', t('game.notice.injury', { weeks: p.injury.weeksLeft }), 'hospital', 'danger');
      const inj = safe('storylines(injury)', () => narrative.updateStorylines(s, rng, { kind: 'injury', weeks: p.injury!.weeksLeft }));
      if (inj) { this.addEvents(s, inj.events); seeds.push(...inj.seeds); }
      seeds.push({ kind: 'injury', facts: t('game.facts.injury', { name: fullName(p), weeks: p.injury.weeksLeft }), aboutUser: true, importance: 0.5, tags: ['injury', 'user'] });
    }
    // Goal milestones.
    const crossed = MILESTONE_GOALS.filter((m) => goalsBefore < m && p.career.goals >= m);
    if (crossed.length) {
      const m = crossed[crossed.length - 1];
      s.flags[FLAG.milestone] = absWeek(s.season, s.week);
      this.notify('milestone', t('game.notice.milestone', { n: m }), 'medal', 'gold');
      seeds.push({ kind: 'milestone', facts: t('game.facts.milestone', { name: fullName(p), n: m }), aboutUser: true, importance: m === 1 ? 0.7 : 0.6, tags: ['milestone', 'user'] });
    }

    const resultKey = won === true ? 'W' : won === false ? 'L' : 'D';
    const facts = [
      t('game.facts.match', {
        name: fullName(p), team: teamName(s, ourId), comp: compName(s, fixture.compId),
        home: teamName(s, fixture.homeId), away: teamName(s, fixture.awayId), hg: summary.homeGoals, ag: summary.awayGoals,
        result: t(`game.facts.res.${resultKey}`),
      }),
      played
        ? t('game.facts.userLine', { name: fullName(p), goals: userGoals, assists: userAssists, rating: rating.toFixed(1) })
        : t('game.facts.unused', { name: fullName(p) }),
      summary.motmId === p.id ? t('game.facts.motm') : '',
      derby ? t('game.facts.derby') : '',
      vsRival && rival ? t('game.facts.vsRival', { rival: fullName(rival) }) : '',
    ].filter(Boolean).join(' ');
    seeds.unshift({
      kind: 'match', facts, aboutUser: true,
      importance: clamp(0.35 + userGoals * 0.15 + (rating >= 8 ? 0.2 : 0) + (derby || vsRival ? 0.15 : 0), 0, 1),
      tags: ['match', 'user', ...(derby ? ['derby'] : [])],
    });
    s.rng = rng.state();
    this.commit();

    const stamp = { season: s.season, week: s.week };
    this.background(() => this.publishNews(s, seeds.slice(0, 4), stamp));
    if (played) {
      const count = clamp(3 + Math.floor(s.career.fame / 30) + (userGoals > 0 ? 1 : 0), 3, 7);
      this.background(async () => { await this.publishSocial(s, { kind: 'match', facts, rating, goals: userGoals, won }, count, stamp); });
    }
    return notes;
  }

  async simulateUserMatch(fixtureId: string): Promise<MatchSummary> {
    const { live } = this.startMatch(fixtureId);
    live.simulateToEnd();
    const summary = live.summary();
    await this.finishMatch(fixtureId, summary);
    return summary;
  }

  // ───────────────────────── time ─────────────────────────

  async advanceWeek(): Promise<WeekReport> {
    if (this.advanceJob) return this.advanceJob;
    const job = this.runAdvance();
    this.advanceJob = job;
    try {
      return await job;
    } finally {
      this.advanceJob = null;
    }
  }

  private async runAdvance(): Promise<WeekReport> {
    const s = this.requireState();
    const ag = computeAgenda(s);
    if (!ag.canAdvance) throw new GameBlockedError(ag.blockers);
    const snapshot = deepClone(s);
    this.advancing = true;
    this.noticeBuffer = [];
    let plan: WeekPlan;
    try {
      plan = this.weekCore(s);
      await this.weekNarration(s, plan);
      if (this.state === s) this.weekClose(s, plan);
    } catch (e) {
      if (this.state === s) restoreInPlace(s, snapshot);
      this.noticeBuffer = null;
      this.advancing = false;
      this.commit();
      throw e;
    }
    const buffered = this.noticeBuffer ?? [];
    this.noticeBuffer = null;
    this.advancing = false;
    if (this.state === s) this.commit();
    for (const n of buffered) this.notify(n.kind, n.text, n.icon, n.tone);
    return plan.report;
  }

  /** §3 steps 2–6 (+ news seeds of step 7). Synchronous. */
  private weekCore(s: GameState): WeekPlan {
    const rng = new Rng(s.rng);
    const report: WeekReport = {
      season: s.season, week: s.week, results: [], userMatches: userPlayedIds(s), progression: [], moneyDelta: 0, messages: [],
    };
    const seeds: NewsSeed[] = [];
    const moneyBefore = s.career.money;

    // 2. everything the user did not play
    const results = comp.simulateWeek(s, rng, report.userMatches);
    report.results = this.notableResults(s, results);

    // 3. training, recovery, finances
    const prog = safe('trainWeek', () => career.trainWeek(s, rng));
    if (prog) report.progression.push(...prog);
    const rec = safe('weeklyRecovery', () => career.weeklyRecovery(s, rng));
    if (rec) report.messages.push(...rec);
    safe('applyWeeklyFinances', () => career.applyWeeklyFinances(s));

    // 4–6. national team, offers, sponsors, events, storylines
    safe('callup', () => this.weeklyCallup(s, rng, report, seeds));
    safe('offers', () => this.weeklyOffers(s, rng, report, seeds));
    safe('sponsor', () => this.weeklySponsor(s, rng, report));
    const evs = safe('weeklyEvents', () => narrative.weeklyEvents(s, rng));
    if (evs) this.addEvents(s, evs, report);
    const story = safe('storylines(week)', () => narrative.updateStorylines(s, rng, { kind: 'week' }));
    if (story) { this.addEvents(s, story.events, report); seeds.push(...story.seeds); }
    const wantDynamic = aiOn('events') && !!s.world.players[s.career.playerId]?.clubId
      && pendingEvents(s).length < MAX_PENDING_EVENTS && rng.chance(0.15);

    // 7. news seeds (written by the narrator next)
    const weekly = safe('newsSeedsForWeek', () => narrative.newsSeedsForWeek(s, report, rng));
    if (weekly) seeds.unshift(...weekly);
    const socialCount = rng.chance(0.4) ? rng.int(2, 4) : 0;

    report.moneyDelta = s.career.money - moneyBefore;
    s.rng = rng.state();
    const top = [...seeds].sort((a, b) => b.importance - a.importance).slice(0, 8);
    return { report, seeds: seeds.filter((x) => top.includes(x)), wantDynamic, socialCount };
  }

  /** §3 steps 6b–7: narrator calls (dynamic event, news, social) — concurrent, guarded. */
  private async weekNarration(s: GameState, plan: WeekPlan): Promise<void> {
    const ctx = narrativeContext(s);
    const stamp = { season: s.season, week: s.week };
    const jobs: Promise<unknown>[] = [];
    if (plan.wantDynamic) jobs.push(this.dynamicEvent(s, ctx, plan.report));
    if (plan.seeds.length) jobs.push(this.publishNews(s, plan.seeds, stamp, ctx, false));
    if (plan.socialCount) jobs.push(this.publishSocial(s, { kind: 'idle' }, plan.socialCount, stamp, ctx, false));
    await Promise.all(jobs.map((j) => j.catch((e) => console.warn('[game] weekly narration failed', e))));
  }

  private async dynamicEvent(s: GameState, ctx: NarrativeContext, report: WeekReport): Promise<void> {
    const { value, source } = await callNarrator((n) => n.dynamicEvent(ctx), () => null, () => true, 40_000);
    if (this.state !== s) return;
    const ev = sanitizeDynamicEvent(value);
    if (!ev) return;
    const full: GameEvent = { ...ev, id: nextId(s, 'EV'), season: s.season, week: s.week, defId: 'ai', source: source === 'claude' ? 'ai' : 'template' };
    this.addEvents(s, [full], report);
  }

  /** §3 steps 8–10: goals, week += 1, season end / new season, housekeeping, report. */
  private weekClose(s: GameState, plan: WeekPlan): void {
    const rng = new Rng(s.rng);
    const { report } = plan;
    const p = s.world.players[s.career.playerId];

    // 8. career goals
    const done = safe('checkCareerGoals', () => career.checkCareerGoals(s)) ?? [];
    for (const g of done) {
      s.flags[FLAG.milestone] = absWeek(s.season, s.week);
      this.msg(s, { kind: 'award', from: t('game.goal.from'), subject: t('game.goal.subject'), body: t('game.goal.body', { goal: g.text }) });
      this.notify('goal', t('game.notice.goal', { goal: g.text }), 'target', 'gold');
      report.messages.push(t('game.goal.note', { goal: g.text }));
    }

    // 9. next week; season end and rollover
    const weeks = comp.WEEKS_PER_SEASON || 52;
    s.week += 1;
    s.career.actionsLeft = career.ACTIONS_PER_WEEK;
    delete s.flags[FLAG.userPlayed];
    const complete = s.week >= 30 && !!safe('isSeasonComplete', () => comp.isSeasonComplete(s));
    if (s.flags[FLAG.seasonEnded] !== s.season && (complete || s.week >= weeks)) this.seasonEnd(s, rng, report);
    if (s.week >= weeks) this.newSeason(s, rng, report);

    // housekeeping
    this.expireOffers(s, report);
    this.cleanSponsorFlags(s);
    enforceCaps(s);
    if (p) p.value = safe('marketValue', () => career.marketValue(p, s.season)) ?? p.value;

    // 10. report
    s.career.lastWeekReport = report;
    s.rng = rng.state();
  }

  private seasonEnd(s: GameState, rng: Rng, report: WeekReport): void {
    const trophiesBefore = s.career.trophies.length;
    const awardsBefore = s.career.awards.length;
    const summary = comp.endOfSeason(s, rng);
    s.flags[FLAG.seasonEnded] = s.season;
    report.seasonEnded = true;
    const p = s.world.players[s.career.playerId];
    const name = fullName(p);
    const seeds: NewsSeed[] = [];

    const ageing = safe('userSeasonAgeing', () => career.userSeasonAgeing(s, rng));
    if (ageing) report.progression.push(...ageing);
    const house = safe('contractHousekeeping', () => career.contractHousekeeping(s));
    if (house) report.messages.push(...house);
    const story = safe('storylines(season_end)', () => narrative.updateStorylines(s, rng, { kind: 'season_end' }));
    if (story) { this.addEvents(s, story.events, report); seeds.push(...story.seeds); }

    const label = `${s.season}/${String((s.season + 1) % 100).padStart(2, '0')}`;
    for (const tr of s.career.trophies.slice(trophiesBefore)) {
      this.msg(s, { kind: 'award', from: tr.name, subject: t('game.trophy.subject', { trophy: tr.name }), body: t('game.trophy.body', { trophy: tr.name, season: label }) });
      this.notify('trophy', t('game.notice.trophy', { trophy: tr.name }), 'trophy', 'gold');
      seeds.push({ kind: 'award', facts: t('game.facts.trophy', { name, trophy: tr.name, team: teamName(s, tr.teamId), season: label }), aboutUser: true, importance: 0.8, tags: ['trophy', 'user'] });
    }
    for (const aw of s.career.awards.slice(awardsBefore)) {
      this.msg(s, { kind: 'award', from: aw.name, subject: t('game.award.subject', { award: aw.name }), body: t('game.award.body', { award: aw.name, season: label, detail: aw.detail ?? '' }) });
      this.notify('award', t('game.notice.award', { award: aw.name }), 'award', 'gold');
      seeds.push({ kind: 'award', facts: t('game.facts.award', { name, award: aw.name, season: label }), aboutUser: true, importance: 0.85, tags: ['award', 'user'] });
      const st = safe('storylines(award)', () => narrative.updateStorylines(s, rng, { kind: 'award', key: aw.key }));
      if (st) { this.addEvents(s, st.events, report); seeds.push(...st.seeds); }
    }
    if (s.career.trophies.length > trophiesBefore || s.career.awards.length > awardsBefore) s.flags[FLAG.milestone] = absWeek(s.season, s.week);

    const rec = summary?.userRecord;
    this.msg(s, {
      kind: 'info', from: t('game.season.from'), subject: t('game.season.summarySubject', { season: label }),
      body: rec
        ? t('game.season.summaryBody', {
          season: label, club: rec.clubName, pos: rec.leaguePos ?? '—', apps: rec.stats.apps, goals: rec.stats.goals,
          assists: rec.stats.assists, avg: rec.avgRating.toFixed(2), ovr: rec.overall,
        })
        : t('game.season.summaryNoRecord', { season: label }),
    });
    report.messages.push(t('game.season.ended', { season: label }));
    this.notify('season', t('game.notice.seasonEnd', { season: label }), 'calendar', 'info');
    for (const [compId, winnerId] of Object.entries(summary?.champions ?? {})) {
      const c = s.competitions[compId];
      if (c && userTeamIds(s).some((id) => c.teamIds.includes(id))) {
        seeds.push({ kind: 'league', facts: t('game.facts.champion', { team: teamName(s, winnerId), comp: c.name }), aboutUser: false, importance: 0.55, tags: ['league'] });
      }
    }

    const st = safe('retirementStatus', () => career.retirementStatus(s));
    if (st?.forced) {
      s.flags[FLAG.forcedRetire] = true;
      this.msg(s, { kind: 'info', from: s.career.genesis.agent.name, subject: t('game.retire.forcedSubject'), body: t('game.retire.forcedBody', { first: p.firstName }) });
    } else if (st?.canRetire && !s.flags['game.retireHinted']) {
      s.flags['game.retireHinted'] = true;
      this.msg(s, { kind: 'info', from: s.career.genesis.agent.name, subject: t('game.retire.hintSubject'), body: t('game.retire.hintBody', { first: p.firstName }) });
    }
    const stamp = { season: s.season, week: s.week };
    if (seeds.length) this.background(() => this.publishNews(s, seeds.slice(0, 6), stamp));
  }

  private newSeason(s: GameState, rng: Rng, report: WeekReport): void {
    const before = s.season;
    comp.startNewSeason(s, rng);
    if (s.season === before) s.season = before + 1;
    s.week = 0;
    s.career.actionsLeft = career.ACTIONS_PER_WEEK;
    for (const k of Object.keys(s.flags)) if (k.startsWith(FLAG.pressPrefix) || k.startsWith('game.chat.')) delete s.flags[k];
    const label = `${s.season}/${String((s.season + 1) % 100).padStart(2, '0')}`;
    const p = s.world.players[s.career.playerId];
    this.msg(s, { kind: 'info', from: t('game.season.from'), subject: t('game.season.newSubject', { season: label }), body: t('game.season.newBody', { first: p.firstName, season: label, age: age(p, s.season) }) });
    report.messages.push(t('game.season.started', { season: label }));
    this.notify('season', t('game.notice.newSeason', { season: label }), 'sparkles', 'accent');
  }

  private notableResults(s: GameState, results: { fixture: Fixture; summary: MatchSummary }[]): { fixtureId: string; text: string }[] {
    const line = (f: Fixture, hg: number, ag: number, pens?: { home: number; away: number }) =>
      `${teamName(s, f.homeId)} ${hg}–${ag} ${teamName(s, f.awayId)}${pens ? ` (${t('game.report.pens', { h: pens.home, a: pens.away })})` : ''}`;
    const mine: { fixtureId: string; text: string }[] = [];
    for (const id of userPlayedIds(s)) {
      const f = safe('findFixture', () => comp.findFixture(s, id));
      if (f?.played) mine.push({ fixtureId: id, text: line(f, f.homeGoals ?? 0, f.awayGoals ?? 0, f.pens) });
    }
    const myTeams = userTeamIds(s);
    const myComps = new Set(Object.values(s.competitions).filter((c) => myTeams.some((id) => c.teamIds.includes(id))).map((c) => c.id));
    const rivalClub = s.world.players[s.career.rivalId]?.clubId ?? null;
    const ours: typeof mine = [];
    const rival: typeof mine = [];
    const others: typeof mine = [];
    for (const { fixture: f, summary } of results ?? []) {
      const entry = { fixtureId: f.id, text: line(f, summary.homeGoals, summary.awayGoals, summary.pens) };
      if (myTeams.includes(f.homeId) || myTeams.includes(f.awayId)) ours.push(entry);
      else if (rivalClub && (f.homeId === rivalClub || f.awayId === rivalClub)) rival.push(entry);
      else if (myComps.has(f.compId)) others.push(entry);
    }
    return [...mine, ...ours, ...rival, ...others].slice(0, 20);
  }

  private weeklyCallup(s: GameState, rng: Rng, report: WeekReport, seeds: NewsSeed[]): void {
    const weeks = comp.WEEKS_PER_SEASON || 52;
    const cur = comp.weekInfo(s.season, s.week);
    const next = s.week + 1 < weeks ? comp.weekInfo(s.season, s.week + 1) : comp.weekInfo(s.season + 1, 0);
    const ahead = (next.internationalBreak && !cur.internationalBreak) || (next.tournament && !cur.tournament);
    if (!ahead) return;
    const p = s.world.players[s.career.playerId];
    const firstCap = p.intlCaps === 0 && !s.career.nationalTeamId;
    const called = career.nationalCallup(s, rng);
    if (!called) return;
    const nt = s.career.nationalTeamId ? s.world.nationalTeams[s.career.nationalTeamId] : null;
    const team = nt ? nt.name[s.lang] ?? nt.name.en : p.nation;
    this.msg(s, {
      kind: 'callup', from: nt?.managerName ?? team, subject: t('game.callup.subject', { team }),
      body: t(firstCap ? 'game.callup.firstBody' : 'game.callup.body', { first: p.firstName, team, tournament: next.tournament ? t('game.callup.tournament') : '' }),
    });
    this.notify('callup', t('game.notice.callup', { team }), 'flag', 'gold');
    report.messages.push(t('game.callup.note', { team }));
    seeds.push({ kind: 'callup', facts: t(firstCap ? 'game.facts.firstCallup' : 'game.facts.callup', { name: fullName(p), team }), aboutUser: true, importance: firstCap ? 0.75 : 0.45, tags: ['callup', 'user'] });
  }

  private weeklyOffers(s: GameState, rng: Rng, report: WeekReport, seeds: NewsSeed[]): void {
    const wi = comp.weekInfo(s.season, s.week);
    const p = s.world.players[s.career.playerId];
    if (!wi.transferWindow && p.clubId) return;
    const fresh = career.generateOffers(s, rng);
    const added: TransferOffer[] = [];
    for (const o of fresh ?? []) {
      if (!s.offers.some((x) => x.id === o.id)) s.offers.push(o);
      added.push(o);
      this.offerMessage(s, o);
    }
    if (!added.length) return;
    report.messages.push(t('game.offers.note', { n: added.length }));
    this.notify('offer', t('game.notice.offer', { n: added.length }), 'mail', 'accent');
    const myRep = p.clubId ? s.world.clubs[p.clubId]?.reputation ?? 0 : 0;
    const big = added.filter((o) => o.kind === 'transfer' && (s.world.clubs[o.fromClubId]?.reputation ?? 0) > myRep + 8);
    if (big.length) {
      const club = s.world.clubs[big[0].fromClubId];
      seeds.push({ kind: 'transfer_rumour', facts: t('game.facts.rumour', { name: fullName(p), club: club?.name ?? '', fee: formatMoney(big[0].fee, s.lang) }), aboutUser: true, importance: 0.55, tags: ['transfer', 'rumour', 'user'] });
    }
  }

  private weeklySponsor(s: GameState, rng: Rng, report: WeekReport): void {
    const pending = Object.keys(s.flags).filter((k) => k.startsWith(SPONSOR_FLAG)).length;
    if (pending >= 2) return;
    const deal = career.maybeSponsorOffer(s, rng);
    if (!deal) return;
    s.flags[SPONSOR_FLAG + deal.id] = JSON.stringify({ deal, at: absWeek(s.season, s.week) });
    const lang = s.lang;
    this.msg(s, {
      kind: 'sponsor', from: deal.brand, subject: t('game.sponsor.subject', { brand: deal.brand }),
      body: t('game.sponsor.body', {
        brand: deal.brand, category: deal.category, weekly: formatMoney(deal.weekly, lang), until: deal.endSeason + 1,
        req: deal.requirement ? t('game.sponsor.req', { req: deal.requirement }) : '',
      }),
      ref: { type: 'sponsor', id: deal.id },
    });
    report.messages.push(t('game.sponsor.note', { brand: deal.brand }));
    this.notify('sponsor', t('game.notice.sponsor', { brand: deal.brand }), 'dollar_badge', 'gold');
  }

  private expireOffers(s: GameState, report: WeekReport): void {
    const now = absWeek(s.season, s.week);
    let n = 0;
    for (const o of s.offers) {
      const live = o.status === 'pending' || o.status === 'negotiating';
      if (!live || o.expiresWeek >= now) continue;
      if (o.kind === 'trial' && !s.flags[FLAG.everSigned]) continue;
      o.status = 'expired';
      this.readOfferMessages(s, o.id);
      n++;
    }
    const neg = s.negotiation;
    if (neg) {
      const o = s.offers.find((x) => x.id === neg.offerId);
      if (!o || (o.status !== 'pending' && o.status !== 'negotiating')) s.negotiation = null;
    }
    if (n) report.messages.push(t('game.offers.expired', { n }));
  }

  private cleanSponsorFlags(s: GameState): void {
    const now = absWeek(s.season, s.week);
    for (const k of Object.keys(s.flags)) {
      if (!k.startsWith(SPONSOR_FLAG)) continue;
      const id = k.slice(SPONSOR_FLAG.length);
      let at = -Infinity;
      try { at = (JSON.parse(String(s.flags[k])) as { at: number }).at; } catch { /* corrupt */ }
      const hasMsg = s.inbox.some((m) => m.ref?.type === 'sponsor' && m.ref.id === id);
      if (!hasMsg || now - at > 6) {
        delete s.flags[k];
        for (const m of s.inbox) if (m.ref?.type === 'sponsor' && m.ref.id === id) m.read = true;
      }
    }
  }

  // ───────────────────────── retirement ─────────────────────────

  private careerFacts(s: GameState): string {
    const p = s.world.players[s.career.playerId];
    const c = s.career;
    const lang = s.lang;
    const none = t('game.bio.none');
    const clubs = [...new Set(c.history.map((h) => h.clubName))];
    const current = p.clubId ? s.world.clubs[p.clubId]?.name : null;
    if (current && !clubs.includes(current)) clubs.push(current);
    const firstSeason = c.history[0]?.season ?? START_SEASON;
    const peak = Math.max(overall(p), ...c.history.map((h) => h.overall));
    const nation = safe('nation', () => worldApi.getNation(p.nation).name[lang]) ?? p.nation;
    const pos = safe('positionName', () => worldApi.positionName(p.position)) ?? p.position;
    const rival = s.world.players[c.rivalId];
    return [
      t('game.bio.header', { name: fullName(p), nation, pos, from: firstSeason, to: s.season + 1 }),
      t('game.bio.clubs', { clubs: clubs.join(', ') || none }),
      t('game.bio.totals', { apps: p.career.apps, goals: p.career.goals, assists: p.career.assists }),
      t('game.bio.trophies', { list: c.trophies.map((x) => `${x.name} ${x.season}`).join(', ') || none }),
      t('game.bio.awards', { list: c.awards.map((x) => `${x.name} ${x.season}`).join(', ') || none }),
      t('game.bio.intl', { caps: p.intlCaps, goals: p.intlGoals }),
      t('game.bio.peak', { ovr: peak, value: formatMoney(Math.max(p.value, ...c.history.map((h) => h.value)), lang) }),
      t('game.bio.origin', { town: c.genesis.hometown, dream: c.genesis.dream }),
      rival ? t('game.bio.rival', { rival: fullName(rival), goals: rival.career.goals }) : '',
      t('game.bio.goals', { list: c.genesis.goals.filter((g) => g.done).map((g) => g.text).join('; ') || none }),
      t('game.bio.hof', { score: Math.round(c.hallOfFame) }),
    ].filter(Boolean).join('\n');
  }

  async retire(): Promise<void> {
    const s = this.requireState();
    if (s.career.retired) return;
    const p = s.world.players[s.career.playerId];
    const ctx = narrativeContext(s);
    const club = p.clubId ? s.world.clubs[p.clubId] : null;

    // Close the books on the current season if it has no record yet.
    if (club && !s.career.history.some((h) => h.season === s.season) && p.season.apps > 0) {
      const leagueName = s.world.leagues.find((l) => l.country === club.country && l.tier === club.tier)?.name ?? '';
      s.career.history.push({
        season: s.season, clubId: club.id, clubName: club.name, league: leagueName,
        leaguePos: safe('leaguePosition', () => comp.leaguePosition(s, club.id)) ?? null, stats: { ...p.season },
        avgRating: p.season.apps ? Math.round((p.season.ratingSum / p.season.apps) * 100) / 100 : 0,
        overall: overall(p), value: p.value, trophies: s.career.trophies.filter((x) => x.season === s.season).map((x) => x.name),
      });
    }
    s.career.hallOfFame = safe('hallOfFameScore', () => career.hallOfFameScore(s)) ?? s.career.hallOfFame;
    const facts = this.careerFacts(s);

    s.career.retired = true;
    p.retired = true;
    if (club) club.squad = club.squad.filter((id) => id !== p.id);
    for (const nt of Object.values(s.world.nationalTeams)) if (nt.squad.includes(p.id)) nt.squad = nt.squad.filter((id) => id !== p.id);
    p.clubId = null;
    p.contract = null;
    s.career.calledUp = false;
    s.career.transferListed = false;
    s.negotiation = null;
    for (const o of s.offers) if (o.status === 'pending' || o.status === 'negotiating') o.status = 'withdrawn';
    delete s.flags[FLAG.forcedRetire];
    s.news.push({
      id: nextId(s, 'N'), season: s.season, week: s.week, outlet: defaultOutlet(s),
      headline: t('game.retire.newsHeadline', { name: fullName(p) }),
      body: t('game.retire.newsBody', { name: fullName(p), apps: p.career.apps, goals: p.career.goals, trophies: s.career.trophies.length }),
      tags: ['user', 'retirement'], importance: 1, aboutUser: true, ai: false,
    });
    this.msg(s, { kind: 'info', from: s.career.genesis.agent.name, subject: t('game.retire.inboxSubject'), body: t('game.retire.inboxBody', { first: p.firstName }) });
    this.notify('retire', t('game.notice.retired'), 'crown', 'gold');
    this.commit();

    const { value } = await callNarrator(
      (n) => n.biography(ctx, facts),
      () => t('game.retire.bioFallback', { facts }),
      (v) => typeof v === 'string' && v.trim().length > 40,
      90_000,
    );
    if (this.state !== s) return;
    s.career.biography = value.trim();
    this.commit();
    await this.save();
  }

  /** Did anything reach `needsClub` (UI helper mirroring Agenda.needsClub without the full agenda). */
  needsClub(): boolean {
    return !!this.state && needsClub(this.state);
  }
}
