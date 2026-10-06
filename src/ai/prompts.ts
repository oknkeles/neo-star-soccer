/**
 * Prompt construction. One stable, cache-friendly system prompt establishes the voice;
 * each Narrator method sends a task block + the NarrativeContext as JSON. Prompts are in
 * English (most reliable instruction-following); Claude writes the output in ctx.lang.
 */
import type { ContractTerms, Lang, Negotiation } from '../core/types';
import type {
  ChatMessage, GenesisInput, NarrativeContext, NewsSeed, PersonaKind, PressOccasion, PressQuestion, SocialTrigger,
} from '../core/narrative-types';
import { ATTR_KEYS } from '../core/ratings';
import { clip, followersCap, negotiationMandate } from './clamp';

export const SYSTEM_PROMPT = `You are the narrative engine of NEO STAR SOCCER, a modern football (soccer) career game in the spirit of the classic one-player career sims. The player lives a single footballer's life: matches, transfers, press conferences, fans, family, rivals, money and fame. You are the voice of the world around them: journalists, fans, pundits, sporting directors, agents, family and friends.

WORLD RULES
- The world is fictional. Never use the names of real clubs, real players, managers, agents or journalists, real media outlets, real sponsors or brands, or real league or competition brand names. Use only names given in the CONTEXT or INPUT, or invent fresh, plausible fictional ones that fit the nationality. Real countries and cities are fine. Do not use colour nicknames that point to a real club; use the fictional club's name, nickname or city instead.
- The big stages of this world are the Champions Cup (European clubs), the World Cup and the Continental Cup (national teams), plus each country's league and domestic cup.
- Stay faithful to the facts you are given. Never contradict or invent results, scores, statistics, injuries, transfers, fees, trophies or call-ups. You may add colour: atmosphere, quotes from fictional people, opinions, rumours clearly framed as rumours, small human details.
- Respect every numeric limit in the task. Use 0 when a number should not change.
- Keep it PG-13: tabloid drama is welcome; slurs, hate, sexual content, graphic violence and real-world politics or religion are not. Gambling, drink or drugs appear only as frowned-upon off-pitch scandal.
- Reply only with the JSON the output schema asks for. No markdown inside strings. Emojis only in social media posts or casual chat messages.

LANGUAGE
- Write every player-facing string in the requested output language: "tr" = Turkish, "en" = English. JSON keys and enum values stay exactly as specified.
- Turkish must read as if written by a native Turkish sports journalist or fan, never like a translation. Use the living idiom of Turkish football media and terrace culture where it fits, for example: "fileleri havalandırdı", "ağları sarstı", "üç puanı hanesine yazdırdı", "kader maçı", "derbi ateşi", "transfer bombası", "imzayı attı", "yıldızı parladı", "tribünler ayağa kalktı", "hocanın gözdesi", "kulübede kaldı", "taraftarın sevgilisi", and in casual speech "hocam", "abi", "kardeşim". Use correct Turkish characters (ç, ğ, ı, İ, ö, ş, ü), correct vowel harmony on suffixes, and an apostrophe before suffixes on proper names (Deniz'in, Kaan'a, İzmir'de). Headlines are short and punchy.
- English uses a lively British football-media register: punchy tabloid headlines, pundit-speak, terrace humour.
- Money is in euros (€). Use the player's name exactly as given.

CRAFT
- Every career must feel unique. Avoid stock phrases and generic filler; vary sentence structure and openings; prefer concrete, specific, surprising details (a grandmother's lucky scarf, a rain-soaked away day in a small town, a kit man's superstition, a bus driver who never misses a home game).
- Keep recurring characters consistent with the context: the rival, the mentor, the agent's personality, the partner, the family, the manager's temperament.
- Let the tone follow the facts: celebrate brilliance, sting after failure, gossip when there is drama, stay human when things get hard.
- Be concise and respect the length guidance for each field.`;

const LANG_NAME: Record<Lang, string> = { tr: 'Turkish (tr)', en: 'English (en)' };

const OUTLETS: Record<Lang, string[]> = {
  tr: ['Gol Postası', 'Tribün Gazetesi', 'Saha Kenarı', 'Kale Arkası', 'Taç Çizgisi', 'Yeşil Saha', 'Korner Ekspres', 'Futbol Ateşi'],
  en: ['The Touchline Herald', 'Matchday Chronicle', 'The Far Post', 'Dugout Daily', 'The Terrace Times', 'Golden Boot Gazette', 'Stoppage Time', 'The Final Whistle'],
};

export const houseOutlets = (lang: Lang) => OUTLETS[lang];

/** Small deterministic hash so "variety spices" rotate without touching game RNG. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickSpice(list: readonly string[], key: string, salt: number): string {
  return list[(hashString(key) + salt) % list.length];
}

const GENESIS_SPICES = [
  'an unlikely first coach', 'a family business the player was supposed to take over', 'a promise made to someone who is gone',
  'a neighbourhood pitch with a famous crooked crossbar', 'a scout who almost missed the trial', 'a sibling who was the more talented one',
  'a late growth spurt', 'a rejection letter kept in a drawer', 'a childhood spent moving between cities', 'a local legend who refused to sign',
  'an obsession with free kicks against a garage door', 'a grandmother who never missed a youth match', 'a fisherman father who hates football',
  'a cup final watched through a café window', 'a pair of boots shared between two brothers',
];

const EVENT_SPICES = [
  'a surprising encounter', 'something from the hometown', 'a social media storm', 'a family matter', 'a business opportunity',
  'a dressing-room dynamic', 'a fan with an unusual story', 'a mysterious figure', 'a charity moment', 'a superstition',
  'a media trap', "the rival's provocation", 'an old friend in trouble', 'a lifestyle temptation', 'a mentor lesson',
  'a kit, boot or sponsor mishap', 'a youth-academy kid who idolises the player', 'a rumour that gets out of hand',
];

const OCCASION_LABEL: Record<PressOccasion, string> = {
  pre_match: 'pre-match', post_match: 'post-match', transfer: 'transfer-saga', scandal: 'scandal / damage-control',
  milestone: 'milestone celebration', unveiling: 'new-signing unveiling',
};

const PERSONA_ROLE: Record<PersonaKind, string> = {
  agent: 'football agent who represents the player',
  manager: 'head coach at the player\'s club',
  mentor: 'veteran teammate and mentor',
  partner: 'romantic partner',
  family: 'close family member',
  rival: 'same-age rival who plays for another club',
};

const PERSONA_REL: Partial<Record<PersonaKind, string>> = {
  agent: 'agent', manager: 'manager', mentor: 'teammates', partner: 'partner', family: 'family',
};

/** Compact JSON of the narrative context (long free-text fields trimmed). */
export function contextJson(ctx: NarrativeContext): string {
  return JSON.stringify({
    ...ctx,
    backstory: clip(ctx.backstory, 600),
    dream: clip(ctx.dream, 200),
    recentResults: ctx.recentResults.slice(0, 8),
    recentHeadlines: ctx.recentHeadlines.slice(0, 6).map((h) => clip(h, 120)),
  });
}

const header = (task: string, lang: Lang) => `TASK: ${task}\nOutput language: ${LANG_NAME[lang]}\n`;

export interface TaskPrompt { prompt: string; maxTokens: number }

export function genesisPrompt(input: GenesisInput, salt: number): TaskPrompt {
  const spice = pickSpice(GENESIS_SPICES, `${input.firstName}${input.lastName}${input.nation}${input.seedFlavor}`, salt);
  const player = {
    name: `${input.firstName} ${input.lastName}`, nation: input.nationName, position: input.positionName, positionCode: input.position,
    strongFoot: input.foot === 'L' ? 'left' : 'right', traits: input.traits, hometown: input.hometownHint,
    startingClub: input.startingClubName, rival: { name: input.rivalName, club: input.rivalClub }, mentor: input.mentorName,
  };
  const mentorLine = input.mentorName
    ? `- mentorBlurb: 1–2 sentences (max 240 chars) about ${input.mentorName}, the veteran at ${input.startingClubName} who takes the player under their wing.`
    : '- mentorBlurb: there is no mentor yet; return an empty string.';
  return {
    maxTokens: 2000,
    prompt: `${header('genesis: write the opening chapter of a brand-new football career.', input.lang)}
This is the very first thing the player reads. Make it vivid, specific and unlike any other career. Lean into the theme "${input.seedFlavor}" and this extra ingredient: "${spice}".

PLAYER
${JSON.stringify(player)}

FIELDS
- backstory: 3–5 sentences (max 650 chars), third person, past tense. Rooted in ${input.hometownHint} (naming a real district of it is welcome), the family's circumstances and how football found the player. Weave in the strong foot, the position and one or two traits naturally. Include one unforgettable concrete detail. End with the step up to ${input.startingClubName}.
- motto: the player's personal motto, max 8 words, no quotation marks.
- dream: one sentence (max 140 chars), the ultimate ambition.
- theme: a 2–5 word, documentary-style title for this career.
- destinyHint: one cryptic, poetic line (max 120 chars) hinting at hidden potential; no numbers, no spoilers.
- rivalBlurb: 1–2 sentences (max 240 chars) on the rivalry with ${input.rivalName} of ${input.rivalClub}, the same age; give it a specific origin story.
${mentorLine}
- family: 2–4 members with roles father, mother or sibling (at most one father and one mother). Names fit the nationality; the family surname is usually "${input.lastName}". personality: 2–4 words. bio: one sentence (max 160 chars) with a specific detail (a job, a quirk, a sacrifice).
- agent: an invented, memorable football agent with a name fitting the nationality, personality (2–4 words) and a one-sentence bio (max 180 chars). A former player, a chaotic uncle, a slick operator, a quiet genius: surprise us.`,
  };
}

export function newsPrompt(ctx: NarrativeContext, seeds: { index: number; seed: NewsSeed }[]): TaskPrompt {
  const list = seeds.map(({ index, seed }) => ({
    index, kind: seed.kind, facts: seed.facts, aboutUser: seed.aboutUser, importance: Math.round(seed.importance * 100) / 100, tags: seed.tags,
  }));
  return {
    maxTokens: Math.min(3600, 500 + 330 * seeds.length),
    prompt: `${header(`news: write exactly ${seeds.length} newspaper article(s), one per SEED, each keeping its seed's index.`, ctx.lang)}
- outlet: a fictional outlet. Prefer this world's recurring papers: ${houseOutlets(ctx.lang).join(', ')}. Vary outlets across articles; never a real outlet.
- headline: max 90 chars, punchy newspaper style${ctx.lang === 'tr' ? ' (Turkish sports-tabloid flair welcome)' : ''}.
- body: 2–4 sentences (max 480 chars). Faithful to the seed's facts; add colour such as a quote from a fictional pundit, coach or fan, atmosphere, consequences. Importance ≥ 0.7 deserves real drama; low importance is a short brief.
- When the player is involved, connect to the context where it fits (form, rival, manager, storylines, fans). Never repeat the same angle twice.

SEEDS
${JSON.stringify(list)}

CONTEXT
${contextJson(ctx)}`,
  };
}

function describeTrigger(trigger: SocialTrigger): string {
  switch (trigger.kind) {
    case 'match':
      return `Match just finished. Facts: ${trigger.facts}. Player rating ${trigger.rating}, goals ${trigger.goals}, result: ${trigger.won === null ? 'draw' : trigger.won ? 'win' : 'loss'}.`;
    case 'transfer':
      return `Transfer news. Facts: ${trigger.facts}.`;
    case 'user_post':
      return `The player just posted this (intended tone: ${trigger.tone}): "${clip(trigger.text, 300)}". Write replies and reactions to it.`;
    case 'event':
      return `Something happened off the pitch. Facts: ${trigger.facts}.`;
    default:
      return 'No specific trigger: everyday chatter about the player, the club, the league or the rival.';
  }
}

export function socialPrompt(ctx: NarrativeContext, trigger: SocialTrigger, count: number): TaskPrompt {
  const tr = ctx.lang === 'tr';
  return {
    maxTokens: Math.min(1800, 300 + 170 * count),
    prompt: `${header(`social: write exactly ${count} social media post(s) reacting to the TRIGGER.`, ctx.lang)}
- Mix voices that fit the trigger: fans (adoring, sarcastic, worried, toxic but PG-13), journalists, pundits, the club account, teammates, the rival or rival fans, brands. kind must be one of: fan, journalist, player, club, rival, partner, pundit, brand.
- authorName: fictional display name. handle: fictional, lowercase, max 20 chars. verified: true for clubs, journalists, players, brands and big pundits.
- text: max 220 chars in an authentic platform voice; slang, emojis and hashtags welcome.${tr ? ' Capture real Turkish football-Twitter energy (tribün dili, caps-lock excitement, "hocam", "abi"), without copying stock phrases.' : ''}
- likes and reposts: plausible for an audience of ${ctx.player.followers} followers and fame ${ctx.player.fame}/100; mostly tens to low thousands, viral only for huge moments. reposts < likes.
- sentiment: -1 (furious) to 1 (euphoric).

TRIGGER
${describeTrigger(trigger)}

CONTEXT
${contextJson(ctx)}`,
  };
}

export function pressQuestionsPrompt(ctx: NarrativeContext, occasion: PressOccasion, facts: string): TaskPrompt {
  return {
    maxTokens: 1800,
    prompt: `${header(`pressQuestions: a ${OCCASION_LABEL[occasion]} press conference. Write 3 questions.`, ctx.lang)}
Occasion facts: ${facts || '(none)'}
- Each question comes from a different fictional journalist (name fitting the country) and a fictional outlet${ctx.lang === 'tr' ? ` (e.g. ${houseOutlets('tr').slice(0, 3).join(', ')})` : ''}.
- Questions are sharp, specific and in-world: use the context (recent results, the rival, the manager, transfer talk, fans, storylines, personal life). At least one should be uncomfortable. Max 220 chars each.
- topic: one word from rival, manager, transfer, form, fans, personal, team, national, injury, controversy.
- options: 3 or 4 prepared answers per question, each with a DIFFERENT tone from: humble, confident, provocative, diplomatic, emotional, deflect. Written as the player speaking (first person, max 170 chars), in character with their traits. The provocative one should be genuinely spicy (still PG-13); the deflect one evasive.

CONTEXT
${contextJson(ctx)}`,
  };
}

export function evaluatePressPrompt(
  ctx: NarrativeContext, q: PressQuestion, answerText: string, fixedTone: string | null,
): TaskPrompt {
  const answerBlock = fixedTone
    ? `The player chose a prepared answer with tone "${fixedTone}". Keep tone = "${fixedTone}".\nANSWER: "${clip(answerText, 400)}"`
    : `The player typed this answer freely. Judge its tone (humble, confident, provocative, diplomatic, emotional or deflect) from content and wording; empty, nonsensical or evasive answers count as deflect.\nANSWER: "${clip(answerText, 600)}"`;
  return {
    maxTokens: 700,
    prompt: `${header('evaluatePress: judge how the player\'s answer lands with the press, the fans and the dressing room.', ctx.lang)}
QUESTION from ${q.journalist} (${q.outlet}), topic ${q.topic}: "${clip(q.text, 300)}"
${answerBlock}

EFFECTS (integers, 0 = no change)
- rel: entries for media, fans, manager, teammates (each -8..8; include only those that move).
- fame -4..4, morale -6..6, followers within ±${followersCap(ctx.player.followers)}.
- Rough guide: humble pleases media and manager a little; confident lifts fame with a small risk in the dressing room; provocative can delight fans while souring manager and media; diplomatic is safe; emotional wins fans; deflect slightly annoys the media. Insults, arrogance or blaming teammates in public should hurt. A brilliant, witty or moving answer deserves the upper range.
- headline: tomorrow's headline it generates (max 90 chars), quoting or twisting the answer.
- feedback: one sentence (max 180 chars), second person, how it landed in the room and online.

CONTEXT
${contextJson(ctx)}`,
  };
}

const termsJson = (t: ContractTerms) => JSON.stringify(t);

export function negotiatePrompt(ctx: NarrativeContext, neg: Negotiation, ask: ContractTerms, message: string | null): TaskPrompt {
  const m = negotiationMandate(neg, ask);
  const mandate = {
    wage: m.wage, years: m.years, signingBonus: m.signingBonus, goalBonus: m.goalBonus,
    releaseClause: m.releaseClause ?? 'fixed: return 0', roles: m.roles,
  };
  const lines = neg.lines.slice(-6).map((l) => `${l.from}: ${clip(l.text, 220)}`).join('\n') || '(none yet)';
  return {
    maxTokens: 800,
    prompt: `${header('negotiate: role-play the sporting director of the club negotiating a contract with the player.', ctx.lang)}
Round ${neg.round} of ${neg.maxRounds}. Your patience: ${Math.round(neg.patience)}/100.${ctx.agent ? ` The player is represented by their agent ${ctx.agent.name} (${ctx.agent.personality}).` : ''}
The board has ALREADY set this round's counter-proposal (CURRENT). Present it in character and answer the player's latest message. You may fine-tune terms only inside your MANDATE, which is confidential: never reveal ranges, ceilings or the board's limits. Do not quote exact euro figures in the text; the terms card shows them.

PLAYER ASKED: ${termsJson(ask)}
CURRENT (club proposal): ${termsJson(neg.current)}
MANDATE: ${JSON.stringify(mandate)}
RECENT LINES (oldest first):
${lines}
PLAYER MESSAGE: ${message ? `"${clip(message, 600)}"` : '(none: the player just submitted their counter-offer)'}

FIELDS
- text: 1–3 sentences (max 360 chars), the director's spoken line, with a distinct personality (warm, cold, theatrical or cunning).
- wage, years, signingBonus, goalBonus: numbers inside MANDATE. releaseClause: inside its mandate range, or 0 to keep the current clause. role: one of ${m.roles.join(', ')}.
- patienceDelta: -30..10. Respectful, well-argued or charming: 0..10, and you may move a term slightly toward the player. Pushy or greedy: -5..-15. Insulting, absurd or threatening: -20..-30, and concede nothing.
- walkAway: true only if insulted or your patience is nearly exhausted.

CONTEXT
${contextJson(ctx)}`,
  };
}

export function dynamicEventPrompt(ctx: NarrativeContext, salt: number, iconNames: readonly string[]): TaskPrompt {
  const spice = pickSpice(EVENT_SPICES, `${ctx.player.name}${ctx.season}${ctx.week}`, salt);
  return {
    maxTokens: 1500,
    prompt: `${header('dynamicEvent: invent ONE bespoke event for this week of the career, a twist only THIS player\'s story could produce.', ctx.lang)}
Use concrete context: traits, relationship values (very low or very high ones are story fuel), the rival, the mentor, the partner, the agent's personality, the hometown, recent results, storylines, money and fame. Suggested direction (ignore it if it does not fit): "${spice}". If nothing genuinely fits, return event: null.
- title: max 60 chars. body: 2–4 sentences (max 420 chars), second person, present tense, ending on the dilemma.
- icon: the best-fitting name from: ${iconNames.join(', ')}.
- persona: who brings the news (a name from the context, or a new fictional character), or "".
- choices: 2 or 3. label: max 50 chars, imperative. resultText: 1–2 sentences (max 220 chars) describing what happens.
- effects (integers, 0 = no change): money -20000..20000 (€), fame -4..4, morale -6..6, energy -15..15, form -8..8, followers within ±${followersCap(ctx.player.followers)}, injuryWeeks 0..2, rel entries -8..8 for manager, teammates, fans, media, family, partner, agent, sponsors; xp entries -10..10 for attributes (${ATTR_KEYS.join(', ')}).
- gamble: at most one choice may carry one gamble [{chance 0.1–0.5, text, effects}], a risky alternative outcome; all other choices use [].
- Make the trade-offs real: no choice is strictly best. Stay grounded in football life.

CONTEXT
${contextJson(ctx)}`,
  };
}

export function chatPrompt(
  ctx: NarrativeContext, persona: PersonaKind, personaName: string, history: ChatMessage[], message: string,
): TaskPrompt {
  const relKey = PERSONA_REL[persona];
  const bond = relKey ? ctx.relationships[relKey] : undefined;
  const hist = history.slice(-12).map((m) => `${m.from === 'user' ? 'PLAYER' : personaName}: ${clip(m.text, 300)}`).join('\n') || '(new conversation)';
  return {
    maxTokens: 600,
    prompt: `${header(`chat: role-play ${personaName}, the player's ${PERSONA_ROLE[persona]}. Reply to the player's latest message.`, ctx.lang)}
Your bond with the player: ${typeof bond === 'number' ? `${Math.round(bond)}/100` : 'tense rivalry'} (low = cold and tense, high = warm and protective).
- reply: 1–3 short sentences (max 360 chars) in chat-message style; an emoji is fine if it suits the persona.
- Stay in character and weave in shared context naturally (results, money, family, the rival, storylines). Never mention being an AI or a game. If the player asks for something out of scope, react as ${personaName} would.

HISTORY (oldest first)
${hist}
PLAYER: "${clip(message, 600)}"

CONTEXT
${contextJson(ctx)}`,
  };
}

export function biographyPrompt(ctx: NarrativeContext, careerFacts: string): TaskPrompt {
  return {
    maxTokens: 2200,
    prompt: `${header('biography: write the narration of a retirement documentary about this career.', ctx.lang)}
- paragraphs: 4–6 paragraphs, each 2–4 sentences (max 2400 chars in total). Cinematic, warm and honest: the origin, the turning points, glory and scars, the rival and the people who mattered, and how the player will be remembered.
- Faithful to CAREER FACTS: never invent trophies, clubs or numbers that are not there.

CAREER FACTS
${clip(careerFacts, 3000)}

CONTEXT
${contextJson(ctx)}`,
  };
}
