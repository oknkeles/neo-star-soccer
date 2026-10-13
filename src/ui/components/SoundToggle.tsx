/**
 * Mute / unmute button and the global "M" shortcut. Both flip settings.audio.muted;
 * the audio module listens to settings changes, so sound follows immediately.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';
import { getSettings, onSettingsChange, updateSettings } from '../../core/settings';
import { registerStrings, t } from '../../core/i18n';
import { audio } from '../../audio/api';

registerStrings('sound', {
  tr: { mute: 'Sesi kapat (M)', unmute: 'Sesi aç (M)' },
  en: { mute: 'Mute (M)', unmute: 'Unmute (M)' },
});

export function toggleMute(): void {
  updateSettings((s) => { s.audio.muted = !s.audio.muted; });
  audio.refresh();
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (cb) => onSettingsChange(cb),
    () => getSettings().audio.muted,
    () => false,
  );
}

/** Registers the "M" key once for the whole app (ignored while typing). */
export function useMuteShortcut(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'm' && e.key !== 'M') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function SoundToggle({ className, size = 16 }: { className?: string; size?: number }) {
  const muted = useMuted();
  const label = muted ? t('sound.unmute') : t('sound.mute');
  return (
    <button
      type="button"
      onClick={toggleMute}
      title={label}
      aria-label={label}
      aria-pressed={muted}
      className={clsx(
        'grid place-items-center h-9 w-9 rounded-xl border cursor-pointer transition-colors shrink-0',
        muted ? 'border-danger/40 bg-danger/10 text-danger' : 'border-line bg-white/5 text-ink-dim hover:text-ink',
        className,
      )}
    >
      {muted ? <VolumeX size={size} /> : <Volume2 size={size} />}
    </button>
  );
}
