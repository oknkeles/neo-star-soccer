/** Settings → AI: enable, key, model, per-feature toggles, connection test, privacy note. */
import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, ShieldCheck, XCircle } from 'lucide-react';
import type { AIFeature } from '../../../../core/types';
import { t } from '../../../../core/i18n';
import { AI_MODELS, updateSettings } from '../../../../core/settings';
import { aiFeatureLabel, resumeAI, testConnection } from '../../../../ai/api';
import { useSettings } from '../../../../game/api';
import { Button, Card, Icon, clsx } from '../../../components/kit';
import { Segmented, SettingRow, Switch } from '../../../components/controls';
import { attempt } from '../helpers';

const FEATURES: AIFeature[] = ['genesis', 'news', 'social', 'press', 'negotiation', 'events', 'chat', 'biography'];

export default function AiSection() {
  const s = useSettings();
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const hasKey = s.ai.apiKey.trim().length > 10;

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testConnection());
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card glow={s.ai.enabled && hasKey ? 'accent' : undefined}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center size-11 rounded-2xl bg-violet/15 text-violet shrink-0"><Icon name="bot" size={22} /></span>
          <div className="min-w-0 flex-1 font-display text-3xl leading-none">{t('shell.set.ai.title')}</div>
          <Switch checked={s.ai.enabled} onChange={(v) => { updateSettings((x) => { x.ai.enabled = v; }); if (v) resumeAI(); }} label={t('shell.set.ai.enable')} />
        </div>
        <p className="text-sm text-ink-dim mt-3 leading-relaxed">{t('shell.set.ai.intro')}</p>

        <div className={clsx('mt-4 grid gap-4', !s.ai.enabled && 'opacity-60')}>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] font-bold text-ink-mute mb-1.5" htmlFor="ai-key">{t('shell.set.ai.key')}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Icon name="key" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
                <input
                  id="ai-key" type={show ? 'text' : 'password'} value={s.ai.apiKey} autoComplete="off" spellCheck={false}
                  placeholder="sk-ant-…" onChange={(e) => { setResult(null); updateSettings((x) => { x.ai.apiKey = e.target.value.trim(); }); }}
                  className="w-full h-11 rounded-xl bg-white/5 border border-line pl-10 pr-3 font-mono text-sm outline-none focus:border-accent/60"
                />
              </div>
              <Button variant="secondary" aria-label={show ? t('shell.set.ai.hide') : t('shell.set.ai.show')} onClick={() => setShow((x) => !x)}>
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </Button>
            </div>
          </div>

          <SettingRow title={t('shell.set.ai.model')} desc={t('shell.set.ai.modelDesc')} stack>
            <Segmented
              options={AI_MODELS.map((m) => ({ id: m.id as string, label: m.label.replace('Claude ', '') }))}
              value={s.ai.model} onChange={(id) => updateSettings((x) => { x.ai.model = id; })}
            />
          </SettingRow>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={testing} disabled={!hasKey} onClick={test} icon="zap">{testing ? t('shell.set.ai.testing') : t('shell.set.ai.test')}</Button>
            {result && (
              <span className={clsx('flex items-start gap-2 text-sm rounded-xl px-3 py-2 border', result.ok ? 'text-accent border-accent/35 bg-accent/8' : 'text-danger border-danger/35 bg-danger/8')}>
                {result.ok ? <CheckCircle2 size={17} className="shrink-0 mt-0.5" /> : <XCircle size={17} className="shrink-0 mt-0.5" />}{result.message}
              </span>
            )}
            {!hasKey && <span className="text-xs text-ink-mute">{t('shell.set.ai.noKey')}</span>}
          </div>
        </div>
      </Card>

      <Card title={t('shell.set.ai.features')} icon="sparkles">
        <div className={clsx(!s.ai.enabled && 'opacity-60')}>
          {FEATURES.map((f) => {
            const info = attempt(() => aiFeatureLabel(f), { label: f, description: '' });
            return (
              <SettingRow key={f} title={info.label} desc={info.description}>
                <Switch checked={s.ai.features[f]} onChange={(v) => updateSettings((x) => { x.ai.features[f] = v; })} label={info.label} />
              </SettingRow>
            );
          })}
        </div>
      </Card>

      <Card className="border-info/25">
        <div className="flex gap-3">
          <ShieldCheck size={22} className="text-info shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-ink-dim">
            <div className="font-bold text-ink mb-1">{t('shell.set.ai.privacyTitle')}</div>
            <p>{t('shell.set.ai.privacy')}</p>
            <p className="mt-2">{t('shell.set.ai.cost')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
