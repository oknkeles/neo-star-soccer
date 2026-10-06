/** Settings → Saves: slots, export current career (JSON download), import a file, delete. */
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { t } from '../../../../core/i18n';
import { SLOT_COUNT, game, useGame } from '../../../../game/api';
import { Button, Card, Spinner, toast } from '../../../components/kit';
import Modal from '../../../components/SafeModal';
import { Segmented } from '../../../components/controls';
import { errText } from '../helpers';
import { SlotCard, slotNumbers, useSaves } from '../title/SaveSlots';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function SavesSection() {
  const { state } = useGame();
  const { saves, loading, reload } = useSaves();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importSlot, setImportSlot] = useState(() => 0);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const bySlot = new Map(saves.map((s) => [s.slot, s]));

  const exportNow = () => {
    try {
      const p = state ? state.world.players[state.career.playerId] : null;
      const slug = p ? `${p.lastName}`.toLowerCase().replace(/[^a-z0-9]+/gi, '-') : 'career';
      download(`nss-${slug}-${state?.season ?? 'save'}.json`, game.exportSave());
      toast(t('shell.set.saves.exported'), 'accent', 'download');
    } catch (e) {
      toast(errText(e), 'danger');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await game.importSave(await file.text(), importSlot);
      toast(t('shell.set.saves.imported', { n: importSlot + 1 }), 'accent', 'upload');
      await reload();
    } catch (e) {
      toast(`${t('shell.set.saves.importFail')}: ${errText(e)}`, 'danger', 'shield_alert');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doDelete = async () => {
    if (confirmDel === null) return;
    try {
      await game.deleteSave(confirmDel);
      toast(t('shell.title.deleted'), 'neutral', 'trash');
    } catch (e) {
      toast(errText(e), 'danger');
    }
    setConfirmDel(null);
    await reload();
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title={t('shell.set.saves.slots')} icon="save">
        {loading ? <Spinner /> : (
          <div className="grid grid-cols-1 gap-2.5">
            {slotNumbers.map((n) => <SlotCard key={n} slot={n} meta={bySlot.get(n)} mode="load" onPick={() => { /* loading happens from the title screen */ }} onDelete={setConfirmDel} />)}
            {saves.length === 0 && <p className="text-sm text-ink-dim">{t('shell.title.noSaves')}</p>}
          </div>
        )}
        <p className="text-xs text-ink-mute mt-3">{t('shell.set.saves.where')}</p>
      </Card>

      <Card title={t('shell.set.saves.backup')} icon="download">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={!state} onClick={exportNow}><Download size={16} />{t('shell.set.saves.export')}</Button>
            {!state && <span className="text-xs text-ink-mute">{t('shell.set.saves.exportNone')}</span>}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-mute mb-2">{t('shell.set.saves.importInto')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented options={Array.from({ length: SLOT_COUNT }, (_, i) => ({ id: i, label: String(i + 1) }))} value={importSlot} onChange={setImportSlot} size="sm" />
              <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />{t('shell.set.saves.import')}</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </div>
            {bySlot.has(importSlot) && <p className="text-xs text-gold mt-2">{t('shell.set.saves.importOver', { n: importSlot + 1 })}</p>}
          </div>
        </div>
      </Card>

      <Modal
        open={confirmDel !== null} onClose={() => setConfirmDel(null)} size="sm" title={t('shell.title.deleteTitle')}
        footer={<><Button variant="ghost" onClick={() => setConfirmDel(null)}>{t('common.cancel')}</Button><Button variant="danger" icon="skull" onClick={doDelete}>{t('shell.title.delete')}</Button></>}
      >
        <p className="text-ink-dim">{t('shell.title.deleteConfirm')}</p>
      </Modal>
    </div>
  );
}
