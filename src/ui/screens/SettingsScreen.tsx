/** Route 'settings'. Language, AI, display & sound, saves, help. Owner: ui-shell agent. */
import { useState } from 'react';
import { t } from '../../core/i18n';
import { ScreenHeader, Tabs } from '../components/kit';
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
      {tab === 'general' && <GeneralSection />}
      {tab === 'ai' && <AiSection />}
      {tab === 'av' && <DisplaySoundSection />}
      {tab === 'saves' && <SavesSection />}
      {tab === 'help' && <HelpSection />}
    </div>
  );
}
