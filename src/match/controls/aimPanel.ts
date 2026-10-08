/**
 * Calm-mode aim panel (plain DOM, shared by the 3D and 2D views): a soft "game stopped" frame,
 * a tag saying what the kick means (PAS → name / ŞUT / BOŞLUĞA, interception warning), and a
 * bottom card with the power meter (0–100 %), curl, the loft toggle (Yerden / Yarım / Havadan)
 * and VUR / İptal buttons (touch confirms with VUR). DOM writes only when something changed.
 */
import { t } from '../../core/i18n';
import type { CalmOverlay, Controls } from './controls';
import '../view2d/strings';

export interface AimPanel {
  update(ov: CalmOverlay | null, touch: boolean): void;
  dispose(): void;
}

const CSS = `
.nssa{position:absolute;inset:0;pointer-events:none;z-index:7;font-family:var(--font-sans,Inter,system-ui,sans-serif);color:#e9f5ee;opacity:0;transition:opacity .22s ease;user-select:none;-webkit-user-select:none}
.nssa.on{opacity:1}
.nssa *{box-sizing:border-box}
.nssa-vig{position:absolute;inset:0;box-shadow:inset 0 0 0 2px rgba(120,200,255,.35),inset 0 0 90px rgba(20,60,110,.55)}
.nssa-tag{position:absolute;left:50%;top:calc(max(10px,env(safe-area-inset-top)) + 56px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;max-width:calc(100% - 32px)}
.nssa-stop{font:800 10px Inter,system-ui,sans-serif;letter-spacing:.22em;color:#9fd4ff;text-shadow:0 1px 3px #000}
.nssa-kind{padding:6px 16px;border-radius:999px;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif);font-size:26px;letter-spacing:.06em;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;background:rgba(4,10,7,.78);border:1.5px solid rgba(255,255,255,.25);box-shadow:0 6px 20px rgba(0,0,0,.4)}
.nssa-kind.pass{color:#b8ff3c;border-color:rgba(184,255,60,.7)}
.nssa-kind.shot{color:#ffcb47;border-color:rgba(255,203,71,.75)}
.nssa-kind.free{color:#e9f5ee}
.nssa-sub{font:700 12px Inter,system-ui,sans-serif;padding:2px 10px;border-radius:999px;background:rgba(4,10,7,.7);color:#cfe3d7;white-space:nowrap}
.nssa-sub.bad{color:#fff;background:rgba(200,40,60,.85)}
.nssa-sub.good{color:#0b1210;background:rgba(184,255,60,.9)}
.nssa-card{position:absolute;left:50%;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 6px);transform:translateX(-50%);width:min(440px,calc(100% - 32px));pointer-events:auto;touch-action:none;border-radius:18px;background:rgba(6,14,10,.86);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 36px rgba(0,0,0,.45);padding:10px 12px 9px;display:grid;gap:8px}
.nssa-row{display:flex;align-items:center;gap:10px}
.nssa-lbl{flex:none;width:52px;font:800 11px Inter,system-ui,sans-serif;letter-spacing:.1em;color:#9db5a7}
.nssa-bar{position:relative;flex:1;height:12px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
.nssa-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;transition:width .08s linear,background-color .2s}
.nssa-val{flex:none;width:44px;text-align:right;font:800 15px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums}
.nssa-curl{flex:1;font:700 13px Inter,system-ui,sans-serif;color:#ffcb47;white-space:nowrap}
.nssa-seg{flex:none;display:flex;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.18)}
.nssa-seg button{border:0;background:transparent;color:#cfe3d7;font:700 12px Inter,system-ui,sans-serif;padding:6px 9px;cursor:pointer;touch-action:none}
.nssa-seg button.on{background:#b8ff3c;color:#0b1210}
.nssa-btns{display:grid;grid-template-columns:1fr 2fr;gap:8px}
.nssa-btns button{height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.18);cursor:pointer;touch-action:none;font:800 14px Inter,system-ui,sans-serif;letter-spacing:.04em}
.nssa-cancel{background:rgba(255,255,255,.06);color:#e9f5ee}
.nssa-kick{background:#b8ff3c;color:#0b1210;border-color:#e8ffb0!important;font-family:var(--font-display,'Bebas Neue',Impact,sans-serif)!important;font-size:22px!important;font-weight:400!important}
.nssa-keys{font:500 11.5px/1.35 Inter,system-ui,sans-serif;color:#9db5a7;text-align:center}
.nssa-keys b{color:#e9f5ee;font-weight:700}
@media (max-width:420px){.nssa-kind{font-size:22px}.nssa-lbl{width:44px}.nssa-seg button{padding:6px 7px}}
`;

let styleRefs = 0;
let styleEl: HTMLStyleElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** "Ahmet Yılmaz" → "YILMAZ". */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] || name).toLocaleUpperCase('tr');
}

const powerColor = (p: number) => (p < 0.55 ? '#b8ff3c' : p < 0.85 ? '#ffcb47' : '#ff4f64');

export function mountAimPanel(parent: HTMLElement, controls: Controls): AimPanel {
  styleRefs++;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.dataset.nssa = '1';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
  const root = el('div', 'nssa', parent);
  root.style.display = 'none';
  el('div', 'nssa-vig', root);
  const tag = el('div', 'nssa-tag', root);
  el('div', 'nssa-stop', tag, t('v2d.aim.stopped'));
  const kind = el('div', 'nssa-kind', tag);
  const sub = el('div', 'nssa-sub', tag);

  const card = el('div', 'nssa-card', root);
  const stop = (e: Event) => { e.stopPropagation(); };
  card.addEventListener('pointerdown', stop);
  card.addEventListener('wheel', stop);
  const r1 = el('div', 'nssa-row', card);
  el('span', 'nssa-lbl', r1, t('v2d.aim.power'));
  const bar = el('div', 'nssa-bar', r1);
  const fill = el('div', 'nssa-fill', bar);
  const val = el('span', 'nssa-val', r1);
  const r2 = el('div', 'nssa-row', card);
  el('span', 'nssa-lbl', r2, t('v2d.aim.curl'));
  const curl = el('span', 'nssa-curl', r2);
  const seg = el('div', 'nssa-seg', r2);
  const lofts = [0, 1, 2].map((i) => {
    const b = el('button', '', seg, t(`v2d.aim.loft.${i}`));
    b.type = 'button';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); controls.aimSetLoft(i); });
    return b;
  });
  const btns = el('div', 'nssa-btns', card);
  const cancel = el('button', 'nssa-cancel', btns, t('v2d.aim.cancel'));
  cancel.type = 'button';
  cancel.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); controls.aimAbort(); });
  const kick = el('button', 'nssa-kick', btns, t('v2d.aim.kick'));
  kick.type = 'button';
  kick.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); controls.aimConfirm(); });
  const keys = el('div', 'nssa-keys', card);

  let shown = false;
  let last = '';
  let lastTouch: boolean | null = null;
  let hideT = 0;

  return {
    update(ov, touch) {
      if (!ov) {
        if (shown) {
          shown = false;
          root.classList.remove('on');
          hideT = window.setTimeout(() => { if (!shown) root.style.display = 'none'; }, 230);
        }
        return;
      }
      if (!shown) {
        shown = true;
        clearTimeout(hideT);
        root.style.display = '';
        void root.offsetWidth;
        root.classList.add('on');
      }
      if (touch !== lastTouch) {
        lastTouch = touch;
        keys.innerHTML = touch ? t('v2d.aim.touchHelp') : t('v2d.aim.keys');
        cancel.textContent = touch ? t('v2d.aim.cancel') : `${t('v2d.aim.cancel')} · Esc`;
        kick.textContent = touch ? t('v2d.aim.kick') : `${t('v2d.aim.kick')} · SPACE`;
      }
      const a = ov.analysis;
      const pw = Math.round(ov.power * 100);
      const cu = Math.round(ov.curl * 100);
      const danger = a.interceptIds.length;
      const key = `${a.kind}|${a.receiverName}|${a.onTarget}|${a.snapped}|${danger}|${pw}|${cu}|${ov.loftIdx}`;
      if (key === last) return;
      last = key;
      kind.className = `nssa-kind ${a.kind}`;
      kind.textContent = a.kind === 'pass' ? `${t('v2d.aim.kind.pass')} → ${surname(a.receiverName ?? '')}`
        : a.kind === 'shot' ? t('v2d.aim.kind.shot') : t('v2d.aim.kind.free');
      let subText = '';
      let subCls = '';
      if (danger) { subText = t('v2d.aim.danger', { n: danger }); subCls = 'bad'; }
      else if (a.kind === 'shot') { subText = a.onTarget ? t('v2d.aim.onTarget') : t('v2d.aim.offTarget'); subCls = a.onTarget ? 'good' : ''; }
      else if (a.kind === 'pass' && a.snapped) { subText = t('v2d.aim.assist'); subCls = 'good'; }
      sub.textContent = subText;
      sub.className = `nssa-sub ${subCls}`;
      sub.style.display = subText ? '' : 'none';
      fill.style.width = `${Math.max(3, pw)}%`;
      fill.style.backgroundColor = powerColor(ov.power);
      val.textContent = `${pw}%`;
      val.style.color = powerColor(ov.power);
      curl.textContent = Math.abs(cu) < 4 ? t('v2d.aim.curlNone') : `${cu > 0 ? '↶' : '↷'} ${Math.abs(cu)}%`;
      lofts.forEach((b, i) => b.classList.toggle('on', i === ov.loftIdx));
    },
    dispose() {
      clearTimeout(hideT);
      root.remove();
      styleRefs = Math.max(0, styleRefs - 1);
      if (styleRefs === 0 && styleEl) { styleEl.remove(); styleEl = null; }
    },
  };
}
