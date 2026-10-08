/** Route 'settings'. Language, AI, display & sound, saves, help. Owner: ui-shell agent. */
import { useState } from 'react';
import { t } from '../../core/i18n';
import { updateSettings } from '../../core/settings';
import { useSettings } from '../../game/api';
import { Card, ScreenHeader, Tabs } from '../components/kit';
import { Segmented, SettingRow } from '../components/controls';
import '../../match/view2d/strings';
import { CONTROL_ROWS } from '../../match/controls/controls';
import AiSection from './shell/settings/AiSection';
import { DisplaySoundSection, GeneralSection } from './shell/settings/GeneralSection';
import SavesSection from './shell/settings/SavesSection';
import HelpSection from './shell/settings/HelpSection';
import { useLang } from './shell/helpers';
import './shell/strings';

const TABS = ['general', 'ai', 'av', 'saves', 'help'] as const;
type Tab = (typeof TABS)[number];
const ICON: Record<Tab, string> = { general: 'settings', ai: 'bot', av: 'tv', saves: 'save', help: 'info' };

export default function SettingsScreen({ params }: { params: Record<string, string> }) {
  useLang();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'general');
  return (
    <div className="max-w-3xl mx-auto">
      <ScreenHeader title={t('shell.set.title')} subtitle={t('shell.set.subtitle')} icon="settings" backTo="back" />
      <Tabs className="mb-5" value={tab} onChange={(v) => setTab(v as Tab)} tabs={TABS.map((id) => ({ id, label: t(`shell.set.tab.${id}`), icon: ICON[id] }))} />
      {tab === 'general' && (
        <div className="grid grid-cols-1 gap-4">
          <GeneralSection />
          <MatchSection />
        </div>
      )}
      {tab === 'ai' && <AiSection />}
      {tab === 'av' && <DisplaySoundSection />}
      {tab === 'saves' && <SavesSection />}
      {tab === 'help' && (
        <div className="grid grid-cols-1 gap-4">
          <ControlsCard />
          <HelpSection />
        </div>
      )}
    </div>
  );
}

/** Match view (3D default / simple 2D) + the shared controls. */
function MatchSection() {
  const s = useSettings();
  return (
    <>
      <Card title={t('v2d.set.title')} icon="gamepad">
        <SettingRow title={t('v2d.set.view')} desc={t('v2d.set.viewDesc')}>
          <Segmented
            options={[{ id: '3d', label: t('v2d.set.3d') }, { id: '2d', label: t('v2d.set.2d') }]}
            value={s.matchView ?? '3d'} onChange={(v) => updateSettings((x) => { x.matchView = v as '2d' | '3d'; })}
          />
        </SettingRow>
      </Card>
      <ControlsCard />
    </>
  );
}

function ControlsCard() {
  return (
    <Card title={t('v2d.set.controls')} icon="gamepad">
      <ul className="space-y-2 text-sm">
        {CONTROL_ROWS.map(([k, v]) => (
          <li key={v} className="flex gap-3 items-start">
            <span className="shrink-0 min-w-[7.5rem] text-right">
              <kbd className="inline-block rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-xs font-bold text-accent">{k}</kbd>
            </span>
            <span className="text-ink-dim">{t(v)}</span>
          </li>
        ))}
        <li className="flex gap-3 items-start">
          <span className="shrink-0 min-w-[7.5rem] text-right">
            <kbd className="inline-block rounded-md border border-line bg-white/5 px-1.5 py-0.5 text-xs font-bold">{t('v2d.help.mouseKey')}</kbd>
          </span>
          <span className="text-ink-dim">{t('v2d.help.mouse')}</span>
        </li>
        <li className="text-ink-mute text-xs pt-1">{t('v2d.hint.touch')}</li>
      </ul>
    </Card>
  );
}
