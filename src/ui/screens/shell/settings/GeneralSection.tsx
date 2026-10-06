/** Settings → General + Display & Sound. */
import type { CameraMode } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { updateSettings } from '../../../../core/settings';
import { audio } from '../../../../audio/api';
import { useSettings } from '../../../../game/api';
import { Card } from '../../../components/kit';
import { Segmented, SettingRow, Slider, Switch } from '../../../components/controls';

export function GeneralSection() {
  const s = useSettings();
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title={t('shell.set.lang')} icon="languages">
        <SettingRow title={t('shell.set.lang')} desc={t('shell.set.langDesc')}>
          <Segmented options={[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }]} value={s.lang} onChange={(l) => updateSettings((x) => { x.lang = l; })} />
        </SettingRow>
      </Card>
      <Card title={t('shell.set.gameplay')} icon="target">
        <SettingRow title={t('shell.set.difficulty')} desc={t('shell.set.difficultyDesc')}>
          <Segmented
            options={(['easy', 'normal', 'hard'] as const).map((d) => ({ id: d, label: t(`shell.set.diff.${d}`) }))}
            value={s.difficulty} onChange={(d) => updateSettings((x) => { x.difficulty = d; })}
          />
        </SettingRow>
        <SettingRow title={t('shell.set.camera')} desc={t('shell.set.cameraDesc')}>
          <Segmented
            options={(['behind', 'broadcast', 'top'] as CameraMode[]).map((c) => ({ id: c, label: t(`shell.set.cam.${c}`) }))}
            value={s.camera} onChange={(c) => updateSettings((x) => { x.camera = c; })}
          />
        </SettingRow>
        <SettingRow title={t('shell.set.slowmo')} desc={t('shell.set.slowmoDesc')}>
          <Switch checked={s.slowmoAim} onChange={(v) => updateSettings((x) => { x.slowmoAim = v; })} label={t('shell.set.slowmo')} />
        </SettingRow>
        <SettingRow title={t('shell.set.speed')} desc={t('shell.set.speedDesc')}>
          <div className="w-full sm:w-64"><Slider value={s.matchSpeed} min={0.5} max={4} step={0.25} format={(v) => `${v}×`} onChange={(v) => updateSettings((x) => { x.matchSpeed = v; })} /></div>
        </SettingRow>
      </Card>
    </div>
  );
}

export function DisplaySoundSection() {
  const s = useSettings();
  const vol = (key: 'master' | 'sfx' | 'crowd') => (
    <div className="w-full sm:w-64">
      <Slider value={s.audio[key]} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} disabled={s.audio.muted}
        onChange={(v) => { updateSettings((x) => { x.audio[key] = v; }); audio.refresh(); if (key === 'sfx') audio.play('click'); }} />
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title={t('shell.set.gfx')} icon="sparkles">
        <SettingRow title={t('shell.set.quality')} desc={t('shell.set.qualityDesc')}>
          <Segmented
            options={(['low', 'medium', 'high'] as const).map((q) => ({ id: q, label: t(`shell.set.q.${q}`) }))}
            value={s.graphics.quality} onChange={(q) => updateSettings((x) => { x.graphics.quality = q; })}
          />
        </SettingRow>
        <SettingRow title={t('shell.set.shadows')} desc={t('shell.set.shadowsDesc')}>
          <Switch checked={s.graphics.shadows} onChange={(v) => updateSettings((x) => { x.graphics.shadows = v; })} label={t('shell.set.shadows')} />
        </SettingRow>
      </Card>
      <Card title={t('shell.set.audio')} icon="radio">
        <SettingRow title={t('shell.set.mute')}>
          <Switch checked={s.audio.muted} onChange={(v) => { updateSettings((x) => { x.audio.muted = v; }); audio.refresh(); }} label={t('shell.set.mute')} />
        </SettingRow>
        <SettingRow title={t('shell.set.master')}>{vol('master')}</SettingRow>
        <SettingRow title={t('shell.set.sfx')}>{vol('sfx')}</SettingRow>
        <SettingRow title={t('shell.set.crowd')}>{vol('crowd')}</SettingRow>
      </Card>
    </div>
  );
}
