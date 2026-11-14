// Pharmacy → Item: "Template" downloads the CSV template, "Import" reads a filled-in copy,
// shows a preview with any problems per line, then imports (all rows or none).
import { useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { checkItemRows, decodeFile, MAX_IMPORT_ROWS, rowsFromCsv, templateCsv } from '../../../shared/itemImport.js';
import { Modal, Note, useToast } from './ui.jsx';
import { ImportPreview } from './PatientImport.jsx';

export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'item-import-template.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ItemImportButtons({ onImported }) {
  const { t } = useT();
  const toast = useToast();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);   // { fileName, rows: [{ line, data, errors }] }
  const [saving, setSaving] = useState(false);

  async function readFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                           // the same file can be chosen again after fixing it
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { toast(t('itemImport.csvOnly'), 'error'); return; }
    const { rows, missing, found } = rowsFromCsv(decodeFile(await file.arrayBuffer()));
    if (missing.length) {
      toast(t('itemImport.missingColumns', { cols: missing.join(', '), found: found.slice(0, 8).join(', ') || '-' }), 'error');
      return;
    }
    if (!rows.length) { toast(t('itemImport.empty'), 'error'); return; }
    if (rows.length > MAX_IMPORT_ROWS) { toast(t('itemImport.tooMany', { n: MAX_IMPORT_ROWS }), 'error'); return; }
    setPreview({ fileName: file.name, raw: rows, rows: checkItemRows(rows) });
  }

  async function doImport() {
    setSaving(true);
    try {
      const r = await api('/pharmacy/item-master/import', { method: 'POST', body: { rows: preview.raw } });
      toast(t('itemImport.done', { created: r.created, updated: r.updated }));
      setPreview(null);
      onImported?.();
    } catch (err) {
      if (err.code === 'IMPORT_INVALID' && Array.isArray(err.details)) {
        // show the server's findings on the matching lines
        const byLine = new Map(err.details.map((d) => [d.line, d.errors]));
        setPreview((p) => ({ ...p, rows: p.rows.map((r) => ({ ...r, errors: byLine.get(r.line) || [] })) }));
      }
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const bad = preview?.rows.filter((r) => r.errors.length).length || 0;
  return (
    <>
      <button type="button" className="btn-secondary" onClick={downloadTemplate}><Download size={16} /> {t('itemImport.template')}</button>
      <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> {t('itemImport.import')}</button>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={readFile} />

      <Modal open={!!preview} size="xl" title={preview ? t('itemImport.previewTitle', { file: preview.fileName }) : ''} onClose={() => !saving && setPreview(null)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setPreview(null)} disabled={saving}><X size={16} /> {t('common.cancel')}</button>
            <button type="button" className="btn-primary" onClick={doImport} disabled={saving || bad > 0}>
              <Upload size={16} /> {saving ? t('common.saving') : t('itemImport.importN', { n: preview?.rows.length })}
            </button>
          </>
        )}>
        {preview && (
          <>
            <Note tone={bad ? 'error' : 'info'} className="mt-0">{bad ? t('itemImport.fixFirst', { n: bad }) : t('itemImport.ready', { n: preview.rows.length })}</Note>
            <ImportPreview
              head={[t('itemImport.line'), t('items.name'), t('items.unit'), t('items.category'), t('items.mrp'), t('items.sellPrice'), t('field.status')]}
              rows={preview.rows}
              cells={(r) => [r.data.name || '-', r.data.unit, r.data.category || '-', r.data.mrp, r.data.price]}
              errText={(r) => r.errors.map((e) => t(`itemImport.err.${e.code}`)).join('; ')} />
            <p className="mt-2 text-12 text-ink-400">{t('itemImport.hint')}</p>
          </>
        )}
      </Modal>
    </>
  );
}
