/**
 * In-viewport HUD of the 3D view (plain DOM, no React — the view is imperative): an overlay
 * canvas (shot power ring at the user, pass-target badge), camera & help buttons, wind, time
 * bar, contextual hint pill, outcome banner, controls help card and replay chrome. Touch
 * controls (joystick + ŞUT / PAS) are mounted into `controlsLayer` by the view.
 * The flow screen draws its own top bar, so everything here avoids the top ~60 px.
 */
import { t } from '../../core/i18n';
import type { CameraMode } from '../../core/types';
import { CONTROL_ROWS } from '../controls/controls';
import './strings';
import '../view2d/strings';

export interface HudCallbacks {
  onCamera(): void;
  onHelp(open: boolean): void;
  onReplaySkip(): void;
}

export type BannerTone = 'goal' | 'good' | 'neutral' | 'bad';
export type HudContext = 'attack' | 'support' | 'defend' | 'none';

/** What the overlay canvas shows this frame (CSS px, container-relative). */
export interface HudFrame {
  charge: { x: number; y: number; value: number; curl: number; chip: boolean } | null;
  pass: { x: number; y: number; label: string } | null;
}

export interface Hud {
  readonly root: HTMLDivElement;
  /** Layer that hides with the controls (touch controls go here). */
  readonly controlsLayer: HTMLDivElement;
  setBanner(text: string | null, tone?: BannerTone): void;
  setHint(text: string | null): void;
  setCamera(mode: CameraMode): void;
  setWind(angleDeg: number | null, speed: number): void;
  setTime(fraction: number | null): void;
  setReplay(on: boolean): void;
  setControlsVisible(v: boolean): void;
  showHelp(touch?: boolean): void;
  readonly helpOpen: boolean;
  frame(f: HudFrame): void;
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
.nssv-btn{pointer-events:auto;border:1px solid rgba(255,255,255,.14);background:rgba(4,10,7,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#e9f5ee;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:none;transition:transform .12s ease,background .2s ease}
.nssv-btn:active{transform:scale(.94)}
.nssv-btn:hover{background:rgba(10,24,16,.78)}
.nssv-ctl{position:absolute;inset:0;pointer-events:none;transition:opacity .3s ease}
.nssv-ctl.off{opacity:0;pointer-events:none}
.nssv-ctl.off *{pointer-events:none!important}
.nssv-small{position:absolute;left:max(14px,env(safe-area-inset-left));width:44px;height:44px;border-radius:14px}
.nssv-banner{position:absolute;left:0;right:0;top:38%;text-align:center;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:clamp(56px,13vw,150px);line-height:.9;letter-spacing:.04em;color:#fff;opacity:0;transform:scale(.6);transition:opacity .2s ease,transform .35s cubic-bezier(.2,1.6,.4,1);text-shadow:0 6px 30px rgba(0,0,0,.6)}
.nssv-banner.on{opacity:1;transform:scale(1)}
.nssv-banner.goal{color:${GOLD};text-shadow:0 0 30px rgba(255,203,71,.75),0 0 80px rgba(255,140,40,.5),0 6px 24px #000}
.nssv-banner.good{color:${ACCENT};text-shadow:0 0 28px rgba(184,255,60,.6),0 6px 24px #000}
.nssv-banner.bad{color:#ffd0d6;text-shadow:0 0 26px rgba(255,79,100,.65),0 6px 24px #000}
.nssv-hint{position:absolute;left:50%;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 8px);transform:translateX(-50%);max-width:calc(100% - 140px);padding:7px 14px;border-radius:999px;background:rgba(4,10,7,.66);border:1px solid rgba(184,255,60,.35);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .35s ease}
.nssv-hint.on{opacity:1}
.nssv-hint.touch{bottom:calc(max(18px,env(safe-area-inset-bottom)) + 130px)}
.nssv-wind{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:calc(max(18px,env(safe-area-inset-bottom)) + 104px);display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#9db5a7;text-shadow:0 1px 2px #000}
.nssv-wind svg{transition:transform .5s ease}
.nssv-time{position:absolute;left:0;bottom:0;height:3px;background:linear-gradient(90deg,${ACCENT},#3cffb0);box-shadow:0 0 10px ${ACCENT};transition:width .25s linear}
.nssv-time.low{background:${DANGER};box-shadow:0 0 10px ${DANGER}}
.nssv-letter{position:absolute;left:0;right:0;height:9vh;background:#000;transition:transform .5s ease}
.nssv-replay{position:absolute;inset:0;opacity:0;transition:opacity .3s}
.nssv-replay.on{opacity:1;pointer-events:auto;cursor:pointer}
.nssv-replay-tag{position:absolute;left:max(18px,env(safe-area-inset-left));top:calc(9vh + 12px);display:flex;align-items:center;gap:8px;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:30px;letter-spacing:.1em;color:#fff}
.nssv-replay-tag i{width:12px;height:12px;border-radius:50%;background:${DANGER};box-shadow:0 0 12px ${DANGER};animation:nssv-blink 1s steps(2) infinite}
.nssv-replay-hint{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:calc(9vh + 12px);font-size:12px;letter-spacing:.08em;color:#cfe3d7}
.nssv-help{position:absolute;inset:0;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(4,10,7,.72),rgba(0,0,0,.88));display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .25s ease;z-index:8}
.nssv-help.on{opacity:1}
.nssv-help-card{width:min(580px,100%);max-height:100%;overflow:auto;border-radius:20px;border:1px solid rgba(184,255,60,.25);background:linear-gradient(160deg,rgba(22,38,30,.96),rgba(8,16,12,.96));box-shadow:0 30px 80px rgba(0,0,0,.6);padding:18px 18px 14px}
.nssv-help h2{margin:0;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:34px;letter-spacing:.04em;color:${ACCENT};line-height:1}
.nssv-help p.sub{margin:4px 0 12px;color:#9db5a7;font-size:13px}
.nssv-help ul{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.nssv-help li{display:flex;gap:12px;align-items:flex-start;font-size:13.5px;line-height:1.4}
.nssv-help li kbd{flex:none;min-width:112px;text-align:right;font:700 12px Inter,system-ui,sans-serif;color:${ACCENT}}
.nssv-help li kbd span{display:inline-block;padding:2px 7px;border-radius:6px;border:1px solid rgba(184,255,60,.55)}
.nssv-help button{margin-top:14px;width:100%;height:46px;border-radius:14px;border:none;cursor:pointer;background:${ACCENT};color:#081008;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:22px;letter-spacing:.06em}
@keyframes nssv-blink{50%{opacity:.2}}
@media (max-width:520px){.nssv-help li kbd{min-width:84px}}
`;

const ICON = {
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  help: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  wind: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V4"/><path d="M6 10l6-6 6 6"/></svg>',
};

let styleRefs = 0;
let styleEl: HTMLStyleElement | null = null;
function acquireStyle() {
  styleRefs++;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.dataset.nssv = '2';
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

export function createHud(container: HTMLElement, cb: HudCallbacks): Hud {
  acquireStyle();
  const root = el('div', 'nssv', container);
  const canvas = el('canvas', 'nssv-c', root);
  const g = canvas.getContext('2d');
  let W = 1;
  let H = 1;
  let dpr = 1;

  const controls = el('div', 'nssv-ctl', root);

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

  // ── wind, time, hint ──
  const wind = el('div', 'nssv-wind', controls);
  const windArrow = el('span', '', wind, ICON.wind);
  windArrow.style.display = 'flex';
  const windText = el('span', '', wind);
  wind.style.display = 'none';
  const time = el('div', 'nssv-time', root);
  const hint = el('div', 'nssv-hint', root);

  // ── banner ──
  const banner = el('div', 'nssv-banner', root);

  // ── replay chrome ──
  const replay = el('div', 'nssv-replay', root);
  const top = el('div', 'nssv-letter', replay);
  top.style.top = '0';
  top.style.transform = 'translateY(-100%)';
  const bottom = el('div', 'nssv-letter', replay);
  bottom.style.bottom = '0';
  bottom.style.transform = 'translateY(100%)';
  el('div', 'nssv-replay-tag', replay, `<i></i>${t('view.replay.label')}`);
  el('div', 'nssv-replay-hint', replay, t('view.replay.hint'));
  replay.addEventListener('pointerdown', (e) => { e.stopPropagation(); cb.onReplaySkip(); });

  // ── help overlay ──
  let help: HTMLDivElement | null = null;
  const onHelpKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); closeHelp(); };
  const closeHelp = () => {
    if (!help) return;
    const h = help;
    help = null;
    window.removeEventListener('keydown', onHelpKey, true);
    h.classList.remove('on');
    window.setTimeout(() => h.remove(), 250);
    cb.onHelp(false);
  };

  // ── overlay canvas: power ring + pass badge ──
  let drawn = false;
  const drawFrame = (f: HudFrame) => {
    if (!g) return;
    if (!f.charge && !f.pass) {
      if (drawn) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
      return;
    }
    drawn = true;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (f.pass) {
      const { x, y, label } = f.pass;
      g.fillStyle = 'rgba(4,10,7,0.75)';
      g.strokeStyle = ACCENT;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y - 12, 11, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = ACCENT;
      g.font = '800 12px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, x, y - 11.5);
      g.beginPath();
      g.moveTo(x - 5, y + 1);
      g.lineTo(x + 5, y + 1);
      g.lineTo(x, y + 7);
      g.closePath();
      g.fill();
    }
    if (f.charge) {
      const { x, y, value, curl, chip } = f.charge;
      const r = 26;
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = value > 0.85 ? DANGER : value > 0.5 ? GOLD : ACCENT;
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, value));
      g.stroke();
      g.font = '700 11px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(233,245,238,0.95)';
      g.fillText(chip ? t('v2d.aim.chip') : `${t('view.hud.power')} ${Math.round(value * 100)}`, x, y - r - 8);
      if (Math.abs(curl) > 0.05) {
        g.fillStyle = GOLD;
        g.fillText(`${curl > 0 ? '↶' : '↷'} ${t('view.hud.curl')} ${Math.round(Math.abs(curl) * 100)}`, x, y - r - 22);
      }
    }
  };

  let bannerOn = false;
  let hintText = '';
  const hud: Hud = {
    root,
    controlsLayer: controls,
    get helpOpen() { return help !== null; },
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
    setHint(text) {
      if (text && text !== hintText) { hintText = text; hint.textContent = text; }
      hint.classList.toggle('on', !!text);
    },
    setCamera(mode) {
      camBtn.title = `${t('view.hud.camera')}: ${t(`view.cam.${mode}`)} (V)`;
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
    setReplay(on) {
      replay.classList.toggle('on', on);
      top.style.transform = on ? 'translateY(0)' : 'translateY(-100%)';
      bottom.style.transform = on ? 'translateY(0)' : 'translateY(100%)';
      if (on) { hud.setBanner(null); drawFrame({ charge: null, pass: null }); }
      controls.classList.toggle('off', on);
      hint.classList.remove('on');
    },
    setControlsVisible(v) {
      controls.classList.toggle('off', !v);
      if (!v) { hint.classList.remove('on'); drawFrame({ charge: null, pass: null }); }
    },
    showHelp(touch = false) {
      if (help) return;
      const h = el('div', 'nssv-help', root);
      help = h;
      const card = el('div', 'nssv-help-card', h);
      el('h2', '', card, t('v2d.help.title'));
      el('p', 'sub', card, t('v2d.help.sub'));
      const ul = el('ul', '', card);
      const row = (k: string, v: string) => {
        const li = el('li', '', ul);
        el('span', '', el('kbd', '', li)).textContent = k;
        el('span', '', li).textContent = v;
      };
      if (touch) row('◎', t('v2d.hint.touch'));
      else {
        for (const [k, v] of CONTROL_ROWS) row(k, t(v));
        row(t('v2d.help.mouseKey'), t('v2d.help.mouse'));
        row('V', t('view.help.camera'));
      }
      const go = el('button', '', card, t('v2d.help.go'));
      go.type = 'button';
      const stop = (e: Event) => e.stopPropagation();
      h.addEventListener('pointerdown', stop);
      h.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === h || e.target === go) closeHelp(); });
      requestAnimationFrame(() => h.classList.add('on'));
      window.setTimeout(() => window.addEventListener('keydown', onHelpKey, true), 150);
      cb.onHelp(true);
    },
    frame(f) { drawFrame(f); },
    resize(w, h) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      drawn = true;
    },
    dispose() {
      window.removeEventListener('keydown', onHelpKey, true);
      root.remove();
      releaseStyle();
    },
  };
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
