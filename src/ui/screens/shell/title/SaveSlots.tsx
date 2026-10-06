/** Save-slot list (load / pick a slot for a new career) with delete-confirm. */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Plus, Trash2, Trophy } from 'lucide-react';
import { t } from '../../../../core/i18n';
import { SLOT_COUNT, game, type SaveMeta } from '../../../../game/api';
import { Button, Spinner, clsx, toast } from '../../../components/kit';
import Modal from '../../../components/SafeModal';
import { errText, formatDateTime } from '../helpers';

export function useSaves(): { saves: SaveMeta[]; loading: boolean; reload: () => Promise<void> } {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      setSaves(await game.listSaves());
    } catch {
      setSaves([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { saves, loading, reload };
}

export const slotNumbers = Array.from({ length: SLOT_COUNT }, (_, i) => i);

export function SlotCard({ slot, meta, mode, onPick, onDelete }: {
  slot: number; meta?: SaveMeta; mode: 'load' | 'new'; onPick: (slot: number) => void; onDelete?: (slot: number) => void;
}) {
  const empty = !meta;
  const disabled = mode === 'load' && empty;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: slot * 0.06 }}
      className={clsx('relative rounded-2xl border p-3.5 flex items-center gap-3', empty ? 'border-dashed border-line bg-white/2' : 'border-line bg-white/5')}
    >
      <button
        disabled={disabled}
        onClick={() => onPick(slot)}
        className="flex-1 min-w-0 text-left flex items-center gap-3 cursor-pointer disabled:cursor-default disabled:opacity-50"
      >
        <span className={clsx('grid place-items-center size-12 rounded-xl font-display text-2xl shrink-0', empty ? 'bg-white/5 text-ink-mute' : 'bg-accent/12 text-accent')}>
          {empty ? <Plus size={20} /> : slot + 1}
        </span>
        <span className="min-w-0">
          {meta ? (
            <>
              <span className="block font-bold truncate">{meta.name}</span>
              <span className="block text-xs text-ink-dim truncate">{meta.club}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-dim mt-0.5">
                <span className="flex items-center gap-1"><Trophy size={11} />{t('common.overall')} {meta.overall}</span>
                <span className="flex items-center gap-1"><Calendar size={11} />{meta.season}/{String((meta.season + 1) % 100).padStart(2, '0')} · {t('common.week')} {meta.week + 1}</span>
                <span className="text-ink-mute">{formatDateTime(meta.savedAt)}</span>
              </span>
            </>
          ) : (
            <>
              <span className="block font-semibold text-ink-dim">{t('shell.title.slotEmpty', { n: slot + 1 })}</span>
              {mode === 'new' && <span className="block text-xs text-ink-mute">{t('shell.title.slotEmptyHint')}</span>}
            </>
          )}
        </span>
      </button>
      {meta && mode === 'new' && <span className="text-[11px] font-bold uppercase tracking-wide text-gold shrink-0">{t('shell.title.overwrite')}</span>}
      {meta && onDelete && (
        <button onClick={() => onDelete(slot)} aria-label={t('shell.title.delete')} className="p-2 rounded-xl text-ink-mute hover:text-danger hover:bg-danger/10 cursor-pointer shrink-0">
          <Trash2 size={17} />
        </button>
      )}
    </motion.div>
  );
}

/** Slot picker / loader modal. */
export function SlotsModal({ open, mode, onClose, onPick, saves, loading, reload }: {
  open: boolean; mode: 'load' | 'new'; onClose: () => void; onPick: (slot: number) => void;
  saves: SaveMeta[]; loading: boolean; reload: () => Promise<void>;
}) {
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [confirmOver, setConfirmOver] = useState<number | null>(null);
  const bySlot = new Map(saves.map((s) => [s.slot, s]));

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

  const pick = (slot: number) => {
    if (mode === 'new' && bySlot.has(slot)) setConfirmOver(slot);
    else onPick(slot);
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="md" title={mode === 'load' ? t('shell.title.loadTitle') : t('shell.title.pickSlot')}>
        {loading ? <div className="py-8 grid place-items-center"><Spinner /></div> : (
          <div className="grid grid-cols-1 gap-2.5 pt-1">
            {mode === 'new' && <p className="text-sm text-ink-dim mb-1">{t('shell.title.pickSlotHint')}</p>}
            {slotNumbers.map((n) => <SlotCard key={n} slot={n} meta={bySlot.get(n)} mode={mode} onPick={pick} onDelete={mode === 'load' ? setConfirmDel : undefined} />)}
            {mode === 'load' && saves.length === 0 && <p className="text-sm text-ink-dim text-center py-2">{t('shell.title.noSaves')}</p>}
          </div>
        )}
      </Modal>
      <Modal
        open={confirmDel !== null} onClose={() => setConfirmDel(null)} size="sm" title={t('shell.title.deleteTitle')}
        footer={<><Button variant="ghost" onClick={() => setConfirmDel(null)}>{t('common.cancel')}</Button><Button variant="danger" icon="skull" onClick={doDelete}>{t('shell.title.delete')}</Button></>}
      >
        <p className="text-ink-dim">{t('shell.title.deleteConfirm')}</p>
      </Modal>
      <Modal
        open={confirmOver !== null} onClose={() => setConfirmOver(null)} size="sm" title={t('shell.title.overwriteTitle')}
        footer={<><Button variant="ghost" onClick={() => setConfirmOver(null)}>{t('common.cancel')}</Button><Button variant="gold" onClick={() => { const s = confirmOver; setConfirmOver(null); if (s !== null) onPick(s); }}>{t('shell.title.overwrite')}</Button></>}
      >
        <p className="text-ink-dim">{t('shell.title.overwriteConfirm')}</p>
      </Modal>
    </>
  );
}
