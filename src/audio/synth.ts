/**
 * WebAudio synthesizer: every sound in the game is generated here (no asset files).
 * Graph:  voices → sfxBus ─┐
 *         crowd  → crowdBus → crowdMuffle ─┤→ master → compressor → destination
 *         (both also send into a generated stadium reverb)
 * All entry points are exception-safe and no-ops until an AudioContext exists.
 */
export type Sfx = 'kick_soft' | 'kick_hard' | 'whistle_short' | 'whistle_long' | 'whistle_final' | 'net' | 'post' | 'bounce' | 'save' | 'click' | 'notify' | 'cash' | 'levelup' | 'tackle';
export type CrowdBurst = 'cheer' | 'goal' | 'groan' | 'ooh' | 'boo' | 'applause';

export interface Volumes { master: number; sfx: number; crowd: number; muted: boolean }

type Ctx = AudioContext;

interface Bed {
  sources: AudioScheduledSourceNode[];
  murmur: GainNode;
  murmurFilter: BiquadFilterNode;
  chatter: GainNode;
  rumble: GainNode;
  voices: GainNode;
  swell: GainNode;
}

function audioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Synth {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private crowdBus!: GainNode;
  private muffle!: BiquadFilterNode;
  private reverbIn!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private brown!: AudioBuffer;
  private bed: Bed | null = null;
  private crowdLevel = 0;
  private swellTimer: ReturnType<typeof setTimeout> | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  private lastPlayed = new Map<string, number>();
  private volumes: Volumes = { master: 0.8, sfx: 0.9, crowd: 0.7, muted: false };

  get ready(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  get context(): Ctx | null {
    return this.ctx;
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const C = audioContextCtor();
        if (!C) return;
        this.ctx = new C();
        this.build();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      if (this.crowdLevel > 0 && !this.bed) this.startBed();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const m = v.muted ? 0 : Math.max(0, Math.min(1, v.master));
    this.master.gain.setTargetAtTime(m, now, 0.05);
    this.sfxBus.gain.setTargetAtTime(Math.max(0, Math.min(1, v.sfx)), now, 0.05);
    this.crowdBus.gain.setTargetAtTime(Math.max(0, Math.min(1, v.crowd)), now, 0.05);
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfxBus = ctx.createGain();
    this.crowdBus = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.muffle.Q.value = 0.5;
    this.sfxBus.connect(this.master);
    this.crowdBus.connect(this.muffle);
    this.muffle.connect(this.master);

    // Stadium reverb from generated impulse response.
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.6, 2.8);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.32;
    this.reverbIn.connect(conv);
    conv.connect(this.master);

    this.white = this.noiseBuffer('white', 2);
    this.pink = this.noiseBuffer('pink', 4);
    this.brown = this.noiseBuffer('brown', 4);
    this.setVolumes(this.volumes);
  }

  private noiseBuffer(kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // Crossfade the loop seam.
    const fade = Math.min(2048, len >> 4);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
    }
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ───────────── building blocks ─────────────

  private track<T extends AudioScheduledSourceNode>(src: T): T {
    this.active.add(src);
    src.onended = () => this.active.delete(src);
    return src;
  }

  private noise(buf: AudioBuffer, when: number, dur: number, loop = false): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    const offset = Math.random() * Math.max(0, buf.duration - dur - 0.01);
    s.start(when, loop ? Math.random() * buf.duration : offset);
    if (!loop) s.stop(when + dur + 0.05);
    return this.track(s);
  }

  private osc(type: OscillatorType, freq: number, when: number, dur: number): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    o.start(when);
    o.stop(when + dur + 0.05);
    return this.track(o);
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.8): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Gain with an attack/decay envelope. */
  private env(when: number, peak: number, attack: number, decay: number, hold = 0): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + Math.max(0.002, attack));
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), when + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + Math.max(0.01, decay));
    return g;
  }

  private out(node: AudioNode, bus: 'sfx' | 'crowd', reverb = 0): void {
    node.connect(bus === 'sfx' ? this.sfxBus : this.crowdBus);
    if (reverb > 0) {
      const send = this.ctx!.createGain();
      send.gain.value = reverb;
      node.connect(send);
      send.connect(this.reverbIn);
    }
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(key) ?? -1e9;
    if (now - last < ms) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  // ───────────── sound effects ─────────────

  play(sfx: Sfx, volume = 1): void {
    if (!this.ready) return;
    if (this.throttle(sfx, sfx === 'bounce' ? 70 : 25)) return;
    const t = this.ctx!.currentTime + 0.005;
    const v = Math.max(0, Math.min(2, volume));
    switch (sfx) {
      case 'kick_soft': this.kick(t, 0.55 * v, false); break;
      case 'kick_hard': this.kick(t, 1.0 * v, true); break;
      case 'whistle_short': this.whistle(t, 0.24, 0.5 * v); break;
      case 'whistle_long': this.whistle(t, 0.9, 0.5 * v); break;
      case 'whistle_final':
        this.whistle(t, 0.26, 0.5 * v);
        this.whistle(t + 0.42, 0.26, 0.5 * v);
        this.whistle(t + 0.84, 1.25, 0.55 * v);
        break;
      case 'net': this.net(t, v); break;
      case 'post': this.post(t, v); break;
      case 'bounce': this.bounce(t, 0.35 * v); break;
      case 'save': this.save(t, v); break;
      case 'tackle': this.tackle(t, v); break;
      case 'click': this.click(t, 0.22 * v); break;
      case 'notify': this.notify(t, 0.3 * v); break;
      case 'cash': this.cash(t, 0.35 * v); break;
      case 'levelup': this.levelup(t, 0.32 * v); break;
    }
  }

  private kick(t: number, v: number, hard: boolean): void {
    const ctx = this.ctx!;
    // Body thump: fast pitch drop.
    const o = this.osc('sine', hard ? 170 : 140, t, 0.2);
    o.frequency.exponentialRampToValueAtTime(48, t + (hard ? 0.11 : 0.08));
    const g = this.env(t, v * (hard ? 0.95 : 0.7), 0.003, hard ? 0.17 : 0.12);
    o.connect(g);
    this.out(g, 'sfx', hard ? 0.25 : 0.12);
    // Leather slap.
    const n = this.noise(this.white, t, 0.05);
    const hp = this.filter('bandpass', hard ? 2600 : 3200, 0.9);
    const ng = this.env(t, v * (hard ? 0.55 : 0.32), 0.001, hard ? 0.045 : 0.03);
    n.connect(hp); hp.connect(ng);
    this.out(ng, 'sfx', 0.15);
    if (hard) {
      const p = this.osc('triangle', 320, t, 0.08);
      p.frequency.exponentialRampToValueAtTime(110, t + 0.05);
      const pg = this.env(t, v * 0.3, 0.002, 0.06);
      p.connect(pg);
      this.out(pg, 'sfx');
    }
    void ctx;
  }

  private whistle(t: number, dur: number, v: number): void {
    const ctx = this.ctx!;
    const base = rand(2850, 3250);
    const o = this.osc('sine', base, t, dur);
    // Pea-whistle trill: fast FM with a little drift.
    const lfo = this.osc('sine', rand(26, 34), t, dur);
    const depth = ctx.createGain();
    depth.gain.value = rand(110, 180);
    lfo.connect(depth);
    depth.connect(o.frequency);
    o.frequency.setValueAtTime(base * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.015);
    g.gain.setValueAtTime(v, t + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    // Breath.
    const n = this.noise(this.white, t, dur);
    const bp = this.filter('bandpass', base, 6);
    const ng = ctx.createGain();
    ng.gain.value = v * 0.25;
    n.connect(bp); bp.connect(ng); ng.connect(g);
    // Second harmonic for bite.
    const h = this.osc('sine', base * 2, t, dur);
    const hg = ctx.createGain();
    hg.gain.value = 0.08;
    h.connect(hg); hg.connect(g);
    depth.connect(h.frequency);
    this.out(g, 'sfx', 0.35);
  }

  private net(t: number, v: number): void {
    const n = this.noise(this.white, t, 0.6);
    const bp = this.filter('bandpass', 4200, 0.9);
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.45);
    const g = this.env(t, 0.45 * v, 0.015, 0.5);
    // Rustle amplitude modulation.
    const am = this.ctx!.createGain();
    am.gain.value = 0.6;
    const lfo = this.osc('square', 32, t, 0.6);
    const lg = this.ctx!.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg); lg.connect(am.gain);
    n.connect(bp); bp.connect(am); am.connect(g);
    this.out(g, 'sfx', 0.2);
  }

  private post(t: number, v: number): void {
    const f0 = rand(410, 470);
    const partials: [number, number, number][] = [[1, 0.5, 1.6], [2.76, 0.32, 1.1], [5.4, 0.2, 0.7], [8.93, 0.12, 0.45], [13.3, 0.06, 0.3]];
    for (const [ratio, amp, dec] of partials) {
      const o = this.osc('sine', f0 * ratio, t, dec);
      const g = this.env(t, amp * v * 0.7, 0.002, dec);
      o.connect(g);
      this.out(g, 'sfx', 0.35);
    }
    const n = this.noise(this.white, t, 0.04);
    const hp = this.filter('highpass', 3000, 0.7);
    const ng = this.env(t, 0.35 * v, 0.001, 0.03);
    n.connect(hp); hp.connect(ng);
    this.out(ng, 'sfx');
  }

  private bounce(t: number, v: number): void {
    const o = this.osc('sine', 115, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    const g = this.env(t, v, 0.002, 0.09);
    o.connect(g);
    this.out(g, 'sfx', 0.08);
  }

  private save(t: number, v: number): void {
    const n = this.noise(this.white, t, 0.12);
    const bp = this.filter('bandpass', 950, 1.4);
    const g = this.env(t, 0.75 * v, 0.002, 0.1);
    n.connect(bp); bp.connect(g);
    this.out(g, 'sfx', 0.2);
    const o = this.osc('sine', 130, t, 0.14);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    const og = this.env(t, 0.5 * v, 0.003, 0.12);
    o.connect(og);
    this.out(og, 'sfx');
  }

  private tackle(t: number, v: number): void {
    const n = this.noise(this.brown, t, 0.25);
    const lp = this.filter('lowpass', 520, 0.7);
    const g = this.env(t, 0.9 * v, 0.004, 0.2);
    n.connect(lp); lp.connect(g);
    this.out(g, 'sfx', 0.1);
    const s = this.noise(this.white, t + 0.02, 0.3);
    const bp = this.filter('bandpass', 2200, 1.1);
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.28);
    const sg = this.env(t + 0.02, 0.22 * v, 0.02, 0.25);
    s.connect(bp); bp.connect(sg);
    this.out(sg, 'sfx');
  }

  private click(t: number, v: number): void {
    const o = this.osc('sine', 1500, t, 0.04);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.025);
    const g = this.env(t, v, 0.001, 0.03);
    o.connect(g);
    this.out(g, 'sfx');
  }

  private notify(t: number, v: number): void {
    [[880, 0, 0.16], [1318.5, 0.09, 0.32]].forEach(([f, d, len]) => {
      const o = this.osc('triangle', f, t + d, len);
      const g = this.env(t + d, v, 0.004, len);
      o.connect(g);
      this.out(g, 'sfx', 0.2);
    });
  }

  private cash(t: number, v: number): void {
    const n = this.noise(this.white, t, 0.05);
    const bp = this.filter('bandpass', 1800, 1);
    const ng = this.env(t, v * 0.8, 0.001, 0.05);
    n.connect(bp); bp.connect(ng);
    this.out(ng, 'sfx');
    [2093, 2637, 3136, 4186, 5274].forEach((f, i) => {
      const d = 0.06 + i * 0.022;
      const o = this.osc('sine', f, t + d, 0.7);
      const g = this.env(t + d, v * (0.5 - i * 0.06), 0.002, 0.6);
      o.connect(g);
      this.out(g, 'sfx', 0.3);
    });
  }

  private levelup(t: number, v: number): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const d = i * 0.085;
      const last = i === 3;
      const o = this.osc('triangle', f, t + d, last ? 0.55 : 0.14);
      const g = this.env(t + d, v, 0.004, last ? 0.5 : 0.12);
      o.connect(g);
      this.out(g, 'sfx', 0.3);
    });
    for (let i = 0; i < 6; i++) {
      const d = 0.3 + Math.random() * 0.3;
      const o = this.osc('sine', rand(3500, 6500), t + d, 0.12);
      const g = this.env(t + d, v * 0.12, 0.002, 0.1);
      o.connect(g);
      this.out(g, 'sfx', 0.4);
    }
  }

  // ───────────── crowd ─────────────

  setCrowd(level: number): void {
    this.crowdLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    if (!this.ready) return;
    if (!this.bed && this.crowdLevel > 0) this.startBed();
    this.applyBed(0.6);
  }

  setFocus(amount: number): void {
    if (!this.ready) return;
    const a = Math.max(0, Math.min(1, amount));
    this.muffle.frequency.setTargetAtTime(18000 * Math.pow(900 / 18000, a), this.ctx!.currentTime, 0.12);
  }

  private startBed(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const sources: AudioScheduledSourceNode[] = [];
    const swell = ctx.createGain();
    swell.gain.value = 1;
    swell.connect(this.crowdBus);
    const rv = ctx.createGain();
    rv.gain.value = 0.25;
    swell.connect(rv);
    rv.connect(this.reverbIn);

    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(t, Math.random() * buf.duration);
      sources.push(s);
      return s;
    };

    // Murmur: pink noise around the vowel band.
    const murmurFilter = this.filter('bandpass', 650, 0.6);
    const murmur = ctx.createGain();
    murmur.gain.value = 0;
    loop(this.pink).connect(murmurFilter);
    murmurFilter.connect(murmur);
    murmur.connect(swell);

    // Chatter: brighter band with a slow random-ish tremolo.
    const chatterFilter = this.filter('bandpass', 2100, 1.1);
    const chatter = ctx.createGain();
    chatter.gain.value = 0;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.37;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.3;
    lfo.connect(lfoDepth);
    lfoDepth.connect(trem.gain);
    lfo.start(t);
    sources.push(lfo);
    loop(this.white).connect(chatterFilter);
    chatterFilter.connect(trem);
    trem.connect(chatter);
    chatter.connect(swell);

    // Rumble.
    const rumbleFilter = this.filter('lowpass', 260, 0.5);
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    loop(this.brown).connect(rumbleFilter);
    rumbleFilter.connect(rumble);
    rumble.connect(swell);

    // Distant singing: detuned saws through vowel formants.
    const voices = ctx.createGain();
    voices.gain.value = 0;
    const f1 = this.filter('bandpass', 620, 4);
    const f2 = this.filter('bandpass', 1150, 5);
    const vmix = ctx.createGain();
    vmix.gain.value = 0.08;
    for (let i = 0; i < 7; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = rand(190, 300);
      o.detune.value = rand(-25, 25);
      const vib = ctx.createOscillator();
      vib.frequency.value = rand(4, 6);
      const vd = ctx.createGain();
      vd.gain.value = rand(2, 5);
      vib.connect(vd); vd.connect(o.frequency);
      o.connect(f1); o.connect(f2);
      o.start(t); vib.start(t);
      sources.push(o, vib);
    }
    f1.connect(vmix); f2.connect(vmix);
    const vlp = this.filter('lowpass', 1800, 0.5);
    vmix.connect(vlp); vlp.connect(voices);
    voices.connect(swell);

    this.bed = { sources, murmur, murmurFilter, chatter, rumble, voices, swell };
    this.applyBed(1.2);
    this.scheduleSwell();
  }

  private applyBed(tc: number): void {
    const b = this.bed;
    if (!b || !this.ctx) return;
    const L = this.crowdLevel;
    const now = this.ctx.currentTime;
    b.murmur.gain.setTargetAtTime(L <= 0 ? 0 : 0.22 + 0.55 * L, now, tc);
    b.murmurFilter.frequency.setTargetAtTime(480 + 620 * L, now, tc);
    b.chatter.gain.setTargetAtTime(L <= 0 ? 0 : 0.05 + 0.22 * L, now, tc);
    b.rumble.gain.setTargetAtTime(L <= 0 ? 0 : 0.18 + 0.45 * L, now, tc);
    b.voices.gain.setTargetAtTime(Math.max(0, L - 0.45) * 0.9, now, tc * 1.5);
  }

  private scheduleSwell(): void {
    if (this.swellTimer) clearTimeout(this.swellTimer);
    this.swellTimer = setTimeout(() => {
      this.swellTimer = null;
      if (!this.bed || !this.ctx) return;
      const now = this.ctx.currentTime;
      const peak = 1 + rand(0.15, 0.5) * (0.4 + this.crowdLevel);
      const g = this.bed.swell.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(peak, now + rand(0.8, 1.8));
      g.linearRampToValueAtTime(rand(0.85, 1), now + rand(2.6, 4.2));
      this.scheduleSwell();
    }, rand(2500, 6500));
  }

  private stopBed(): void {
    if (this.swellTimer) { clearTimeout(this.swellTimer); this.swellTimer = null; }
    if (!this.bed || !this.ctx) { this.bed = null; return; }
    const b = this.bed;
    const now = this.ctx.currentTime;
    b.swell.gain.setTargetAtTime(0, now, 0.15);
    for (const s of b.sources) { try { s.stop(now + 0.8); } catch { /* already stopped */ } }
    setTimeout(() => { try { b.swell.disconnect(); } catch { /* noop */ } }, 1000);
    this.bed = null;
  }

  /** A formant "voice cloud" — many detuned saws through vowel filters. */
  private vowelCloud(t: number, dur: number, opts: { f0: [number, number]; f0End?: number; formants: [number, number]; voices: number; gain: number; attack: number; release: number }): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + opts.attack);
    g.gain.setValueAtTime(opts.gain, t + Math.max(opts.attack, dur - opts.release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const fa = this.filter('bandpass', opts.formants[0], 5);
    const fb = this.filter('bandpass', opts.formants[1], 6);
    const lp = this.filter('lowpass', 2400, 0.4);
    fa.connect(lp); fb.connect(lp); lp.connect(g);
    for (let i = 0; i < opts.voices; i++) {
      const f = rand(opts.f0[0], opts.f0[1]);
      const o = this.osc('sawtooth', f, t, dur);
      if (opts.f0End) o.frequency.exponentialRampToValueAtTime(f * opts.f0End, t + dur);
      o.detune.value = rand(-30, 30);
      const vg = ctx.createGain();
      vg.gain.value = 1 / opts.voices;
      o.connect(vg); vg.connect(fa); vg.connect(fb);
    }
    this.out(g, 'crowd', 0.4);
  }

  private noiseSwell(t: number, dur: number, peak: number, freq: number, attack: number, q = 0.6, sweepTo?: number): void {
    const n = this.noise(this.pink, t, dur);
    const bp = this.filter('bandpass', freq, q);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g);
    this.out(g, 'crowd', 0.3);
  }

  private clap(t: number, v: number): void {
    const n = this.noise(this.white, t, 0.08);
    const bp = this.filter('bandpass', rand(900, 2200), 1.2);
    const g = this.env(t, v, 0.001, rand(0.04, 0.08));
    n.connect(bp); bp.connect(g);
    this.out(g, 'crowd', 0.25);
  }

  private clapCrowd(t: number, v: number, people = 14): void {
    for (let i = 0; i < people; i++) this.clap(t + rand(-0.03, 0.03), v / Math.sqrt(people));
  }

  burst(kind: CrowdBurst): void {
    if (!this.ready) return;
    if (this.throttle(`burst:${kind}`, 350)) return;
    const t = this.ctx!.currentTime + 0.02;
    switch (kind) {
      case 'cheer':
        this.noiseSwell(t, 3.2, 0.7, 1300, 0.35, 0.5);
        this.vowelCloud(t, 2.8, { f0: [210, 340], f0End: 1.08, formants: [750, 1250], voices: 10, gain: 0.35, attack: 0.3, release: 1.6 });
        break;
      case 'goal': {
        this.noiseSwell(t, 6.5, 1.25, 1100, 0.18, 0.35);
        this.noiseSwell(t, 5.5, 0.6, 300, 0.25, 0.5);
        this.vowelCloud(t, 5.2, { f0: [200, 360], f0End: 1.12, formants: [780, 1300], voices: 14, gain: 0.6, attack: 0.25, release: 2.4 });
        // Air horns.
        [233, 294, 349.2].forEach((f) => {
          const o = this.osc('square', f, t + 0.6, 1.3);
          o.frequency.setValueAtTime(f * 0.97, t + 0.6);
          o.frequency.linearRampToValueAtTime(f, t + 0.75);
          const lp = this.filter('lowpass', 1600, 0.7);
          const g = this.env(t + 0.6, 0.06, 0.05, 0.4, 0.8);
          o.connect(lp); lp.connect(g);
          this.out(g, 'crowd', 0.4);
        });
        // Rhythmic claps + chant: "clap clap — clap clap clap".
        const beat = 0.42;
        const start = t + 1.7;
        const pattern = [0, 1, 2.5, 3, 3.5];
        for (let bar = 0; bar < 3; bar++) {
          for (const p of pattern) {
            const at = start + (bar * 4 + p) * beat;
            this.clapCrowd(at, 0.55);
          }
          this.vowelCloud(start + bar * 4 * beat, beat * 1.8, { f0: [230, 260], formants: [700, 1100], voices: 8, gain: 0.22, attack: 0.05, release: 0.3 });
          this.vowelCloud(start + (bar * 4 + 1) * beat, beat * 1.2, { f0: [290, 320], formants: [400, 2200], voices: 8, gain: 0.18, attack: 0.05, release: 0.3 });
        }
        break;
      }
      case 'groan':
        this.vowelCloud(t, 2.2, { f0: [150, 240], f0End: 0.72, formants: [520, 900], voices: 12, gain: 0.45, attack: 0.15, release: 1.4 });
        this.noiseSwell(t, 2.2, 0.35, 700, 0.15, 0.6, 350);
        break;
      case 'ooh':
        this.vowelCloud(t, 1.7, { f0: [170, 260], f0End: 1.15, formants: [380, 820], voices: 12, gain: 0.5, attack: 0.25, release: 1.0 });
        this.noiseSwell(t, 1.7, 0.3, 600, 0.3, 0.6);
        break;
      case 'boo':
        this.vowelCloud(t, 2.8, { f0: [100, 150], formants: [320, 700], voices: 14, gain: 0.5, attack: 0.3, release: 1.0 });
        break;
      case 'applause': {
        const dur = 3.2;
        for (let i = 0; i < 90; i++) {
          const at = t + Math.pow(Math.random(), 1.4) * dur;
          const fade = 1 - (at - t) / dur;
          this.clap(at, 0.16 * (0.3 + fade));
        }
        this.noiseSwell(t, dur, 0.18, 1600, 0.2, 0.7);
        break;
      }
    }
  }

  stopAll(): void {
    this.stopBed();
    const now = this.ctx?.currentTime ?? 0;
    for (const s of this.active) { try { s.stop(now); } catch { /* not started */ } }
    this.active.clear();
  }
}
