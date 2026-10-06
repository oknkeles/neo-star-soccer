# Neo Star Soccer (NSS) — Game Design & Architecture

> A modern, AI-assisted homage to the *New Star Soccer* style of football career game.
> You are one player. You live the moments that involve you, in real-time 3D, with a
> ball that really curls. Off the pitch: training, money, relationships, transfers,
> the press, the national team. **Every career is different**: a seeded procedural world,
> hidden potential, random traits, storylines, and (optionally) Claude writing your story.

Primary language: **Turkish** (`tr`), full **English** (`en`) support. The user is Turkish —
Turkish football culture (Süper Lig, derbies, press tone) should feel authentic.

---

## 1. Pillars

1. **The ball is the star.** Physics-driven kicks: power, loft, *curl* (Magnus effect),
   aftertouch, wind, wet pitches, posts and crossbars, goalkeepers fooled by bend.
   The "Falso Çizgisi" gesture (draw the shot) is the signature mechanic.
2. **Moments, not 90 minutes.** NSS-style: the match runs as a fast ticker; you play only
   the 4–8 short real-time moments involving you (receive & shoot, 1v1, cross, free kick,
   penalty, defend, build-up). Each moment shifts your live match rating (3.0–10.0).
3. **A life, not a spreadsheet.** Relationships (manager, teammates, fans, media, family,
   partner, agent, sponsors), energy, money, a lifestyle shop, weekly activities and
   choice events with consequences.
4. **Every career is unique.** Seeded world generation (clubs' strength, squads, managers),
   a rival your age, a mentor, a hidden potential with a cryptic destiny hint, 3 random
   career goals, random storyline arcs, random traits.
5. **AI-assisted storytelling (optional).** With the player's own Claude API key, Claude
   writes the backstory, newspaper, social feed, press-conference questions and judges
   free-text answers, role-plays the sporting director in contract talks (within hard
   limits computed by game logic), invents bespoke events, and writes the retirement
   documentary. Without a key everything still works through rich procedural templates.

## 2. World

- **8 countries × 2 tiers = 16 leagues**: England, Spain, Italy, Germany, France, Portugal,
  Netherlands (the big 7) + **Türkiye** (bonus). Fictional club names in real cities
  (never real club names/logos). Tier 1 sizes ~18–20, tier 2 ~16–18.
- ~40 nations for players and national teams.
- Competitions: leagues, a domestic cup per country, the **Champions Cup** (32 clubs:
  8 groups → knockouts, final ~week 43), national-team qualifiers/friendlies in
  international breaks, **World Cup** (2030, 2034…) and **Continental Cup** (2028, 2032…)
  in summer (weeks 46–50).
- Seasons start in **2026/27**. Calendar: 52 weeks; week 0 ≈ first weekend of August.

## 3. Career loop (week by week)

```
Hub ──► activities (3 actions/week): train focus, drills, lifestyle, family, media, nightlife, charity…
   ├──► inbox: offers, events (choices), sponsor deals, call-ups, manager messages
   ├──► press conference (pre/post big matches, transfers, scandals)
   ├──► play this week's match(es) ──► MatchScreen: pre-match → ticker → moments (3D) → post-match
   └──► "Advance week" ──► GameController.advanceWeek()
```

`GameController.advanceWeek()` order (game module implements; all module calls via their api.ts):

1. Blocked until all of this week's user fixtures are played or simulated (and a club chosen).
2. `competition.simulateWeek(state, rng, skip=userPlayedFixtureIds)`
3. `career.trainWeek`, `career.weeklyRecovery`, `career.applyWeeklyFinances`
4. international break ahead → `career.nationalCallup` → inbox
5. transfer window → `career.generateOffers` → inbox (`ref: offer`); `career.maybeSponsorOffer` → inbox
6. `narrative.weeklyEvents` + `narrative.updateStorylines({kind:'week'})` → `state.events` + inbox;
   occasionally `narrator.dynamicEvent` when AI events are on
7. `narrative.newsSeedsForWeek` → `narrator.news` → `state.news` (cap ~150); `narrator.social` occasionally
8. `career.checkCareerGoals` (toast + inbox)
9. `week += 1`, `career.actionsLeft = ACTIONS_PER_WEEK`; at season end:
   `competition.endOfSeason` → `career.userSeasonAgeing` → `career.contractHousekeeping` →
   `narrative.updateStorylines({kind:'season_end'})`; at week 52 → `competition.startNewSeason`
10. Store `career.lastWeekReport`, `commit()`, autosave.

## 4. Match: macro (match/flow) & micro (match/engine + match/view)

**LiveMatch** simulates minute-by-minute from `TeamSheet.strength` with momentum and
style, producing ticker `MatchEvent`s (commentary from `narrative.matchCommentary`).
At chosen minutes it emits a `MomentSetup` (type chosen by the user's position and
situation; set pieces if the user is the taker). The UI plays it in 3D (or the user
presses *Simulate* → `engine.autoResolve`) and feeds the `MomentResult` back.

Moment mix by position (weights, roughly):
- ST: one_on_one, cross_receive, open_play, counter, penalty/free_kick (if taker)
- W: wing_cross, open_play, counter, cross_receive, free_kick/corner (if taker)
- AM/CM: open_play, build_up, counter, free_kick, corner, defend (CM)
- FB: wing_cross, defend, build_up
- CB: defend, build_up, corner (attacking header = cross_receive)

**Rating**: starts 6.0; moment `ratingDelta`s; team result & clean sheet modifiers; clamp 3.0–10.0.

**MomentEngine** (headless, deterministic, testable): metres, us attack +x. 120 Hz fixed
step physics. 22 players with simple steering AI, formation-aware support runs, pressing,
marking, a GK with reaction delay that re-predicts the ball path (so late curl fools them),
dives, catches/parries (rebounds stay live), free-kick walls that jump, offside at pass time,
fouls on late tackles (→ free kick / penalty follow-up moments).

**MomentView** (three.js): night/day stadium, mowing-stripe pitch, goal nets that ripple,
procedural low-poly players with run/kick/dive/celebrate animation, ball spin, shadows,
rain/snow/fog, floodlights, crowd, ad boards. Cameras: behind-player (default), broadcast,
top-down. Aim UI: drawn path, power arc, curl indicator, loft slider, focus meter, predicted
trajectory (length ∝ vision). Goal → slow-motion replay with cinematic camera. Synth audio.

### Balancing targets (engine + view must feel like this)
- Ground pass to an open teammate ≤ 20 m: > 90 % success for passing ≥ 60.
- Placed shot inside the box toward a corner (shooting ~70): 35–50 % goal; central: ~10 %.
- Free kick 20–25 m: a well-executed curl over/around the wall ~25–35 %; random ~5–10 %.
- Penalty to a corner, medium power: ~75–80 %.
- Moments last 5–20 s of real time; ~4–8 moments per 90' for attackers.
- `autoResolve` is slightly worse than skilled manual play.

## 5. Progression & economy targets
- Start age 17, overall ~50–60 by position. Hidden potential 70–95 (most 76–88), shown only
  as a cryptic hint. Young players with minutes grow ~3–7 overall/season; peak 26–30; decline after ~31.
- Wages (weekly): tier-2 youngster €1–3K → top-club star €150–400K. Shop: €2K watch … €80M jet.
- 0–4 offers per window by form, fame, value. Contract talks: wage, years, role, release clause,
  signing bonus, goal bonus. Role promises affect selection & happiness.
- Fame 0–100 drives followers, sponsors, offers, national team call-ups.

## 6. Module map & ownership

| Module | Path | Owner agent | Public API |
|---|---|---|---|
| Core (types, rng, i18n, settings, ratings, util, testing) | `src/core/**` | orchestrator | — |
| World data & generation | `src/world/**` | world | `src/world/api.ts` |
| Calendar, competitions, sim, awards, season rollover | `src/competition/**` | competition | `src/competition/api.ts` |
| Player life, progression, economy, transfers | `src/career/**` | career | `src/career/api.ts` |
| Procedural narrative, events, storylines, commentary | `src/narrative/**` | narrative | `src/narrative/api.ts` |
| Claude narrator | `src/ai/**` | ai | `src/ai/api.ts` |
| Real-time moment engine | `src/match/engine/**` | engine | `src/match/engine/api.ts` |
| 3D view, input, audio | `src/match/view/**`, `src/audio/**` | view | `src/match/view/api.ts`, `src/audio/api.ts` |
| Match flow + match/drill screens | `src/match/flow/**`, `src/ui/screens/match/**` | flow | `src/match/flow/api.ts` |
| Game controller, saves, React store | `src/game/**` | game | `src/game/api.ts` |
| UI shell: layout, overlays, avatar, title, new career, hub, settings, inbox, press | `src/ui/Layout.tsx`, `src/ui/GlobalOverlays.tsx`, `src/ui/components/Avatar.tsx`, `src/ui/screens/{Title,NewCareer,Hub,Settings,Inbox,Press}Screen.tsx`, `src/ui/screens/shell/**` | ui-shell | — |
| UI life screens | `src/ui/screens/{Training,Lifestyle,People,Transfers,Competitions,News,Social,Career,Club,Legacy}Screen.tsx`, `src/ui/screens/life/**` | ui-life | — |

Shared, orchestrator-owned (read-only for agents unless stated): `src/core/**`,
`src/ui/components/kit.tsx`, `src/ui/router.ts`, `src/ui/App.tsx`, `src/ui/screens/index.ts`,
`src/main.tsx`, `src/styles.css`, `package.json`, configs.
Allowed shared edits: **append-only** optional fields / new types in `src/core/types.ts`
when genuinely required (report them); new entries in `src/ui/components/icons.ts`.

## 7. Engineering rules

- TypeScript strict. Import other modules **only through their `api.ts`** (and `src/core/**`).
  Keep every exported signature in your `api.ts` exactly; you may add new exports.
  Implementation can live in any files inside your own directory.
- Randomness only through `Rng` (seeded). Never `Math.random()` in game logic
  (OK in purely cosmetic view code). Game state must stay JSON-serializable.
- i18n: `registerStrings('<namespace>', { tr, en })` in your module; `t('<ns>.<key>')`.
  Namespaces: world, comp, career, narr, ai, engine, view, match, game, shell, life.
  Generated narrative text is produced in `state.lang` / `ctx.lang`.
- Data-driven icons use names from `src/ui/components/icons.ts`.
- UI uses the kit (`src/ui/components/kit.tsx`), Tailwind tokens (`bg-panel`, `text-accent`,
  `text-gold`, `border-line`, `font-display` …), `framer-motion` for motion, `lucide-react`.
  Mobile-first responsive (works at 375 px wide) and keyboard/mouse on desktop.
- Tests: vitest in `src/<module>/__tests__/*.test.ts`. Use `makeTestState()` from
  `src/core/testing.ts` to avoid depending on unfinished modules.
- Don't install packages. Available: react 19, three 0.186, @anthropic-ai/sdk, zod 4,
  idb-keyval, lucide-react, clsx, framer-motion, tailwind 4, vitest.
- Commands: `npx tsc --noEmit -p .`, `npx vitest run src/<module>`, `npx vite build`.
