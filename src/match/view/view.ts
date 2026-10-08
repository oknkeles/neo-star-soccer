/**
 * mountMomentView: the real-time 3D moment. Owns the rAF loop (controls → engine.step → visuals →
 * render), wires the shared assisted controls (src/match/controls) + HUD + audio + camera,
 * plays the outcome beat and replays. Rendered positions are extrapolated by the engine's
 * un-stepped time (engine.lag) so motion never stutters between fixed engine steps.
 */
import * as THREE from 'three';
import { t } from '../../core/i18n';
import { onSettingsChange, updateSettings } from '../../core/settings';
import type { CameraMode, Kit, MomentEvent, MomentPlayerSpec, MomentPlayerState, MomentSetup, ReplayFrame, Vec2, Vec3 } from '../../core/types';
import { audio, setAudioFocus } from '../../audio/api';
import type { MomentEngine } from '../engine/api';
import { createCameraRig, createFramingDirector, desiredFraming, orbitFraming } from './camera';
import { createHud, outcomeTone, type AimMark } from './hud';
import { Controls, type ControlsMode } from '../controls/controls';
import { mountAimPanel, surname } from '../controls/aimPanel';
import { mountTouchControls, type TouchUi } from '../controls/touch';
import { goalkeeperColor, resolveKitClash, shade, shortsColor } from './palette';
import { buildAim, buildUserMarker } from './three/aim';
import { buildBall } from './three/ball';
import { buildPlayer, createBodyMaterial, nameTag, type PlayerFrame, type PlayerLook, type PlayerRig } from './three/players';
import { buildWorld, createRenderer } from './three/world';
import type { MomentViewHandle, MomentViewOptions } from './api';
import './strings';

const CAMERA_CYCLE: CameraMode[] = ['behind', 'broadcast', 'top'];
const FINISH_HOLD = 0.35;
const HINT_TIME = 7;
/** Snap the camera-relative movement axes to the pitch axes within this angle (stable "up"). */
const AXIS_SNAP = 0.55;

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

const userOf = (engine: MomentEngine): MomentPlayerState | undefined => engine.state.players.find((p) => p.isUser);

export function mountMomentViewImpl(container: HTMLElement, engine: MomentEngine, setup: MomentSetup, opts: MomentViewOptions): MomentViewHandle {
  const quality = opts.quality;
  // Real shadow maps only on 'high'; 'medium' uses cheap blob shadows (one textured quad each).
  const shadows = opts.shadows && quality === 'high';
  const blobs = opts.shadows && quality !== 'high';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const renderer = createRenderer(container, quality, shadows, 1.5);
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
  /** Eases between follow / calm-aim overview framings (no hard cuts). */
  const director = createFramingDirector();
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
  let blobGeo: THREE.PlaneGeometry | null = null;
  let blobMat: THREE.MeshBasicMaterial | null = null;
  let blobTex: THREE.CanvasTexture | null = null;
  if (blobs) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    blobTex = new THREE.CanvasTexture(c);
    blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    blobGeo = new THREE.PlaneGeometry(1.25, 1.25);
    blobGeo.rotateX(-Math.PI / 2);
  }
  const ensureRig = (id: string, side: 'us' | 'them', role: string, isUser: boolean): PlayerRig => {
    let r = rigs.get(id);
    if (!r) {
      r = buildPlayer(makeLook(id, side, role, isUser), bodyMat, quality, shadows);
      if (blobGeo && blobMat) {
        const b = new THREE.Mesh(blobGeo, blobMat);
        b.position.y = 0.02;
        b.renderOrder = 1;
        r.root.add(b);
      }
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
  const passMarker = buildUserMarker('120,210,255', 1.5);
  scene.add(passMarker.group);

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
  const axes = { up: { x: 1, y: 0 }, right: { x: 0, y: -1 } };
  /** Camera-relative movement axes, snapped to the pitch axes when close (behind camera: up = toward goal). */
  const updateAxes = () => {
    camera.getWorldDirection(fwd);
    let ux = fwd.x;
    let uy = -fwd.z;
    const l = Math.hypot(ux, uy);
    if (l < 1e-3) { ux = 1; uy = 0; } else { ux /= l; uy /= l; }
    const a = Math.atan2(uy, ux);
    const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(a - q) < AXIS_SNAP) { ux = Math.round(Math.cos(q)); uy = Math.round(Math.sin(q)); }
    axes.up.x = ux; axes.up.y = uy;
    axes.right.x = uy; axes.right.y = -ux;
  };
  const headV = new THREE.Vector3();
  const headScreen = (id: string, lift: number): Vec2 | null => {
    const r = rigs.get(id);
    if (!r) return null;
    r.headTop(headV);
    headV.y += lift;
    headV.project(camera);
    if (headV.z > 1) return null;
    return { x: (headV.x + 1) * 0.5 * W, y: (1 - headV.y) * 0.5 * H };
  };

  // ── HUD & controls ──
  let paused = false;
  let helpOpen = false;
  const hud = createHud(container, {
    onCamera: () => cycleCamera(),
    onHelp: (open) => { helpOpen = open; },
    onReplaySkip: () => endReplay(),
  });
  hud.setCamera(mode);
  const controls = new Controls(engine, canvas, {
    toWorld: (x, y) => toGround({ x, y }),
    enabled: () => !paused && !replay && finishedAt === null && !helpOpen,
    axes: () => axes,
  });
  const aimPanel = mountAimPanel(hud.root, controls);
  let touchUi: TouchUi | null = null;
  const buildTouch = () => { if (!touchUi) touchUi = mountTouchControls(hud.controlsLayer, controls); };
  if (controls.touchMode) buildTouch();
  const onFirstTouch = (e: PointerEvent) => { if (e.pointerType === 'touch') { controls.touchMode = true; buildTouch(); } };
  canvas.addEventListener('pointerdown', onFirstTouch);
  const onViewKey = (e: KeyboardEvent) => {
    if (e.repeat || helpOpen || replay) return;
    const tg = e.target;
    if (tg instanceof HTMLElement && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (e.code === 'KeyV') cycleCamera();
    else if (e.code === 'KeyH') hud.showHelp(controls.touchMode);
  };
  window.addEventListener('keydown', onViewKey);

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
  let introLeft = 0.6;

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

  // Opening shot: just above the chosen framing, settling in quickly (no long swoop).
  {
    const s0 = engine.state;
    const u0 = userOf(engine);
    const f0 = desiredFraming({ mode, user: u0 ? u0.pos : null, ball: s0.ball.pos, ballVel: s0.ball.vel, aiming: false, followBall: false, aspect: W / H });
    rig.snap({ pos: { x: f0.pos.x - 3, y: f0.pos.y, z: f0.pos.z + 4 }, target: f0.target, fov: f0.fov + 4 });
    updateAxes();
  }

  // ── per-frame ──
  const tagPos = new THREE.Vector3();
  const focusV = new THREE.Vector3();
  let windTimer = 0;
  let hintMode: ControlsMode | null = null;
  let hintSince = 0;
  let lastPath: Vec3[] | null = null;
  let aimVersion = -1;
  let aimLook: Vec3 | null = null;
  let aimShown = false;
  let frozenShown = false;
  const strokeScreen: { x: number; y: number }[] = [];
  const marks: AimMark[] = [];
  // reusable per-frame objects (no allocations in the loop)
  const frames = new Map<string, PlayerFrame>();
  const ballPos = { x: 0, y: 0, z: 0 };

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
      controls.update(rawDt, clock);
      try { engine.step(dt); } catch (err) { console.error('[view] engine.step failed', err); }
    }
    // extrapolate by the un-stepped engine time: smooth motion between fixed 120 Hz steps
    const lag = Math.min(0.02, Math.max(0, engine.lag ?? 0));
    // calm aim: the world is stopped (poses / ball spin hold too); camera, crowd and HUD stay alive
    const frozen = !!engine.frozenForAim;
    const simDt = frozen ? 0 : dt;
    if (frozen !== frozenShown) {
      frozenShown = frozen;
      setAudioFocus(frozen ? 0.6 : 0);
      hud.setAiming(frozen);
    }

    // Players.
    for (const p of s.players) {
      const r = rigs.get(p.id) ?? ensureRig(p.id, p.side, p.role, p.isUser);
      let f = frames.get(p.id);
      if (!f) { f = { pos: { x: 0, y: 0 }, vel: p.vel, facing: p.facing, anim: p.anim, animTime: p.animTime }; frames.set(p.id, f); }
      f.pos.x = p.pos.x + p.vel.x * lag;
      f.pos.y = p.pos.y + p.vel.y * lag;
      f.vel = p.vel;
      f.facing = p.facing;
      f.anim = p.anim;
      f.animTime = p.animTime;
      r.setVisible(true);
      r.update(simDt, f);
    }
    const user = userOf(engine);
    const uf = user ? frames.get(user.id) : undefined;

    // Ball + goals.
    const bv = s.ball.vel;
    ballPos.x = s.ball.pos.x + bv.x * lag;
    ballPos.y = s.ball.pos.y + bv.y * lag;
    ballPos.z = Math.max(0, s.ball.pos.z + bv.z * lag);
    ball.update(simDt, ballPos, bv, s.ball.spin);
    for (const g of world.goals) g.update(simDt, ballPos, bv);

    // Controls overlay (computed once per frame).
    const live = finishedAt === null;
    const ov = live ? controls.overlay() : null;
    const calm = ov?.calm ?? null;
    aimPanel.update(calm, controls.touchMode);

    // User marker + tag.
    const ur = user ? rigs.get(user.id) : undefined;
    marker.update(clock, uf?.pos.x ?? 0, uf?.pos.y ?? 0, !!user?.hasBall, !!user);
    if (ur && user) {
      ur.headTop(tagPos);
      const dist = tagPos.distanceTo(camera.position);
      const sc = Math.max(1.4, Math.min(5.5, dist * 0.06));
      tag.sprite.scale.set(sc, sc * 0.25, 1);
      tag.sprite.position.copy(tagPos);
      tag.sprite.position.y += 0.25 + sc * 0.02;
      tag.sprite.visible = !ov?.charge && !calm;
    } else tag.sprite.visible = false;

    // Pass target (who F would pass to) + predicted shot path while charging.
    const pick = ov && ov.mode === 'attack' && !ov.charge && !calm && ov.pass?.id ? ov.pass : null;
    const pf = pick?.id ? frames.get(pick.id) : undefined;
    passMarker.update(clock, pf?.pos.x ?? 0, pf?.pos.y ?? 0, false, !!pf);
    if (calm) {
      // the full noise-free path of the frozen aim (rebuilt only when the aim changed)
      if (calm.version !== aimVersion || !aimShown) {
        aimVersion = calm.version;
        aim.setPath(calm.analysis.path, calm.power, calm.analysis.landing);
        aimShown = true;
        lastPath = null;
      }
    } else {
      if (aimShown) { aimShown = false; aimVersion = -1; aim.setPath(null, 0); }
      const path = ov?.charge && ov.charge.path.length > 1 ? ov.charge.path : null;
      if (path !== lastPath) { aim.setPath(path, ov?.charge?.value ?? 0); lastPath = path; }
    }

    // Camera.
    const sp = Math.hypot(bv.x, bv.y);
    const free = !s.ball.ownerId;
    const followBall = !frozen && free && (s.phase === 'flight' || sp > 14) && s.ball.lastTouchSide === 'us' && mode !== 'top';
    // calm aim overview: looks toward where the kick goes; held still while a stroke is drawn
    // (a moving camera would slide the pitch under the pointer)
    const an = calm?.analysis;
    if (!calm) aimLook = null;
    else if (!calm.drawing || !aimLook) aimLook = an ? an.landing ?? an.path[an.path.length - 1] ?? null : null;
    const overview = aimLook;
    const framing = director.frame(rawDt, {
      mode, user: uf ? uf.pos : null, ball: ballPos, ballVel: bv,
      aiming: false, followBall, aspect: W / H, overview,
    });
    introLeft = Math.max(0, introLeft - rawDt);
    rig.update(rawDt, framing, introLeft > 0 ? 2.2 : director.aimWeight > 0.05 ? 2.4 : followBall ? 2.8 : 3);
    updateAxes();
    focusV.set(ballPos.x, 0, -ballPos.y);
    env.setFocus(focusV);
    aim.update(clock);
    world.update(rawDt, clock, camera, rig.target);

    // HUD.
    if (live && ov) {
      hud.setTime(ov.info.timeLeft ?? (setup.timeLimit > 0 ? 1 - s.time / setup.timeLimit : null));
      if (ov.mode !== hintMode) { hintMode = ov.mode; hintSince = clock; }
      const idle = clock - controls.acted;
      const showHint = !helpOpen && (clock - hintSince < HINT_TIME && clock < 25 || (idle > 6 && idle < 12));
      hud.setHint(showHint ? controls.hint(ov.mode) : null);
      const head = ov.charge && user ? headScreen(user.id, 0.55) : null;
      const badge = pick?.id ? headScreen(pick.id, 0.45) : null;
      let aimFrame: { stroke: { x: number; y: number }[] | null; marks: AimMark[] } | null = null;
      if (calm) {
        // drawn stroke (from the ball) + receiver / interceptor labels, in screen space
        strokeScreen.length = 0;
        if (calm.stroke && calm.stroke.length) {
          const b0 = toScreen({ x: ballPos.x, y: ballPos.y, z: 0.05 });
          if (b0) strokeScreen.push(b0);
          for (const p of calm.stroke) { const q = toScreen({ x: p.x, y: p.y, z: 0.05 }); if (q) strokeScreen.push(q); }
        }
        marks.length = 0;
        const a = calm.analysis;
        if (a.kind === 'pass' && a.receiverId) {
          const hp = headScreen(a.receiverId, 0.5);
          if (hp) marks.push({ x: hp.x, y: hp.y, kind: 'pass', label: `${t('v2d.aim.kind.pass')} → ${surname(a.receiverName ?? '')}` });
        }
        for (const id of a.interceptIds) {
          const hp = headScreen(id, 0.45);
          if (hp) marks.push({ x: hp.x, y: hp.y, kind: 'danger', label: '!' });
        }
        aimFrame = { stroke: strokeScreen.length > 1 ? strokeScreen : null, marks };
      }
      hud.frame({
        charge: head && ov.charge ? { x: head.x, y: head.y, value: ov.charge.value, curl: ov.charge.curl, chip: ov.charge.chip } : null,
        pass: badge ? { x: badge.x, y: badge.y, label: controls.touchMode ? t('v2d.touch.pass') : 'F' } : null,
        aim: aimFrame,
      });
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
      controls.cancel();
      hud.setControlsVisible(false);
      hud.setTime(null);
      hud.setHint(null);
      passMarker.update(clock, 0, 0, false, false);
      aim.setPath(null, 0);
      lastPath = null;
      aimShown = false;
      aimPanel.update(null, false);
      hud.setAiming(false);
      const outcome = s.outcome;
      const text = s.banner ?? (outcome ? t(`view.out.${outcome}`) : null);
      hud.setBanner(text, outcomeTone(outcome));
      bannerHideAt = clock + 2.2;
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
      window.removeEventListener('keydown', onViewKey);
      canvas.removeEventListener('pointerdown', onFirstTouch);
      ro?.disconnect();
      if (!ro) window.removeEventListener('resize', resize);
      controls.dispose();
      touchUi?.dispose();
      aimPanel.dispose();
      hud.dispose();
      setAudioFocus(0);
      rigs.forEach((r) => r.dispose());
      rigs.clear();
      bodyMat.dispose();
      marker.dispose();
      passMarker.dispose();
      blobGeo?.dispose();
      blobMat?.dispose();
      blobTex?.dispose();
      tag.dispose();
      ball.dispose();
      aim.dispose();
      world.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ignore */ }
      canvas.remove();
    },
    project: (p) => toScreen(p),
    setCamera(m) {
      if (!CAMERA_CYCLE.includes(m)) return;
      mode = m;
      hud.setCamera(m);
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
      replay = { frames: sorted, t: start, end, elapsed: 0, onDone, anims: new Map(), seed: Math.random() * Math.PI * 2 };
      controls.cancel();
      hud.setBanner(null);
      passMarker.update(0, 0, 0, false, false);
      aim.setPath(null, 0);
      lastPath = null;
      hud.setReplay(true);
      const f0 = sorted.find((f) => f.t >= start) ?? sorted[0];
      ball.reset(f0.ball);
      for (const p of f0.players) rigs.get(p.id)?.snap({ pos: { x: p.x, y: p.y }, vel: { x: 0, y: 0 }, facing: p.facing, anim: p.anim, animTime: 0 });
      rig.snap(orbitFraming(f0.ball, 0, replay.seed));
    },
  };

  if (opts.showHelp) hud.showHelp(controls.touchMode);
  raf = requestAnimationFrame((n) => { last = n; tick(n); });
  return handle;
}
