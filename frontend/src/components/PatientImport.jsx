// Registration → Patient Registration / Patient List:
//  "Template" downloads the CSV template (same fields as the registration screen),
//  "Import" reads a filled-in copy, shows a preview with any problems per line, then imports (all rows or none),
//  "Download" saves every patient of the clinic as a CSV file.
import { useRef, useState } from 'react';
import { Download, Upload, FileDown, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import {
  checkPatientRows, decodeFile, MAX_PATIENT_IMPORT, patientRowsFromCsv, patientsCsv, patientTemplateCsv,
} from '../../../shared/patientImport.js';
import { Badge, Modal, Note, TH, TD, useToast } from './ui.jsx';

function saveCsv(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

export function PatientDownloadButton({ clinicCode }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const { rows } = await api('/patients/export');
      saveCsv(patientsCsv(rows), `patients-${clinicCode || 'clinic'}-${today()}.csv`);
      toast(t('patientImport.downloaded', { n: rows.length }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="btn-secondary" disabled={busy} onClick={download}><FileDown size={16} /> {t('patientImport.download')}</button>;
}

/** The preview table of an import (Patient / Item): rows marked red where a line has problems. */
export function ImportPreview({ head, rows, cells, errText }) {
  return (
    <div className="max-h-[50vh] overflow-auto rounded-lg">
      <table className="list-pinned pin-first w-full min-w-[640px] text-left text-13">
        <thead>
          <tr className="table-head">{head.map((h, i) => <th key={h} className={`${TH} sticky top-0 whitespace-nowrap ${i === 0 ? 'rounded-l-lg' : ''} ${i === head.length - 1 ? 'rounded-r-lg' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line} className={r.errors.length ? '[&>td]:!bg-red-50' : ''}>
              <td className={`${TD} text-ink-500`}>{r.line}</td>
              {cells(r).map((c, i) => <td key={i} className={`${TD} text-ink-600`}>{c}</td>)}
              <td className={TD}>{r.errors.length ? <span className="text-12 font-medium text-red-600">{errText(r)}</span> : <Badge tone="success">OK</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PatientImportButtons({ onImported }) {
  const { t } = useT();
  const toast = useToast();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);   // { fileName, raw, rows: [{ line, data, errors }] }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  async function readFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                           // the same file can be chosen again after fixing it
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { toast(t('itemImport.csvOnly'), 'error'); return; }
    const { rows, missing, found } = patientRowsFromCsv(decodeFile(await file.arrayBuffer()));
    if (missing.length) {
      toast(t('itemImport.missingColumns', { cols: missing.join(', '), found: found.slice(0, 8).join(', ') || '-' }), 'error');
      return;
    }
    if (!rows.length) { toast(t('patientImport.empty'), 'error'); return; }
    if (rows.length > MAX_PATIENT_IMPORT) { toast(t('itemImport.tooMany', { n: MAX_PATIENT_IMPORT }), 'error'); return; }
    setPreview({ fileName: file.name, raw: rows, rows: checkPatientRows(rows) });
  }

  async function doImport() {
    setSaving(true);
    try {
      const r = await api('/patients/import', { method: 'POST', body: { rows: preview.raw } });
      setPreview(null);
      setResult(r);
      onImported?.();
    } catch (err) {
      if (err.code === 'IMPORT_INVALID' && Array.isArray(err.details)) {
        const byLine = new Map(err.details.map((d) => [d.line, d.errors]));
        setPreview((p) => ({ ...p, rows: p.rows.map((r) => ({ ...r, errors: byLine.get(r.line) || [] })) }));
      }
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const bad = preview?.rows.filter((r) => r.errors.length).length || 0;
  const muted = (s) => <span className="text-ink-400">{s}</span>;
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => saveCsv(patientTemplateCsv(), 'patient-import-template.csv')}>
        <Download size={16} /> {t('itemImport.template')}
      </button>
      <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} /> {t('itemImport.import')}</button>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={readFile} />

      <Modal open={!!preview} size="xl" title={preview ? t('patientImport.previewTitle', { file: preview.fileName }) : ''} onClose={() => !saving && setPreview(null)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setPreview(null)} disabled={saving}><X size={16} /> {t('common.cancel')}</button>
            <button type="button" className="btn-primary" onClick={doImport} disabled={saving || bad > 0}>
              <Upload size={16} /> {saving ? t('common.saving') : t('patientImport.importN', { n: preview?.rows.length })}
            </button>
          </>
        )}>
        {preview && (
          <>
            <Note tone={bad ? 'error' : 'info'} className="mt-0">{bad ? t('itemImport.fixFirst', { n: bad }) : t('itemImport.ready', { n: preview.rows.length })}</Note>
            <ImportPreview
              head={[t('itemImport.line'), t('field.patientId'), t('field.name'), t('field.genderAge'), t('field.dob'), t('field.mobile'), t('field.bloodGroup'), t('patientImport.createDate'), t('field.status')]}
              rows={preview.rows}
              cells={(r) => [
                r.data.patient_code || muted(t('patientImport.autoId')),
                r.data.name || '-',
                `${r.data.gender ? t(`gender.${r.data.gender}`) : '-'} / ${r.data.age_years ?? '-'}`,
                r.data.dob || '-', r.data.mobile || '-', r.data.blood_group || '-',
                r.data.created_at || muted(t('patientImport.today')),
              ]}
              errText={(r) => r.errors.map((e) => t(`patientImport.err.${e.code}`)).join('; ')} />
            <p className="mt-2 text-12 text-ink-400">{t('patientImport.hint')}</p>
          </>
        )}
      </Modal>

      <Modal open={!!result} title={t('patientImport.doneTitle')} onClose={() => setResult(null)}
        footer={<button type="button" className="btn-primary" onClick={() => setResult(null)}>{t('common.close')}</button>}>
        {result && (
          <div className="space-y-2 text-sm text-ink-700">
            <p>
              {result.created
                ? t('patientImport.created', { n: result.created, first: result.first, last: result.last })
                : t('patientImport.noneCreated')}
            </p>
            {result.skipped.length > 0 && (
              <>
                <p className="text-ink-500">{t('patientImport.skipped', { n: result.skipped.length })}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-12 text-ink-600">
                  {result.skipped.map((s) => (
                    <li key={s.line}>{t('itemImport.line')} {s.line}: {s.name} – {s.reason === 'idUsed'
                      ? t('patientImport.idUsed', { code: s.patient_code, other: s.other })
                      : t('patientImport.sameAs', { code: s.patient_code })}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
