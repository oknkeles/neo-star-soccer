/**
 * Hosts one real-time moment: creates the engine, mounts the three.js view into a full-bleed
 * container and reports the MomentResult exactly once. Falls back (onFail) when WebGL, the
 * engine or the view are unavailable, so the match can always continue.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { CameraMode, MomentEvent, MomentResult, MomentSetup, ReplayFrame } from '../../../core/types';
import { createMoment, type MomentEngine } from '../../../match/engine/api';
import { mountMomentView, type MomentViewHandle } from '../../../match/view/api';
import { safeAutoResolve } from '../../../match/flow/api';
import { HELP_FLAG, hasWebGL, momentRng, readFlag, writeFlag } from './helpers';
import { useLiveSettings } from './parts';

export interface StageApi {
  engine: MomentEngine;
  /** Auto-resolve the rest of the moment (engine skip, with a statistical safety net). */
  skip(): void;
  setCamera(mode: CameraMode): void;
  /** Play the recorded replay; returns false when not possible. */
  replay(frames: ReplayFrame[], onDone: () => void): boolean;
}

export function MomentStage({
  setup, apiRef, onResult, onFail, onEvent, children,
}: {
  setup: MomentSetup;
  apiRef: RefObject<StageApi | null>;
  onResult: (r: MomentResult) => void;
  onFail: (err: unknown) => void;
  onEvent?: (e: MomentEvent) => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const settings = useLiveSettings();
  const cbs = useRef({ onResult, onFail, onEvent });
  cbs.current = { onResult, onFail, onEvent };
  // settings are read once per moment (camera changes go through the api)
  const initial = useRef(settings);
  const help = useRef(!readFlag(HELP_FLAG));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let engine: MomentEngine;
    let handle: MomentViewHandle | null = null;
    let done = false;
    let finishedSeen = 0;
    const timers: number[] = [];

    const deliver = (r: MomentResult) => {
      if (done) return;
      done = true;
      cbs.current.onResult(r);
    };
    const finish = () => {
      if (done) return;
      let r: MomentResult | null = null;
      try { if (engine.isFinished()) r = engine.result(); } catch { r = null; }
      deliver(r ?? safeAutoResolve(setup, momentRng(setup, 1)));
    };

    try {
      if (!hasWebGL()) throw new Error('WebGL unavailable');
      engine = createMoment(setup);
      const s = initial.current;
      const showHelp = help.current;
      handle = mountMomentView(el, engine, setup, {
        camera: s.camera,
        quality: s.graphics.quality,
        shadows: s.graphics.shadows,
        showHelp,
        onEvent: (e) => cbs.current.onEvent?.(e),
        onFinished: finish,
      });
      if (showHelp) writeFlag(HELP_FLAG);
    } catch (err) {
      try { handle?.dispose(); } catch { /* ignore */ }
      // defer so the parent is not updated during its own commit
      const id = window.setTimeout(() => cbs.current.onFail(err), 0);
      return () => clearTimeout(id);
    }

    // watchdog: the engine finished but the view never reported back
    const watch = window.setInterval(() => {
      if (done) return;
      let fin = false;
      try { fin = engine.isFinished(); } catch { fin = false; }
      if (!fin) { finishedSeen = 0; return; }
      finishedSeen += 1;
      if (finishedSeen > 16) finish(); // ~4 s
    }, 250);

    apiRef.current = {
      engine,
      skip: () => {
        if (done) return;
        try { engine.input({ kind: 'skip' }); } catch { /* engine refused */ }
        // safety net: if the engine still has not finished, resolve statistically
        timers.push(window.setTimeout(() => {
          if (done) return;
          let fin = false;
          try { fin = engine.isFinished(); } catch { fin = false; }
          if (fin) finish();
          else deliver(safeAutoResolve(setup, momentRng(setup, 2)));
        }, 3000));
      },
      setCamera: (mode) => { try { handle?.setCamera(mode); } catch { /* ignore */ } },
      replay: (frames, onDone) => {
        if (!handle || !frames.length) return false;
        try { handle.playReplay(frames, onDone); return true; } catch { return false; }
      },
    };

    return () => {
      done = true;
      clearInterval(watch);
      timers.forEach((id) => clearTimeout(id));
      apiRef.current = null;
      try { handle?.dispose(); } catch { /* ignore */ }
    };
  }, [setup, apiRef]);

  return (
    <div className="fixed inset-0 z-40 bg-black select-none touch-none">
      <div ref={box} className="absolute inset-0" />
      {children}
    </div>
  );
}
