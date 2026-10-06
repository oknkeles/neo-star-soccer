/**
 * In-viewport HUD (plain DOM, no React — the view is imperative): gesture overlay canvas
 * (drawn path, power ring, curl indicator), loft slider, PAS!/DEPAR buttons, camera & help
 * buttons, focus meter, wind, time bar, outcome banner, coach-marks help and replay chrome.
 * The flow screen draws its own top bar, so everything here avoids the top ~60 px.
 */
import { t } from '../../core/i18n';
import type { CameraMode } from '../../core/types';
import './strings';

export interface HudCallbacks {
  onCall(through: boolean): void;
  onSprint(on: boolean): void;
  onLoft(v: number): void;
  onCamera(): void;
  onHelp(open: boolean): void;
  onReplaySkip(): void;
}

export interface AimVisual {
  /** Drawn path in CSS px (container-relative). */
  points: { x: number; y: number }[];
  /** Ball on screen. */
  anchor: { x: number; y: number } | null;
  power: number;
  curl: number;
  valid: boolean;
}

export type BannerTone = 'goal' | 'good' | 'neutral' | 'bad';
export type HudContext = 'attack' | 'support' | 'defend' | 'none';

export interface Hud {
  readonly root: HTMLDivElement;
  setLoft(v: number): void;
  setAim(a: AimVisual | null): void;
  setFocus(v: number | null): void;
  setBanner(text: string | null, tone?: BannerTone): void;
  setContext(c: HudContext, hint: boolean): void;
  setCamera(mode: CameraMode): void;
  setWind(angleDeg: number | null, speed: number): void;
  setTime(fraction: number | null): void;
  setAftertouch(v: number): void;
  setReplay(on: boolean): void;
  setControlsVisible(v: boolean): void;
  showHelp(): void;
  readonly helpOpen: boolean;
  resize(w: number, h: number): void;
  dispose(): void;
}

const ACCENT = '#b8ff3c';
const GOLD = '#ffcb47';
const DANGER = '#ff4f64';

const CSS = `
.nssv{position:absolute;inset:0;pointer-events:none;font-family:var(--font-sans,Inter,system-ui,sans-serif);color:#e9f5ee;user-select:none;-webkit-user-select:none;overflow:hidden;z-index:5}
.nssv *{box-sizing:border-box}
.nssv-c{position:absolute;inset:0;width:100%;height:100%}
.nssv-btn{pointer-events:auto;border:1px solid rgba(255,255,255,.14);background:rgba(4,10,7,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#e9f5ee;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:none;transition:transform .12s ease,background .2s ease,box-shadow .2s ease}
.nssv-btn:active,.nssv-btn.on{transform:scale(.94)}
.nssv-btn:hover{background:rgba(10,24,16,.78)}
.nssv-ctl{transition:opacity .3s ease}
.nssv-ctl.off{opacity:0;pointer-events:none}
.nssv-ctl.off *{pointer-events:none}
.nssv-call{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:84px;height:84px;border-radius:50%;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:26px;letter-spacing:.06em;border:2px solid ${ACCENT};color:${ACCENT};box-shadow:0 0 22px rgba(184,255,60,.25),inset 0 0 18px rgba(184,255,60,.12)}
.nssv-call small{display:block;font-size:11px;letter-spacing:.12em;color:#9db5a7;margin-top:-4px}
.nssv-call.pulse{animation:nssv-pulse 1.1s ease-in-out infinite}
.nssv-call.def{font-size:17px;border-color:${DANGER};color:${DANGER};box-shadow:0 0 22px rgba(255,79,100,.25)}
.nssv-sprint{position:absolute;right:calc(max(16px,env(safe-area-inset-right)) + 96px);bottom:max(22px,env(safe-area-inset-bottom));width:62px;height:62px;border-radius:50%;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:17px;letter-spacing:.08em}
.nssv-sprint.on{border-color:${GOLD};color:${GOLD};box-shadow:0 0 18px rgba(255,203,71,.35)}
.nssv-small{position:absolute;left:max(14px,env(safe-area-inset-left));width:44px;height:44px;border-radius:14px}
.nssv-loft{position:absolute;right:max(14px,env(safe-area-inset-right));top:50%;transform:translateY(-62%);width:46px;height:min(38vh,250px);min-height:130px;pointer-events:auto;touch-action:none;cursor:ns-resize}
.nssv-loft-track{position:absolute;left:50%;top:22px;bottom:22px;width:8px;margin-left:-4px;border-radius:6px;background:linear-gradient(to top,rgba(255,255,255,.12),rgba(255,203,71,.35));border:1px solid rgba(255,255,255,.15)}
.nssv-loft-fill{position:absolute;left:0;right:0;bottom:0;border-radius:6px;background:linear-gradient(to top,${ACCENT},${GOLD})}
.nssv-loft-thumb{position:absolute;left:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:#0b1711;border:2px solid ${GOLD};box-shadow:0 0 14px rgba(255,203,71,.45);display:flex;align-items:center;justify-content:center}
.nssv-loft-thumb::after{content:'';width:10px;height:10px;border-radius:50%;background:#fff}
.nssv-loft-lbl{position:absolute;right:0;text-align:right;font-size:10px;font-weight:700;letter-spacing:.08em;color:#9db5a7;white-space:nowrap;text-shadow:0 1px 2px #000}
.nssv-focus{position:absolute;left:50%;top:max(64px,calc(env(safe-area-inset-top) + 56px));transform:translateX(-50%);width:min(46vw,240px);opacity:0;transition:opacity .2s}
.nssv-focus.on{opacity:1}
.nssv-focus-bar{height:6px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;border:1px solid rgba(255,255,255,.12)}
.nssv-focus-fill{height:100%;background:linear-gradient(90deg,#49c6ff,${ACCENT});box-shadow:0 0 10px #49c6ff}
.nssv-focus-lbl{font-size:10px;letter-spacing:.2em;font-weight:700;color:#49c6ff;text-align:center;margin-bottom:3px;text-shadow:0 1px 2px #000}
.nssv-banner{position:absolute;left:0;right:0;top:38%;text-align:center;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:clamp(56px,13vw,150px);line-height:.9;letter-spacing:.04em;color:#fff;opacity:0;transform:scale(.6);transition:opacity .25s ease,transform .45s cubic-bezier(.2,1.6,.4,1);text-shadow:0 6px 30px rgba(0,0,0,.6)}
.nssv-banner.on{opacity:1;transform:scale(1)}
.nssv-banner.goal{color:${GOLD};text-shadow:0 0 30px rgba(255,203,71,.75),0 0 80px rgba(255,140,40,.5),0 6px 24px #000;animation:nssv-throb .7s ease-in-out infinite alternate}
.nssv-banner.good{color:${ACCENT};text-shadow:0 0 28px rgba(184,255,60,.6),0 6px 24px #000}
.nssv-banner.bad{color:#ffd0d6;text-shadow:0 0 26px rgba(255,79,100,.65),0 6px 24px #000}
.nssv-hint{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 96px);transform:translateX(-50%);padding:7px 14px;border-radius:999px;background:rgba(4,10,7,.62);border:1px solid rgba(184,255,60,.35);font-size:13px;font-weight:600;white-space:nowrap;opacity:0;transition:opacity .35s ease;backdrop-filter:blur(6px)}
.nssv-hint.on{opacity:1}
.nssv-wind{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:calc(max(18px,env(safe-area-inset-bottom)) + 104px);display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#9db5a7;text-shadow:0 1px 2px #000}
.nssv-wind svg{transition:transform .5s ease}
.nssv-time{position:absolute;left:0;bottom:0;height:3px;background:linear-gradient(90deg,${ACCENT},#3cffb0);box-shadow:0 0 10px ${ACCENT};transition:width .25s linear}
.nssv-time.low{background:${DANGER};box-shadow:0 0 10px ${DANGER}}
.nssv-after{position:absolute;left:50%;top:30%;transform:translateX(-50%);font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:24px;letter-spacing:.12em;color:#49c6ff;text-shadow:0 0 16px #49c6ff;opacity:0;transition:opacity .2s}
.nssv-after.on{opacity:1}
.nssv-letter{position:absolute;left:0;right:0;height:9vh;background:#000;transition:transform .5s ease}
.nssv-replay{position:absolute;inset:0;opacity:0;transition:opacity .3s}
.nssv-replay.on{opacity:1;pointer-events:auto;cursor:pointer}
.nssv-replay-tag{position:absolute;left:max(18px,env(safe-area-inset-left));top:calc(9vh + 12px);display:flex;align-items:center;gap:8px;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:30px;letter-spacing:.1em;color:#fff}
.nssv-replay-tag i{width:12px;height:12px;border-radius:50%;background:${DANGER};box-shadow:0 0 12px ${DANGER};animation:nssv-blink 1s steps(2) infinite}
.nssv-replay-hint{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:calc(9vh + 12px);font-size:12px;letter-spacing:.08em;color:#cfe3d7}
.nssv-help{position:absolute;inset:0;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(4,10,7,.72),rgba(0,0,0,.88));display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .3s ease;z-index:3}
.nssv-help.on{opacity:1}
.nssv-help-card{width:min(560px,100%);max-height:100%;overflow:auto;border-radius:20px;border:1px solid rgba(184,255,60,.25);background:linear-gradient(160deg,rgba(22,38,30,.96),rgba(8,16,12,.96));box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 40px rgba(184,255,60,.08);padding:20px 20px 16px}
.nssv-help h2{margin:0;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:34px;letter-spacing:.04em;color:${ACCENT};line-height:1}
.nssv-help p.sub{margin:4px 0 14px;color:#9db5a7;font-size:13px}
.nssv-help ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.nssv-help li{display:flex;gap:12px;align-items:flex-start;font-size:13.5px;line-height:1.4}
.nssv-help li svg{flex:none;margin-top:1px}
.nssv-help li b{color:${GOLD};font-weight:700}
.nssv-help button{margin-top:16px;width:100%;height:46px;border-radius:14px;border:none;cursor:pointer;background:${ACCENT};color:#081008;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:22px;letter-spacing:.06em;box-shadow:0 0 24px rgba(184,255,60,.35)}
@keyframes nssv-pulse{0%,100%{box-shadow:0 0 18px rgba(184,255,60,.25)}50%{box-shadow:0 0 34px rgba(184,255,60,.65),inset 0 0 22px rgba(184,255,60,.25)}}
@keyframes nssv-throb{from{transform:scale(1)}to{transform:scale(1.06)}}
@keyframes nssv-blink{50%{opacity:.2}}
@media (max-width:420px){.nssv-call{width:74px;height:74px;font-size:23px}.nssv-sprint{width:56px;height:56px;right:calc(max(16px,env(safe-area-inset-right)) + 84px)}}
`;

let styleRefs = 0;
let styleEl: HTMLStyleElement | null = null;
function acquireStyle() {
  styleRefs++;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.dataset.nssv = '1';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
}
function releaseStyle() {
  styleRefs = Math.max(0, styleRefs - 1);
  if (styleRefs === 0 && styleEl) { styleEl.remove(); styleEl = null; }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const ICON = {
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  help: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  wind: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V4"/><path d="M6 10l6-6 6 6"/></svg>',
  run: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M4 22l4-7 3 2 2-5 4 3 3-1"/><path d="M8 8l4-2 3 3"/></svg>`,
  shoot: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="19" r="2.5"/><path d="M7 17L19 5"/><path d="M13 5h6v6"/></svg>`,
  curl: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="20" r="2.5"/><path d="M6.5 18C14 16 20 11 19 3"/><path d="M15.5 5L19 3l1.5 3.8"/></svg>`,
  loft: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#49c6ff" stroke-width="2" stroke-linecap="round"><path d="M12 3v18"/><path d="M8 7l4-4 4 4"/><path d="M8 17l4 4 4-4"/></svg>`,
  after: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#49c6ff" stroke-width="2" stroke-linecap="round"><path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/></svg>`,
  pass: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round"><path d="M4 12h12"/><path d="M12 6l6 6-6 6"/><circle cx="20.5" cy="12" r="1.5"/></svg>`,
  defend: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${DANGER}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/></svg>`,
  cam: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9db5a7" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="15" height="11" rx="2"/><path d="M17 11l5-3v9l-5-3"/></svg>`,
};

export function createHud(container: HTMLElement, cb: HudCallbacks): Hud {
  acquireStyle();
  const root = el('div', 'nssv', container);
  const canvas = el('canvas', 'nssv-c', root);
  const g = canvas.getContext('2d');
  let W = 1;
  let H = 1;
  let dpr = 1;

  const controls = el('div', 'nssv-ctl', root);
  controls.style.cssText = 'position:absolute;inset:0;pointer-events:none';

  // ── call / sprint ──
  const call = el('button', 'nssv-btn nssv-call', controls);
  call.type = 'button';
  const callLabel = el('span', '', call);
  let lastCallTap = 0;
  call.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    const through = now - lastCallTap < 330;
    lastCallTap = now;
    cb.onCall(through);
  });

  const sprint = el('button', 'nssv-btn nssv-sprint', controls, t('view.hud.sprint'));
  sprint.type = 'button';
  let sprintOn = false;
  const setSprint = (on: boolean) => {
    if (sprintOn === on) return;
    sprintOn = on;
    sprint.classList.toggle('on', on);
    cb.onSprint(on);
  };
  sprint.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sprint.setPointerCapture?.(e.pointerId);
    setSprint(true);
  });
  const sprintOff = (e: PointerEvent) => { e.stopPropagation(); setSprint(false); };
  sprint.addEventListener('pointerup', sprintOff);
  sprint.addEventListener('pointercancel', sprintOff);

  // ── camera / help ──
  const camBtn = el('button', 'nssv-btn nssv-small', controls, ICON.camera);
  camBtn.type = 'button';
  camBtn.style.bottom = 'calc(max(18px, env(safe-area-inset-bottom)) + 52px)';
  camBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  camBtn.addEventListener('click', (e) => { e.stopPropagation(); cb.onCamera(); });
  const helpBtn = el('button', 'nssv-btn nssv-small', controls, ICON.help);
  helpBtn.type = 'button';
  helpBtn.style.bottom = 'max(18px, env(safe-area-inset-bottom))';
  helpBtn.title = t('view.hud.help');
  helpBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  helpBtn.addEventListener('click', (e) => { e.stopPropagation(); hud.showHelp(); });

  // ── loft slider ──
  const loft = el('div', 'nssv-loft', controls);
  loft.title = `${t('view.hud.loft')} (${t('view.hud.loftHint')})`;
  const lblHigh = el('div', 'nssv-loft-lbl', loft, t('view.hud.loftHigh'));
  lblHigh.style.top = '0';
  const lblLow = el('div', 'nssv-loft-lbl', loft, t('view.hud.loftLow'));
  lblLow.style.bottom = '0';
  const track = el('div', 'nssv-loft-track', loft);
  const fill = el('div', 'nssv-loft-fill', track);
  const thumb = el('div', 'nssv-loft-thumb', track);
  let loftValue = 0.15;
  const renderLoft = () => {
    const p = `${(loftValue * 100).toFixed(1)}%`;
    fill.style.height = p;
    thumb.style.top = `${(100 - loftValue * 100).toFixed(1)}%`;
  };
  const loftFromEvent = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    const v = 1 - (e.clientY - r.top) / Math.max(1, r.height);
    loftValue = Math.max(0, Math.min(1, v));
    renderLoft();
    cb.onLoft(loftValue);
  };
  let loftDrag = false;
  loft.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    loftDrag = true;
    loft.setPointerCapture?.(e.pointerId);
    loftFromEvent(e);
  });
  loft.addEventListener('pointermove', (e) => { if (loftDrag) { e.stopPropagation(); loftFromEvent(e); } });
  const loftUp = (e: PointerEvent) => { loftDrag = false; e.stopPropagation(); };
  loft.addEventListener('pointerup', loftUp);
  loft.addEventListener('pointercancel', loftUp);
  renderLoft();

  // ── focus, wind, time, hint, aftertouch ──
  const focus = el('div', 'nssv-focus', root);
  el('div', 'nssv-focus-lbl', focus, t('view.hud.focus'));
  const focusFill = el('div', 'nssv-focus-fill', el('div', 'nssv-focus-bar', focus));
  const wind = el('div', 'nssv-wind', controls);
  const windArrow = el('span', '', wind, ICON.wind);
  windArrow.style.display = 'flex';
  const windText = el('span', '', wind);
  wind.style.display = 'none';
  const time = el('div', 'nssv-time', root);
  const hint = el('div', 'nssv-hint', root);
  const after = el('div', 'nssv-after', root, t('view.hud.after'));
  let afterTimer = 0;

  // ── banner ──
  const banner = el('div', 'nssv-banner', root);

  // ── replay chrome ──
  const replay = el('div', 'nssv-replay', root);
  const top = el('div', 'nssv-letter', replay);
  top.style.top = '0';
  const bottom = el('div', 'nssv-letter', replay);
  bottom.style.bottom = '0';
  el('div', 'nssv-replay-tag', replay, `<i></i>${t('view.replay.label')}`);
  el('div', 'nssv-replay-hint', replay, t('view.replay.hint'));
  replay.addEventListener('pointerdown', (e) => { e.stopPropagation(); cb.onReplaySkip(); });

  // ── help overlay ──
  let help: HTMLDivElement | null = null;
  const closeHelp = () => {
    if (!help) return;
    const h = help;
    help = null;
    h.classList.remove('on');
    window.setTimeout(() => h.remove(), 300);
    cb.onHelp(false);
  };

  let aim: AimVisual | null = null;
  let aimDirty = true;
  let raf = 0;

  const draw = () => {
    raf = 0;
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!aim) return;
    const pts = aim.points;
    const col = aim.power > 0.85 ? DANGER : aim.power > 0.55 ? GOLD : ACCENT;
    if (pts.length > 1) {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // Glow + core.
      for (const [w, a] of [[16, 0.12], [9, 0.25], [3.5, 1]] as const) {
        g.strokeStyle = col;
        g.globalAlpha = aim.valid ? a : a * 0.4;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
      }
      g.globalAlpha = 1;
      // Arrow head at the end.
      const a = pts[pts.length - 1];
      const b = pts[Math.max(0, pts.length - 4)];
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(a.x + Math.cos(ang) * 12, a.y + Math.sin(ang) * 12);
      g.lineTo(a.x + Math.cos(ang + 2.5) * 11, a.y + Math.sin(ang + 2.5) * 11);
      g.lineTo(a.x + Math.cos(ang - 2.5) * 11, a.y + Math.sin(ang - 2.5) * 11);
      g.fill();
    }
    const an = aim.anchor ?? pts[0];
    if (an) {
      // Power ring.
      const r = 30;
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.arc(an.x, an.y, r, 0, Math.PI * 2);
      g.stroke();
      const grad = g.createLinearGradient(an.x - r, an.y, an.x + r, an.y);
      grad.addColorStop(0, ACCENT);
      grad.addColorStop(0.6, GOLD);
      grad.addColorStop(1, DANGER);
      g.strokeStyle = grad;
      g.shadowColor = col;
      g.shadowBlur = 12;
      g.beginPath();
      g.arc(an.x, an.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, aim.power));
      g.stroke();
      g.shadowBlur = 0;
      // Labels.
      g.font = `600 11px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(233,245,238,0.9)';
      g.fillText(`${t('view.hud.power')} ${Math.round(aim.power * 100)}`, an.x, an.y - r - 10);
      // Curl readout above the power label, with the bend direction.
      if (Math.abs(aim.curl) > 0.02) {
        const m = Math.abs(aim.curl);
        g.fillStyle = GOLD;
        g.font = `700 12px Inter, system-ui, sans-serif`;
        g.fillText(`${aim.curl > 0 ? '↶' : '↷'} ${t('view.hud.curl')} ${Math.round(m * 100)} · ${t(aim.curl > 0 ? 'view.hud.curlLeft' : 'view.hud.curlRight')}`, an.x, an.y - r - 26);
      }
    }
  };
  const schedule = () => {
    if (!aimDirty || raf) return;
    aimDirty = false;
    raf = requestAnimationFrame(draw);
  };

  let ctx: HudContext = 'none';
  let bannerOn = false;
  const hud: Hud = {
    root,
    get helpOpen() { return help !== null; },
    setLoft(v) {
      loftValue = Math.max(0, Math.min(1, v));
      renderLoft();
    },
    setAim(a) {
      aim = a;
      aimDirty = true;
      schedule();
    },
    setFocus(v) {
      focus.classList.toggle('on', v !== null);
      if (v !== null) focusFill.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    },
    setBanner(text, tone = 'neutral') {
      if (!text) {
        banner.classList.remove('on', 'goal', 'good', 'bad');
        bannerOn = false;
        return;
      }
      banner.textContent = text;
      banner.classList.remove('goal', 'good', 'bad');
      if (tone !== 'neutral') banner.classList.add(tone);
      if (!bannerOn) {
        bannerOn = true;
        banner.classList.remove('on');
        void banner.offsetWidth;
        banner.classList.add('on');
      }
    },
    setContext(c, showHint) {
      if (c !== ctx) {
        ctx = c;
        call.classList.toggle('def', c === 'defend');
        callLabel.innerHTML = c === 'defend'
          ? `${t('view.hud.tackle')}`
          : `${t('view.hud.call')}<small>${t('view.hud.through')} ×2</small>`;
        call.style.display = c === 'attack' || c === 'none' ? 'none' : 'flex';
        call.classList.toggle('pulse', c === 'support');
      }
      const msg = c === 'attack' ? t('view.hud.dragHint') : c === 'defend' ? t('view.hud.defendHint') : c === 'support' ? t('view.hud.callHint') : '';
      if (msg && hint.textContent !== msg) hint.textContent = msg;
      hint.classList.toggle('on', showHint && !!msg);
    },
    setCamera(mode) {
      camBtn.title = `${t('view.hud.camera')}: ${t(`view.cam.${mode}`)}`;
    },
    setWind(angle, speed) {
      if (angle === null || speed < 0.6) { wind.style.display = 'none'; return; }
      wind.style.display = 'flex';
      windArrow.style.transform = `rotate(${angle.toFixed(0)}deg)`;
      windText.textContent = `${t('view.hud.wind')} ${t('view.hud.windUnit', { v: speed.toFixed(1) })}`;
    },
    setTime(f) {
      if (f === null) { time.style.display = 'none'; return; }
      time.style.display = 'block';
      time.style.width = `${(Math.max(0, Math.min(1, f)) * 100).toFixed(1)}%`;
      time.classList.toggle('low', f < 0.2);
    },
    setAftertouch(v) {
      if (Math.abs(v) < 0.05) return;
      after.textContent = `${t('view.hud.after')} ${v > 0 ? '↶' : '↷'}`;
      after.classList.add('on');
      clearTimeout(afterTimer);
      afterTimer = window.setTimeout(() => after.classList.remove('on'), 700);
    },
    setReplay(on) {
      replay.classList.toggle('on', on);
      top.style.transform = on ? 'translateY(0)' : 'translateY(-100%)';
      bottom.style.transform = on ? 'translateY(0)' : 'translateY(100%)';
      if (on) { hud.setAim(null); hud.setFocus(null); hud.setBanner(null); }
      controls.classList.toggle('off', on);
      hint.classList.toggle('on', false);
    },
    setControlsVisible(v) {
      controls.classList.toggle('off', !v);
      if (!v) { hint.classList.remove('on'); setSprint(false); }
    },
    showHelp() {
      if (help) return;
      const h = el('div', 'nssv-help', root);
      help = h;
      const card = el('div', 'nssv-help-card', h);
      el('h2', '', card, t('view.help.title'));
      el('p', 'sub', card, t('view.help.subtitle'));
      const ul = el('ul', '', card);
      const items: [string, string][] = [
        [ICON.run, 'view.help.move'], [ICON.shoot, 'view.help.shoot'], [ICON.curl, 'view.help.curl'],
        [ICON.loft, 'view.help.loft'], [ICON.after, 'view.help.after'], [ICON.pass, 'view.help.pass'],
        [ICON.defend, 'view.help.defend'], [ICON.cam, 'view.help.camera'],
      ];
      for (const [icon, key] of items) {
        const li = el('li', '', ul, icon);
        el('span', '', li).textContent = t(key);
      }
      const go = el('button', '', card, t('view.help.go'));
      go.type = 'button';
      const stop = (e: Event) => e.stopPropagation();
      h.addEventListener('pointerdown', stop);
      h.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === h || e.target === go) closeHelp(); });
      requestAnimationFrame(() => h.classList.add('on'));
      cb.onHelp(true);
    },
    resize(w, h) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      aimDirty = true;
      schedule();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(afterTimer);
      root.remove();
      releaseStyle();
    },
  };
  hud.setContext('attack', false);
  hud.setContext('none', false);
  return hud;
}

/** Banner tone for an outcome. */
export function outcomeTone(outcome: string | null): BannerTone {
  switch (outcome) {
    case 'goal': return 'goal';
    case 'assist': case 'tackle_won': case 'interception': case 'pass_completed': case 'penalty_won': case 'foul_won':
    case 'chance_created': case 'cleared': case 'drill_complete':
      return 'good';
    case 'conceded': case 'lost_ball': case 'tackle_lost': case 'foul_conceded': case 'offside':
      return 'bad';
    default: return 'neutral';
  }
}
