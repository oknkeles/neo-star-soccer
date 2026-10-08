/** Settings → Help & About (the match controls are listed by the ControlsCard above it). */
import { t } from '../../../../core/i18n';
import { Card } from '../../../components/kit';

export default function HelpSection() {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title={t('shell.set.about.title')} icon="info">
        <div className="text-sm text-ink-dim leading-relaxed grid gap-2">
          <p><span className="font-display text-2xl text-ink">NEO STAR SOCCER</span> · v0.1</p>
          <p>{t('shell.set.about.body')}</p>
          <p className="text-xs text-ink-mute">{t('shell.title.credits')}</p>
        </div>
      </Card>
    </div>
  );
}
