/**
 * mountMomentView: the real-time 3D moment. Owns the rAF loop (engine.step → visuals → render),
 * wires input + HUD + audio + camera direction, plays the outcome beat and replays.
 */
import * as THREE from 'three';
import { t } from '../../core/i18n';
import { onSettingsChange, updateSettings } from '../../core/settings';
import type { CameraMode, Kit, MomentEvent, MomentPlayerSpec, MomentSetup, MomentState, ReplayFrame, Vec2, Vec3 } from '../../core/types';
import { audio, setAudioFocus } from '../../audio/api';
import type { MomentEngine } from '../engine/api';
import { createCameraRig, desiredFraming, orbitFraming } from './camera';
import { createHud, outcomeTone, type HudContext } from './hud';
import { ballCarrier, createInput, userPlayer } from './input';
import { goalkeeperColor, resolveKitClash, shade, shortsColor } from './palette';
import { buildAim, buildUserMarker } from './three/aim';
import { buildBall } from './three/ball';
import { buildPlayer, createBodyMaterial, nameTag, type PlayerFrame, type PlayerLook, type PlayerRig } from './three/players';
import { buildWorld, createRenderer } from './three/world';
import type { MomentViewHandle, MomentViewOptions } from './api';
import './strings';

const CAMERA_CYCLE: CameraMode[] = ['behind', 'broadcast', 'top'];
const FINISH_HOLD = 1.5;

function defaultAppearance(seed: number): MomentPlayerSpec['appearance'] {
  return { skin: seed % 6, hairStyle: (seed * 7) % 8, hairColor: ['#1b1310', '#3b2516', '#6b4a2b', '#c9a066'][seed % 4], beard: seed % 3, boots: '#101010', height: 178 + (seed % 12) };
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function teamKits(setup: MomentSetup): { us: Kit; them: Kit; usGk: Kit; themGk: Kit } {
  const us = setup.us.kit;
  const them = resolveKitClash(us, setup.them.kit);
  const g1 = goalkeeperColor(us, them, 0);
  let g2 = goalkeeperColor(us, them, 3);
  if (g2 === g1) g2 = goalkeeperColor(us, { primary: g1, secondary: g1, style: 'plain' }, 1);
  return {
    us, them,
    usGk: { primary: g1, secondary: shade(g1, -0.45), style: 'plain' },
    themGk: { primary: g2, secondary: shade(g2, -0.45), style: 'plain' },
  };
}

export function mountMomentViewImpl(container: HTMLElement, engine: MomentEngine, setup: MomentSetup, opts: MomentViewOptions): MomentViewHandle {
  const quality = opts.quality;
  const shadows = opts.shadows && quality !== 'low';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const renderer = createRenderer(container, quality, shadows);
  const canvas = renderer.domElement;
  const kits = teamKits(setup);
  const world = buildWorld(renderer, {
    quality, shadows, weather: setup.weather,
    home: kits.us, away: kits.them,
    homeName: setup.us.shortName || setup.us.name, awayName: setup.them.shortName || setup.them.name,
    fullness: 0.75 + Math.min(0.25, setup.importance * 0.3),
    screenTitle: t(`view.type.${setup.type}`),
  });
  const { scene, stadium, env } = world;
  stadium.setScore(setup.score.us, setup.score.them, setup.minute, t(`view.type.${setup.type}`));
  stadium.setExcitement(0.35 + setup.importance * 0.3, 0.3);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.3, 1500);
  const rig = createCameraRig(camera);
  let mode: CameraMode = opts.camera;

  // ── players ──
  const bodyMat = createBodyMaterial();
  const specs = new Map<string, MomentPlayerSpec>();
  for (const p of [...setup.us.players, ...setup.them.players]) specs.set(p.id, p);
  const rigs = new Map<string, PlayerRig>();
  const playerGroup = new THREE.Group();
  scene.add(playerGroup);
  const makeLook = (id: string, side: 'us' | 'them', role: string, isUser: boolean): PlayerLook => {
    const spec = specs.get(id);
    const gk = role === 'GK';
    const kit = gk ? (side === 'us' ? kits.usGk : kits.themGk) : side === 'us' ? kits.us : kits.them;
    const h = hashId(id);
    return {
      id,
      name: spec?.name ?? '',
      number: spec?.number ?? (gk ? 1 : 2 + (h % 20)),
      appearance: spec?.appearance ?? defaultAppearance(h),
      foot: spec?.foot ?? 'R',
      kit,
      shorts: shortsColor(kit),
      socks: gk ? kit.primary : kit.primary,
      gloves: gk ? shade(kit.primary, 0.35) : undefined,
      isUser,
    };
  };
  const ensureRig = (id: string, side: 'us' | 'them', role: string, isUser: boolean): PlayerRig => {
    let r = rigs.get(id);
    if (!r) {
      r = buildPlayer(makeLook(id, side, role, isUser), bodyMat, quality, shadows);
      rigs.set(id, r);
      playerGroup.add(r.root);
    }
    return r;
  };
  for (const p of engine.state.players) ensureRig(p.id, p.side, p.role, p.isUser).snap(p);

  const userSpec = setup.us.players.find((p) => p.id === setup.userId) ?? setup.us.players.find((p) => p.isUser);
  const marker = buildUserMarker();
  scene.add(marker.group);
  const tag = nameTag(userSpec?.name ?? '', userSpec?.number ?? 10);
  scene.add(tag.sprite);

  const ball = buildBall(quality, shadows);
  scene.add(ball.group);
  ball.reset(engine.state.ball.pos);
  const aim = buildAim();
  scene.add(aim.group);

  // ── projection helpers ──
  let W = 1;
  let H = 1;
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const proj = new THREE.Vector3();
  const toGround = (p: Vec2): Vec2 | null => {
    ndc.set((p.x / W) * 2 - 1, -(p.y / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(ground, hit)) return null;
    if (hit.distanceTo(camera.position) > 400) return null;
    return { x: hit.x, y: -hit.z };
  };
  const toScreen = (p: Vec3): Vec2 | null => {
    proj.set(p.x, p.z, -p.y).project(camera);
    if (proj.z > 1) return null;
    return { x: (proj.x + 1) * 0.5 * W, y: (1 - proj.y) * 0.5 * H };
  };
  const fwd = new THREE.Vector3();
  const screenAxes = () => {
    camera.getWorldDirection(fwd);
    let ux = fwd.x;
    let uy = -fwd.z;
    const l = Math.hypot(ux, uy);
    if (l < 1e-3) { ux = 1; uy = 0; } else { ux /= l; uy /= l; }
    return { up: { x: ux, y: uy }, right: { x: uy, y: -ux } };
  };

  // ── HUD & input ──
  let paused = false;
  let helpOpen = false;
  const hud = createHud(container, {
    onCall: (through) => input.callForBall(through),
    onSprint: (on) => input.setSprint(on),
    onLoft: (v) => input.setLoft(v, true),
    onCamera: () => cycleCamera(),
    onHelp: (open) => { helpOpen = open; input.setEnabled(!open && !finishedAt && !replay); },
    onReplaySkip: () => endReplay(),
  });
  hud.setCamera(mode);
  const vision = userSpec?.attrs.vision ?? 60;
  const input = createInput({
    element: canvas,
    engine,
    momentType: setup.type,
    vision,
    toGround, toScreen, screenAxes,
    viewport: () => ({ w: W, h: H }),
    setAim: (a) => hud.setAim(a),
    setPath: (path, power) => aim.setPath(path, power),
    setLoftUi: (v) => hud.setLoft(v),
    onAftertouch: (v) => hud.setAftertouch(v),
    onCameraKey: () => cycleCamera(),
    onHelpKey: () => (hud.helpOpen ? undefined : hud.showHelp()),
    onAimChange: (on) => setAudioFocus(on ? 1 : 0),
  });
  hud.setLoft(input.loft);

  function cycleCamera() {
    const next = CAMERA_CYCLE[(CAMERA_CYCLE.indexOf(mode) + 1) % CAMERA_CYCLE.length];
    try { updateSettings((s) => { s.camera = next; }); } catch { /* settings unavailable */ }
    handle.setCamera(next);
  }
  let unsubSettings: () => void = () => {};
  try {
    unsubSettings = onSettingsChange((s) => { if (s.camera !== mode) handle.setCamera(s.camera); });
  } catch { /* settings unavailable */ }

  // ── engine events → audio, camera, stadium ──
  let crowdLevel = 0.5 + setup.importance * 0.25;
  const setCrowd = (v: number) => { crowdLevel = Math.max(0, Math.min(1, v)); audio.setCrowd(crowdLevel); };
  setCrowd(crowdLevel);
  let goalCelebrated = false;
  const acted: Record<HudContext, boolean> = { attack: false, support: false, defend: false, none: true };
  const sideOf = (id: string) => specs.get(id)?.side ?? engine.state.players.find((p) => p.id === id)?.side ?? 'us';
  const celebrateGoal = (side: 'us' | 'them') => {
    if (goalCelebrated) return;
    goalCelebrated = true;
    const b = engine.state.ball.pos;
    rig.drama({ x: b.x, y: b.y, z: Math.max(0.6, b.z) }, 2.8);
    rig.shake(0.35);
    if (side === 'us') {
      audio.burst('goal');
      stadium.celebrate('home', 8);
      stadium.pyro(10);
      stadium.ledGoal(userSpec?.name ?? '');
      stadium.setExcitement(1, 0.2);
      stadium.setScore(setup.score.us + 1, setup.score.them, setup.minute);
      setCrowd(1);
    } else {
      audio.burst('groan');
      stadium.celebrate('away', 6);
      stadium.setExcitement(0.15, 1);
      stadium.setScore(setup.score.us, setup.score.them + 1, setup.minute);
      setCrowd(0.35);
    }
  };
  const onEngineEvent = (e: MomentEvent) => {
    try { opts.onEvent?.(e); } catch { /* consumer error must not break the view */ }
    if (e.t === 'kick' && e.by === setup.userId) acted.attack = true;
    else if (e.t === 'call' && e.by === setup.userId) acted.support = true;
    else if (e.t === 'tackle' && e.by === setup.userId) acted.defend = true;
    switch (e.t) {
      case 'whistle':
        audio.play(e.kind === 'start' ? 'whistle_short' : e.kind === 'foul' ? 'whistle_long' : 'whistle_short');
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
        rig.shake(0.08);
        break;
      case 'woodwork':
        audio.play('post');
        audio.burst('ooh');
        rig.shake(0.22);
        break;
      case 'goal': celebrateGoal(e.side); break;
      case 'net': audio.play('net'); break;
      case 'near_miss': audio.burst('ooh'); break;
      case 'tackle':
        audio.play('tackle');
        if (e.foul) break;
        if (e.won && sideOf(e.by) === 'us') audio.burst('cheer');
        break;
      case 'offside': audio.burst('groan'); break;
      case 'bounce': if (e.speed > 2.5) audio.play('bounce', Math.min(1, e.speed / 14)); break;
      case 'crowd':
        setCrowd(0.4 + e.level * 0.6);
        stadium.setExcitement(0.3 + e.level * 0.7, 0.3);
        break;
      default: break;
    }
  };
  const unsubEngine = engine.on(onEngineEvent);

  // ── outcome & replay state ──
  let finishedAt: number | null = null;
  let finishedCalled = false;
  let bannerHideAt = 0;
  let clock = 0;
  let introLeft = 1.6;

  interface ReplayRun { frames: ReplayFrame[]; t: number; end: number; elapsed: number; onDone: () => void; anims: Map<string, { anim: string; t: number }>; seed: number }
  let replay: ReplayRun | null = null;

  const onReplayKey = (e: KeyboardEvent) => {
    if (replay && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); endReplay(); }
  };
  window.addEventListener('keydown', onReplayKey);

  function endReplay() {
    if (!replay) return;
    const done = replay.onDone;
    replay = null;
    hud.setReplay(false);
    hud.setControlsVisible(!finishedAt);
    input.setEnabled(!finishedAt && !helpOpen);
    for (const p of engine.state.players) rigs.get(p.id)?.snap(p);
    ball.reset(engine.state.ball.pos);
    try { done(); } catch { /* consumer */ }
  }

  // ── resize ──
  const resize = () => {
    const r = container.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    hud.resize(W, H);
  };
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  if (!ro) window.addEventListener('resize', resize);

  // Opening shot: a high wide angle that swoops into the chosen camera.
  {
    const b = engine.state.ball.pos;
    rig.snap({ pos: { x: b.x - 34, y: b.y - 30, z: 26 }, target: { x: b.x + 6, y: b.y, z: 0 }, fov: 50 });
  }

  // ── per-frame ──
  const tagPos = new THREE.Vector3();
  const focusV = new THREE.Vector3();
  let windTimer = 0;
  const contextTime: Record<HudContext, number> = { attack: 0, support: 0, defend: 0, none: 0 };

  const contextOf = (s: MomentState): HudContext => {
    let kick = false;
    try { kick = engine.canKick(); } catch { kick = false; }
    if (kick) return 'attack';
    const c = ballCarrier(engine);
    if (!c) return 'none';
    return c.side === 'them' ? 'defend' : s.ball.ownerId && c.isUser ? 'attack' : 'support';
  };

  const frameFromReplay = (run: ReplayRun, dt: number) => {
    const f = run.frames;
    let k = 0;
    while (k < f.length - 2 && f[k + 1].t <= run.t) k++;
    const a = f[k];
    const b = f[Math.min(f.length - 1, k + 1)];
    const span = Math.max(1e-3, b.t - a.t);
    const al = Math.max(0, Math.min(1, (run.t - a.t) / span));
    const bp = { x: a.ball.x + (b.ball.x - a.ball.x) * al, y: a.ball.y + (b.ball.y - a.ball.y) * al, z: a.ball.z + (b.ball.z - a.ball.z) * al };
    const bv = { x: (b.ball.x - a.ball.x) / span, y: (b.ball.y - a.ball.y) / span, z: (b.ball.z - a.ball.z) / span };
    const seen = new Set<string>();
    a.players.forEach((pa, i) => {
      const pb = b.players[i]?.id === pa.id ? b.players[i] : b.players.find((q) => q.id === pa.id) ?? pa;
      const st = engine.state.players.find((q) => q.id === pa.id);
      const r = rigs.get(pa.id) ?? ensureRig(pa.id, st?.side ?? specs.get(pa.id)?.side ?? 'us', st?.role ?? specs.get(pa.id)?.role ?? 'CM', !!st?.isUser);
      seen.add(pa.id);
      const prev = run.anims.get(pa.id);
      const animT = prev && prev.anim === pa.anim ? prev.t + dt : 0;
      run.anims.set(pa.id, { anim: pa.anim, t: animT });
      let df = pb.facing - pa.facing;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      const frame: PlayerFrame = {
        pos: { x: pa.x + (pb.x - pa.x) * al, y: pa.y + (pb.y - pa.y) * al },
        vel: { x: (pb.x - pa.x) / span, y: (pb.y - pa.y) / span },
        facing: pa.facing + df * al,
        anim: pa.anim,
        animTime: animT,
      };
      r.setVisible(true);
      r.update(dt, frame);
    });
    for (const [id, r] of rigs) if (!seen.has(id)) r.setVisible(false);
    ball.update(dt, bp, bv, null);
    return { bp, bv };
  };

  let raf = 0;
  let last = performance.now();
  let disposed = false;

  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const rawDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const dt = paused ? 0 : rawDt;
    clock += rawDt;
    const s = engine.state;

    if (replay) {
      const run = replay;
      const speed = 0.5;
      run.t = Math.min(run.end + 0.9, run.t + dt * speed);
      run.elapsed += dt;
      const { bp, bv } = frameFromReplay(run, dt * speed);
      for (const g of world.goals) g.update(dt * speed, bp, bv);
      rig.update(dt, orbitFraming(bp, run.elapsed, run.seed), 2.4);
      marker.group.visible = false;
      tag.sprite.visible = false;
      focusV.copy(rig.target);
      env.setFocus(focusV);
      world.update(dt, clock, camera, rig.target);
      if (run.t >= run.end + 0.9) endReplay();
      renderer.render(scene, camera);
      return;
    }

    if (!paused && !helpOpen) {
      try { engine.step(dt); } catch (err) { console.error('[view] engine.step failed', err); }
    }

    // Players.
    let user = userPlayer(engine);
    for (const p of s.players) {
      const r = rigs.get(p.id) ?? ensureRig(p.id, p.side, p.role, p.isUser);
      r.setVisible(true);
      r.update(dt, p);
    }
    user = userPlayer(engine);

    // Ball + goals.
    ball.update(dt, s.ball.pos, s.ball.vel, s.ball.spin);
    world.goals.forEach((g) => g.update(dt, s.ball.pos, s.ball.vel));

    // User marker + tag.
    const ur = user ? rigs.get(user.id) : undefined;
    marker.update(clock, user?.pos.x ?? 0, user?.pos.y ?? 0, !!user?.hasBall, !!user);
    if (ur && user) {
      ur.headTop(tagPos);
      const dist = tagPos.distanceTo(camera.position);
      const sc = Math.max(1.4, Math.min(5.5, dist * 0.06));
      tag.sprite.scale.set(sc, sc * 0.25, 1);
      tag.sprite.position.copy(tagPos).add(new THREE.Vector3(0, 0.25 + sc * 0.02, 0));
      tag.sprite.visible = !input.aiming;
    } else tag.sprite.visible = false;

    // Camera.
    const sp = Math.hypot(s.ball.vel.x, s.ball.vel.y);
    const free = !s.ball.ownerId;
    const followBall = free && (s.phase === 'flight' || sp > 14) && s.ball.lastTouchSide === 'us' && mode !== 'top';
    const framing = desiredFraming({
      mode, user: user ? user.pos : null, ball: s.ball.pos, ballVel: s.ball.vel,
      aiming: input.aiming || s.phase === 'aiming', followBall, aspect: W / H,
    });
    introLeft = Math.max(0, introLeft - rawDt);
    rig.update(rawDt, framing, introLeft > 0 ? 1.4 : followBall ? 5 : 3.2);
    focusV.set(s.ball.pos.x, 0, -s.ball.pos.y);
    env.setFocus(focusV);
    aim.update(clock);
    world.update(rawDt, clock, camera, rig.target);

    // HUD.
    const aiming = input.aiming || s.phase === 'aiming';
    hud.setFocus(aiming ? s.focus : null);
    if (!finishedAt) {
      const ctx = contextOf(s);
      contextTime[ctx] += rawDt;
      hud.setContext(ctx, !acted[ctx] && contextTime[ctx] < 7 && !aiming && !helpOpen);
      hud.setTime(setup.timeLimit > 0 ? 1 - s.time / setup.timeLimit : null);
    }
    windTimer -= rawDt;
    if (windTimer <= 0) {
      windTimer = 0.5;
      const w = setup.weather.wind;
      const speed = Math.hypot(w.x, w.y);
      const a = toScreen({ x: s.ball.pos.x, y: s.ball.pos.y, z: 0 });
      const b = toScreen({ x: s.ball.pos.x + (w.x / (speed || 1)) * 4, y: s.ball.pos.y + (w.y / (speed || 1)) * 4, z: 0 });
      hud.setWind(a && b ? (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI : null, speed);
    }

    // Outcome beat.
    let finished = false;
    try { finished = engine.isFinished(); } catch { finished = false; }
    if (finished && finishedAt === null) {
      finishedAt = clock;
      input.setEnabled(false);
      hud.setControlsVisible(false);
      hud.setTime(null);
      hud.setContext('none', false);
      const outcome = s.outcome;
      const text = s.banner ?? (outcome ? t(`view.out.${outcome}`) : null);
      hud.setBanner(text, outcomeTone(outcome));
      bannerHideAt = clock + 2.6;
      if (outcome === 'goal' && !goalCelebrated) celebrateGoal('us');
      else if (outcome === 'conceded' && !goalCelebrated) celebrateGoal('them');
      else if (outcome === 'saved' || outcome === 'missed' || outcome === 'woodwork') setCrowd(0.55);
      else if (outcome === 'tackle_won' || outcome === 'interception') audio.burst('applause');
    }
    if (finishedAt !== null && bannerHideAt && clock > bannerHideAt) { hud.setBanner(null); bannerHideAt = 0; }
    if (finishedAt !== null && !finishedCalled && clock - finishedAt >= FINISH_HOLD) {
      finishedCalled = true;
      try { opts.onFinished?.(); } catch (err) { console.error('[view] onFinished failed', err); }
    }
    if (!finishedAt && !helpOpen) input.update(rawDt);

    renderer.render(scene, camera);
  };

  const handle: MomentViewHandle = {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      try { unsubEngine(); } catch { /* ignore */ }
      unsubSettings();
      window.removeEventListener('keydown', onReplayKey);
      ro?.disconnect();
      if (!ro) window.removeEventListener('resize', resize);
      input.dispose();
      hud.dispose();
      setAudioFocus(0);
      rigs.forEach((r) => r.dispose());
      rigs.clear();
      bodyMat.dispose();
      marker.dispose();
      tag.dispose();
      ball.dispose();
      aim.dispose();
      world.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ignore */ }
      canvas.remove();
    },
    setCamera(m) {
      if (!CAMERA_CYCLE.includes(m)) return;
      mode = m;
      hud.setCamera(m);
    },
    pause(p) {
      paused = p;
      if (p) input.cancelAim();
    },
    playReplay(frames, onDone) {
      if (!frames.length) { onDone(); return; }
      if (replay) endReplay();
      const sorted = frames.slice().sort((a, b) => a.t - b.t);
      const end = sorted[sorted.length - 1].t;
      const start = Math.max(sorted[0].t, end - 6);
      replay = { frames: sorted, t: start, end, elapsed: 0, onDone, anims: new Map(), seed: Math.random() * Math.PI * 2 };
      input.setEnabled(false);
      hud.setBanner(null);
      hud.setReplay(true);
      const f0 = sorted.find((f) => f.t >= start) ?? sorted[0];
      ball.reset(f0.ball);
      for (const p of f0.players) rigs.get(p.id)?.snap({ pos: { x: p.x, y: p.y }, vel: { x: 0, y: 0 }, facing: p.facing, anim: p.anim, animTime: 0 });
      rig.snap(orbitFraming(f0.ball, 0, replay.seed));
    },
  };

  if (opts.showHelp) hud.showHelp();
  raf = requestAnimationFrame((n) => { last = n; tick(n); });
  return handle;
}
