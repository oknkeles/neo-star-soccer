/**
 * mountMomentView2D: the real-time moment as a clean top-down canvas (HaxBall / ballball.club
 * style). Owns the rAF loop (engine.step → draw), wires the assisted controls, audio, the
 * outcome beat, a simple replay and touch controls. Same contract as the 3D mountMomentView.
 */
import type { CameraMode, MomentEvent, MomentOutcome, MomentSetup, ReplayFrame, Vec2, Vec3 } from '../../core/types';
import type { MomentEngine } from '../engine/api';
import type { MomentViewHandle, MomentViewOptions } from '../view/api';
import { audio } from '../../audio/api';
import { t } from '../../core/i18n';
import { onSettingsChange } from '../../core/settings';
import { CONTROL_ROWS, Controls } from '../controls/controls';
import { mountTouchControls, type TouchUi } from '../controls/touch';
import {
  ACCENT, GW, HL, HW, drawBall, drawBanner, drawFlash, drawGoals, drawHint, drawLabel, drawMinimap,
  drawOffscreenArrow, drawPath, drawPitch, drawPlayers, drawPowerBar, drawTarget, drawTimeBar, spawnConfetti,
  stepConfetti, teamLooks, type Cam, type Confetto, type PlayerMeta, type Snap,
} from './render';
import '../view/strings';
import './strings';

const FINISH_HOLD = 0.35;
const HINT_TIME = 7;
const ZOOM: Record<CameraMode, number> = { behind: 50, broadcast: 64, top: 84 };

type Tone = 'great' | 'good' | 'bad' | 'neutral';
function toneOf(o: MomentOutcome | null): Tone {
  if (!o) return 'neutral';
  if (o === 'goal' || o === 'assist' || o === 'penalty_won' || o === 'tackle_won' || o === 'interception') return 'great';
  if (o === 'chance_created' || o === 'pass_completed' || o === 'foul_won' || o === 'cleared' || o === 'saved' || o === 'woodwork' || o === 'drill_complete') return 'good';
  if (o === 'conceded' || o === 'lost_ball' || o === 'tackle_lost' || o === 'foul_conceded' || o === 'offside') return 'bad';
  return 'neutral';
}

export function mountMomentView2DImpl(container: HTMLElement, engine: MomentEngine, setup: MomentSetup, opts: MomentViewOptions): MomentViewHandle {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:crosshair;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  root.appendChild(canvas);
  container.appendChild(root);
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  if (!ctx) throw new Error('Canvas 2D unavailable');

  // ── team looks & player metadata ──
  const looks = teamLooks(setup.us.kit, setup.them.kit);
  const metas = new Map<string, PlayerMeta>();
  for (const side of ['us', 'them'] as const) {
    const team = side === 'us' ? setup.us : setup.them;
    for (const p of team.players) {
      const gk = p.role === 'GK';
      metas.set(p.id, {
        side, num: p.number, gk, user: side === 'us' && (p.isUser || p.id === setup.userId),
        look: gk ? (side === 'us' ? looks.gkUs : looks.gkThem) : side === 'us' ? looks.us : looks.them,
      });
    }
  }
  const ensureMeta = (id: string, side: 'us' | 'them', isUser: boolean, gk: boolean) => {
    if (metas.has(id)) return;
    metas.set(id, { side, num: 0, gk, user: isUser, look: gk ? (side === 'us' ? looks.gkUs : looks.gkThem) : side === 'us' ? looks.us : looks.them });
  };
  for (const p of engine.state.players) ensureMeta(p.id, p.side, p.isUser, p.role === 'GK');

  // ── camera ──
  let mode: CameraMode = ZOOM[opts.camera] ? opts.camera : 'behind';
  const cam: Cam = { x: 0, y: 0, ppm: 20, W: 1, H: 1, dpr: 1, shakeX: 0, shakeY: 0 };
  let shake = 0;
  const wantPpm = () => {
    const vis = cam.W >= cam.H ? ZOOM[mode] : ZOOM[mode] * 0.72;
    return Math.max(4, Math.min(cam.W / vis, cam.H / (mode === 'behind' ? 26 : 30)));
  };
  const clampCam = () => {
    const hw = cam.W / 2 / cam.ppm;
    const hh = cam.H / 2 / cam.ppm;
    const mx = HL + 5 - hw;
    const my = HW + 4 - hh;
    cam.x = mx > 0 ? Math.max(-mx, Math.min(mx, cam.x)) : 0;
    cam.y = my > 0 ? Math.max(-my, Math.min(my, cam.y)) : 0;
  };
  const toWorld = (x: number, y: number): Vec2 => ({ x: cam.x + (x - cam.W / 2) / cam.ppm, y: cam.y - (y - cam.H / 2) / cam.ppm });

  const resize = () => {
    const r = root.getBoundingClientRect();
    cam.W = Math.max(1, Math.round(r.width));
    cam.H = Math.max(1, Math.round(r.height));
    cam.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(cam.W * cam.dpr);
    canvas.height = Math.round(cam.H * cam.dpr);
    cam.ppm = wantPpm();
    clampCam();
  };

  // ── state ──
  let paused = false;
  let disposed = false;
  let clock = 0;
  let finishedAt: number | null = null;
  let finishedCalled = false;
  let bannerText: string | null = null;
  let bannerSince = 0;
  let bannerTone: Tone = 'neutral';
  let bannerHideAt = 0;
  let flash = 0;
  let flashColor = '#ffffff';
  const confetti: Confetto[] = [];
  const trail: Vec3[] = [];
  let roll = 0;
  let goalCelebrated = false;
  let helpOpen = false;
  let helpEl: HTMLDivElement | null = null;

  interface ReplayRun { frames: ReplayFrame[]; t: number; end: number; onDone: () => void }
  let replay: ReplayRun | null = null;

  const controls = new Controls(engine, root, {
    toWorld,
    enabled: () => !paused && !replay && finishedAt === null && !helpOpen,
  });

  // ── camera init ──
  resize();
  {
    const u = engine.state.players.find((p) => p.isUser);
    const b = engine.state.ball.pos;
    cam.x = u ? (u.pos.x + b.x) / 2 + 6 : b.x;
    cam.y = u ? (u.pos.y + b.y) / 2 : b.y;
    clampCam();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(root);
  else window.addEventListener('resize', resize);

  let unsubSettings: () => void = () => undefined;
  try {
    unsubSettings = onSettingsChange((s) => { if (s.camera !== mode && ZOOM[s.camera]) mode = s.camera; });
  } catch { /* settings unavailable */ }

  // ── engine events → audio / effects ──
  let crowdLevel = 0.5 + setup.importance * 0.25;
  const setCrowd = (v: number) => { crowdLevel = Math.max(0, Math.min(1, v)); audio.setCrowd(crowdLevel); };
  setCrowd(crowdLevel);
  const sideOf = (id: string) => metas.get(id)?.side ?? 'us';
  const celebrate = (side: 'us' | 'them') => {
    if (goalCelebrated) return;
    goalCelebrated = true;
    if (side === 'us') {
      audio.burst('goal');
      flash = 0.6;
      flashColor = '#ffffff';
      spawnConfetti(confetti, cam, [looks.us.fill, looks.us.ring, ACCENT, '#ffffff', '#ffcb47']);
      shake = 0.35;
      setCrowd(1);
    } else {
      audio.burst('groan');
      flash = 0.35;
      flashColor = '#ff4f64';
      setCrowd(0.35);
    }
  };
  const onEngineEvent = (e: MomentEvent) => {
    try { opts.onEvent?.(e); } catch { /* consumer error must not break the view */ }
    switch (e.t) {
      case 'whistle':
        audio.play(e.kind === 'foul' ? 'whistle_long' : 'whistle_short');
        if (e.kind === 'foul') audio.burst(sideOf(engine.state.ball.lastTouchId ?? '') === 'us' ? 'boo' : 'cheer');
        break;
      case 'kick':
        audio.play(e.speed > 19 || e.shot ? 'kick_hard' : 'kick_soft', Math.min(1, 0.45 + e.speed / 35));
        if (e.shot) setCrowd(Math.max(crowdLevel, 0.85));
        break;
      case 'header': audio.play('kick_soft', 0.8); break;
      case 'save':
        audio.play('save');
        audio.burst(sideOf(e.by) === 'us' ? 'cheer' : 'ooh');
        shake = Math.max(shake, 0.12);
        break;
      case 'woodwork':
        audio.play('post');
        audio.burst('ooh');
        shake = Math.max(shake, 0.25);
        break;
      case 'goal': celebrate(e.side); break;
      case 'net': audio.play('net'); break;
      case 'near_miss': audio.burst('ooh'); break;
      case 'tackle':
        audio.play('tackle');
        if (!e.foul && e.won && sideOf(e.by) === 'us') audio.burst('cheer');
        break;
      case 'offside': audio.burst('groan'); break;
      case 'bounce': if (e.speed > 2.5) audio.play('bounce', Math.min(1, e.speed / 14)); break;
      case 'crowd': setCrowd(0.4 + e.level * 0.6); break;
      default: break;
    }
  };
  const unsubEngine = engine.on(onEngineEvent);

  // ── touch controls (DOM) ──
  let touchUi: TouchUi | null = null;
  const buildTouch = () => { if (!touchUi) touchUi = mountTouchControls(root, controls); };
  if (controls.touchMode) buildTouch();
  const onFirstTouch = (e: PointerEvent) => { if (e.pointerType === 'touch') { controls.touchMode = true; buildTouch(); } };
  root.addEventListener('pointerdown', onFirstTouch);

  // ── help card ──
  const closeHelp = () => {
    if (!helpOpen) return;
    helpOpen = false;
    helpEl?.remove();
    helpEl = null;
    window.removeEventListener('keydown', onHelpKey, true);
  };
  const onHelpKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); closeHelp(); };
  const showHelp = () => {
    helpOpen = true;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:rgba(3,8,5,0.62);backdrop-filter:blur(3px);padding:16px;z-index:5;';
    const row = (k: string, v: string) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:5px 0"><span style="flex:none;min-width:116px;text-align:right"><b style="display:inline-block;padding:2px 7px;border-radius:6px;border:1px solid rgba(198,255,61,.55);color:#c6ff3d;font:700 12px Inter,system-ui,sans-serif">${k}</b></span><span style="color:#e6efe8;font:500 13.5px/1.4 Inter,system-ui,sans-serif">${v}</span></div>`;
    el.innerHTML = `<div style="width:min(560px,100%);max-height:100%;overflow:auto;border-radius:18px;background:rgba(8,16,11,0.94);border:1px solid rgba(198,255,61,.25);padding:18px 18px 14px;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font:400 34px 'Bebas Neue',Impact,sans-serif;color:#c6ff3d;line-height:1">${t('v2d.help.title')}</div>
      <div style="color:#9fb3a6;font:500 13px Inter,system-ui,sans-serif;margin:2px 0 10px">${t('v2d.help.sub')}</div>
      ${controls.touchMode ? row('◎', t('v2d.hint.touch')) : [
        ...CONTROL_ROWS.map(([k, v]) => row(k, t(v))),
        row(t('v2d.help.mouseKey'), t('v2d.help.mouse')),
      ].join('')}
      <div style="margin-top:12px;text-align:center"><button style="padding:10px 18px;border-radius:12px;background:#c6ff3d;color:#0b1210;font:800 14px Inter,system-ui,sans-serif;border:0;cursor:pointer">${t('v2d.help.go')}</button></div>
    </div>`;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); closeHelp(); });
    root.appendChild(el);
    helpEl = el;
    window.addEventListener('keydown', onHelpKey, true);
  };
  if (opts.showHelp) showHelp();

  // ── replay ──
  const onReplayKey = (e: KeyboardEvent) => {
    if (replay && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); endReplay(); }
  };
  window.addEventListener('keydown', onReplayKey);
  const onReplayClick = () => { if (replay) endReplay(); };
  root.addEventListener('pointerdown', onReplayClick);
  function endReplay() {
    if (!replay) return;
    const done = replay.onDone;
    replay = null;
    trail.length = 0;
    try { done(); } catch { /* consumer */ }
  }
  const replaySnap = (run: ReplayRun): Snap => {
    const f = run.frames;
    let i = 0;
    while (i < f.length - 2 && f[i + 1].t < run.t) i++;
    const a = f[i];
    const b = f[Math.min(f.length - 1, i + 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (run.t - a.t) / (b.t - a.t))) : 0;
    const bp = new Map(b.players.map((p) => [p.id, p]));
    return {
      ball: { x: a.ball.x + (b.ball.x - a.ball.x) * k, y: a.ball.y + (b.ball.y - a.ball.y) * k, z: a.ball.z + (b.ball.z - a.ball.z) * k },
      players: a.players.map((p) => {
        const q = bp.get(p.id) ?? p;
        return { id: p.id, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, facing: k < 0.5 ? p.facing : q.facing, anim: k < 0.5 ? p.anim : q.anim };
      }),
    };
  };

  // ── frame ──
  const liveSnap = (): Snap => ({
    ball: engine.state.ball.pos,
    players: engine.state.players.map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, facing: p.facing, anim: p.anim })),
  });

  const followCamera = (dt: number, snap: Snap, userPos: Vec2 | null, hasBall: boolean, ballVel: Vec3 | null) => {
    const b = snap.ball;
    let fx = b.x;
    let fy = b.y;
    if (userPos && !replay) {
      const d = Math.hypot(userPos.x - b.x, userPos.y - b.y);
      const w = hasBall ? 1 : d < 28 ? 0.38 : 0.12;
      fx = b.x + (userPos.x - b.x) * w;
      fy = b.y + (userPos.y - b.y) * w;
      if (hasBall) fx += 5;
    }
    if (ballVel) { fx += ballVel.x * 0.22; fy += ballVel.y * 0.22; }
    const k = 1 - Math.exp(-dt * (replay ? 2.5 : 3.2));
    cam.x += (fx - cam.x) * k;
    cam.y += (fy - cam.y) * k;
    cam.ppm += (wantPpm() - cam.ppm) * (1 - Math.exp(-dt * 3));
    clampCam();
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      const a = shake * 18;
      cam.shakeX = (Math.random() - 0.5) * a;
      cam.shakeY = (Math.random() - 0.5) * a;
    } else { cam.shakeX = 0; cam.shakeY = 0; }
  };

  const updateTrail = (b: Vec3, speed: number, dt: number) => {
    roll += speed * dt * 4;
    if (speed > 13) {
      trail.push({ x: b.x, y: b.y, z: b.z });
      if (trail.length > 10) trail.shift();
    } else if (trail.length) trail.shift();
  };

  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const rawDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += rawDt;
    const s = engine.state;

    if (replay) {
      const run = replay;
      run.t = Math.min(run.end + 0.8, run.t + rawDt * 0.6);
      const snap = replaySnap(run);
      const prev = trail.length ? trail[trail.length - 1] : snap.ball;
      updateTrail(snap.ball, Math.hypot(snap.ball.x - prev.x, snap.ball.y - prev.y) / Math.max(1e-3, rawDt * 0.6), rawDt);
      followCamera(rawDt, snap, null, false, null);
      drawPitch(ctx, cam);
      drawGoals(ctx, cam);
      drawPlayers(ctx, cam, snap, metas, clock, {});
      drawBall(ctx, cam, snap.ball, trail, roll);
      drawLabel(ctx, cam, t('v2d.replay'), t('v2d.replay.skip'));
      if (run.t >= run.end + 0.8) endReplay();
      return;
    }

    if (!paused && !helpOpen) {
      controls.update(rawDt, clock);
      try { engine.step(rawDt); } catch (err) { console.error('[view2d] engine.step failed', err); }
    }

    const snap = liveSnap();
    for (const p of s.players) if (!metas.has(p.id)) ensureMeta(p.id, p.side, p.isUser, p.role === 'GK');
    const user = s.players.find((p) => p.isUser) ?? null;
    const hasBall = !!user && s.ball.ownerId === user.id;
    const bv = s.ball.vel;
    const bSpeed = Math.hypot(bv.x, bv.y);
    const loose = !s.ball.ownerId;
    followCamera(rawDt, snap, user ? user.pos : null, hasBall, loose && bSpeed > 8 ? bv : null);
    if (!paused) updateTrail(s.ball.pos, Math.hypot(bv.x, bv.y, bv.z), rawDt);

    const ov = controls.overlay();
    drawPitch(ctx, cam);
    drawGoals(ctx, cam);

    // aim helpers under the players
    const live = finishedAt === null;
    if (live && ov.charge && ov.charge.path.length > 1) drawPath(ctx, cam, ov.charge.path);
    if (live && ov.info.target && (hasBall || ov.charge)) {
      const tgt = ov.aimPoint && ov.aimPoint.x > HL - 14 && Math.abs(ov.aimPoint.y) < GW + 7
        ? { x: HL, y: Math.max(-(GW - 0.3), Math.min(GW - 0.3, ov.aimPoint.y)) }
        : { x: HL, y: ov.info.target.y };
      if (ov.info.setPiece || (ov.aimPoint && ov.charge)) drawTarget(ctx, cam, tgt, true, clock);
    }
    if (live && ov.aimPoint && !ov.touch && hasBall && !(ov.aimPoint.x > HL - 14 && Math.abs(ov.aimPoint.y) < GW + 7)) drawTarget(ctx, cam, ov.aimPoint, false, clock);

    drawPlayers(ctx, cam, snap, metas, clock, { highlightId: live && hasBall ? ov.pass?.id ?? null : null, highlightKey: ov.touch ? t('v2d.touch.pass') : 'F' });
    drawBall(ctx, cam, s.ball.pos, trail, roll);
    if (live && ov.charge && user) drawPowerBar(ctx, cam, user.pos, ov.charge.value, ov.charge.curl, ov.charge.chip, { power: t('v2d.aim.power'), chip: t('v2d.aim.chip') });
    if (user) drawOffscreenArrow(ctx, cam, user.pos);
    drawMinimap(ctx, cam, snap, metas, 62);
    if (live && ov.info.timeLeft !== null) drawTimeBar(ctx, cam, ov.info.timeLeft);
    else if (live && s.drill) drawTimeBar(ctx, cam, 1);

    // hint pill for the first seconds (and while idle)
    if (live) {
      const since = clock - controls.acted;
      const a = clock < HINT_TIME ? Math.min(1, (HINT_TIME - clock) * 1.5) : since > 6 && since < 12 ? 0.85 : 0;
      drawHint(ctx, cam, controls.hint(ov.mode), a, ov.touch ? 150 : 14);
    }

    // banner (engine-provided, e.g. GOOOL!)
    const text = s.banner;
    if (text && text !== bannerText && finishedAt === null) { bannerText = text; bannerSince = clock; bannerTone = toneOf(s.outcome); }
    if (!text && finishedAt === null) bannerText = null;

    // outcome beat
    let finished = false;
    try { finished = engine.isFinished(); } catch { finished = false; }
    if (finished && finishedAt === null) {
      finishedAt = clock;
      controls.cancel();
      const outcome = s.outcome;
      bannerText = s.banner ?? (outcome ? t(`view.out.${outcome}`) : null);
      bannerSince = clock;
      bannerTone = toneOf(outcome);
      bannerHideAt = clock + 2.6;
      if (outcome === 'goal') celebrate('us');
      else if (outcome === 'conceded') celebrate('them');
      else if (outcome === 'saved' || outcome === 'missed' || outcome === 'woodwork') setCrowd(0.55);
      else if (outcome === 'tackle_won' || outcome === 'interception') audio.burst('applause');
    }
    if (finishedAt !== null && bannerHideAt && clock > bannerHideAt) { bannerText = null; bannerHideAt = 0; }
    if (bannerText) drawBanner(ctx, cam, bannerText, clock - bannerSince, bannerTone);

    flash = Math.max(0, flash - rawDt * 1.4);
    drawFlash(ctx, cam, flashColor, flash);
    stepConfetti(ctx, cam, confetti, rawDt);

    if (finishedAt !== null && !finishedCalled && clock - finishedAt >= FINISH_HOLD) {
      finishedCalled = true;
      try { opts.onFinished?.(); } catch (err) { console.error('[view2d] onFinished failed', err); }
    }
  };

  const handle: MomentViewHandle = {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      try { unsubEngine(); } catch { /* ignore */ }
      unsubSettings();
      controls.dispose();
      touchUi?.dispose();
      closeHelp();
      window.removeEventListener('keydown', onReplayKey);
      ro?.disconnect();
      if (!ro) window.removeEventListener('resize', resize);
      root.remove();
    },
    setCamera(m) {
      if (ZOOM[m]) mode = m;
    },
    pause(p) {
      paused = p;
      if (p) controls.cancel();
    },
    playReplay(frames, onDone) {
      if (!frames.length) { onDone(); return; }
      if (replay) endReplay();
      const sorted = frames.slice().sort((a, b) => a.t - b.t);
      const end = sorted[sorted.length - 1].t;
      const start = Math.max(sorted[0].t, end - 6);
      replay = { frames: sorted, t: start, end, onDone };
      bannerText = null;
      confetti.length = 0;
      trail.length = 0;
      const f0 = sorted.find((f) => f.t >= start) ?? sorted[0];
      cam.x = f0.ball.x;
      cam.y = f0.ball.y;
      clampCam();
    },
  };

  raf = requestAnimationFrame((n) => { last = n; tick(n); });
  return handle;
}
