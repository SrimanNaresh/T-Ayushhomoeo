// Lab Reports & Scans: Photo / PDF files uploaded with the vital signs of one queue entry.
// Rules (types, 5 MB limit) live in shared/attachments.js so the API checks exactly the same thing.
import { useEffect, useRef, useState } from 'react';
import { api, apiBlob, apiUpload } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';
import { fmtDate } from '../lib/format.js';
import { ATTACHMENT_TYPES, CATEGORY_MAX, checkAttachment, fileSize } from '../../../shared/attachments.js';
import { FolderOpen, Camera, ImagePlus, Upload, Eye, Trash2, FileText, Image, X } from 'lucide-react';
import { EmptyState, ErrorBox, Input, Spinner, Select, useAsync, useToast } from './ui.jsx';

// showHead = false: just the files, without the "Lab Reports & Scans" heading (Examine → Vital signs)
export default function Attachments({ entry, canEdit = true, showHead = true }) {
  const { t } = useT();
  const toast = useToast();
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const list = useAsync(() => api(`/queue/${entry.id}/attachments`), [entry.id]);

  async function upload(file) {
    const err = checkAttachment({ type, mime: file.type, size: file.size, category });
    if (err) { toast(t(`attach.err.${err}`), 'error'); return; }
    setUploading(true);
    try {
      await apiUpload(`/queue/${entry.id}/attachments`, file, { query: { type, category: category.trim(), name: file.name } });
      toast(t('attach.uploaded', { name: file.name }));
      setCategory('');
      list.reload();
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  function pickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) upload(f);
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { cameraInput.current?.click(); return; }
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }));
    } catch {
      toast(t('attach.err.camera'), 'error');
    }
  }

  function closeCamera() {
    stream?.getTracks().forEach((tr) => tr.stop());
    setStream(null);
  }

  function capture() {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
      closeCamera();
      upload(new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  }

  // show the live camera in the <video>, and always release the camera when it closes or the pop-up goes away
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((tr) => tr.stop());
  }, [stream]);

  // leaving Photo (or the pop-up) turns the camera off
  useEffect(() => { if (type !== 'photo') setStream(null); }, [type]);

  async function view(a) {
    // open the tab right away (inside the click) so the browser does not block it, then load the file into it
    const win = window.open('', '_blank');
    setBusyId(a.id);
    try {
      const blob = await apiBlob(`/queue/attachments/${a.id}/file`);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url; else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (ex) {
      win?.close();
      toast(ex.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a) {
    if (!window.confirm(t('attach.deleteConfirm', { name: a.file_name }))) return;
    setBusyId(a.id);
    try {
      await api(`/queue/attachments/${a.id}`, { method: 'DELETE' });
      list.reload();
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const rows = list.data?.rows || [];
  return (
    <section className={`grid gap-3 ${showHead ? 'mt-4 border-t-2 border-brand-500 pt-3.5' : ''}`}>
      {showHead && (
        <header className="flex items-start gap-2.5 border-b border-ink-100 pb-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FolderOpen size={16} /></span>
          <div>
            <h3 className="text-15 font-bold text-ink-800">{t('attach.title')}</h3>
            <p className="text-12 text-ink-400">{t('attach.subtitle', { name: entry.patient_name })}</p>
          </div>
        </header>
      )}

      {canEdit && (
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(9rem,13rem)_minmax(10rem,17rem)_auto]">
          <Select label={t('attach.type')} required value={type} onChange={(e) => setType(e.target.value)}
            placeholder={t('attach.selectType')}
            options={Object.keys(ATTACHMENT_TYPES).map((k) => ({ value: k, label: t(`attach.type.${k}`) }))} />
          <Input label={t('attach.category')} value={category} maxLength={CATEGORY_MAX}
            placeholder={t('attach.categoryHint')} onChange={(e) => setCategory(e.target.value)} />
          {type === 'photo' ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" disabled={uploading || !!stream} onClick={openCamera}>
                <Camera size={16} /> {t('attach.takePhoto')}
              </button>
              <button type="button" className="btn-secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <ImagePlus size={16} /> {uploading ? t('common.saving') : t('attach.gallery')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn-primary justify-self-start" disabled={!type || uploading} title={!type ? t('attach.chooseTypeFirst') : undefined}
              onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> {uploading ? t('common.saving') : t('attach.upload')}
            </button>
          )}
          <input ref={fileInput} type="file" hidden accept={type ? ATTACHMENT_TYPES[type].accept : undefined} onChange={pickFile} />
          {/* fallback when the browser has no live camera access (e.g. plain http on a LAN address): phones open their camera app */}
          <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment" onChange={pickFile} />
        </div>
      )}
      {canEdit && stream && (
        <div className="grid justify-items-start gap-2.5">
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-md rounded-xl bg-black" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={uploading} onClick={capture}>
              <Camera size={16} /> {t('attach.capture')}
            </button>
            <button type="button" className="btn-secondary" onClick={closeCamera}><X size={16} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}
      {canEdit && <p className="-mt-1 text-12 text-ink-400">{t('attach.limits')}</p>}

      <div className="border-t border-ink-100 pt-1">
        {list.loading && !list.data ? <Spinner /> : <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.data && !rows.length && <EmptyState message={t('attach.none')} />}
        {rows.length > 0 && (
          <ul className="divide-y divide-ink-100">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 py-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.file_type === 'pdf' ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-700'}`}>
                  {a.file_type === 'pdf' ? <FileText size={16} /> : <Image size={16} />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-13 text-ink-800" title={a.file_name}>{a.file_name}</b>
                  <span className="text-11 text-ink-400">
                    {[a.category, t(`attach.type.${a.file_type}`), fileSize(a.size_bytes), fmtDate(a.uploaded_at, true), a.uploaded_by_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" className="btn-secondary !px-2.5 !py-1 !text-13" disabled={busyId === a.id} onClick={() => view(a)}>
                    <Eye size={15} /> {t('common.view')}
                  </button>
                  {canEdit && (
                    <button type="button" className="btn-ghost !p-1 hover:!bg-red-50 hover:!text-red-600" title={t('attach.delete')} aria-label={t('attach.delete')}
                      disabled={busyId === a.id} onClick={() => remove(a)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
