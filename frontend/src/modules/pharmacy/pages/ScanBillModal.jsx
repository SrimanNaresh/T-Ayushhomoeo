// Pharmacy → Stock In → Three in One → Scan Bill: read a supplier's bill (photo or PDF) into the table.
// Ported from Ayush All In One's ScanBillModal (its Three in One mode); the bill reading itself is
// utils/billOcr.js (Tesseract + PDF.js, in the browser, loaded only when a bill is scanned) and
// utils/billScan.js (pure text parsing), both copied unchanged.
//  1. Upload a photo / PDF of the bill (or take a photo on a phone); each page is turned upright.
//  2. Drag a box around the item table, header row included (or read the whole page).
//  3. Match columns: the bill's table as read, with a tile for each Three in One column; tiles that clearly
//     match are placed already. Drag a tile onto a bill column (or tap the tile, then the column).
//  4. onLines(lines, { supplier }) fills the Three in One table; nothing is saved here. The popup then stays
//     open so a bill of several pages is done page by page: read the next page of the same file, or add the
//     next page's photo / PDF (several files can be picked at once). The supplier is sent with the first fill
//     only, and the next page starts with the column matching used last when it has as many columns.
// P.Rate and Disc % are taken exactly as read from the bill: nothing is worked out for them.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, FileUp, ScanLine, Plus, Trash2, RotateCcw, RotateCw, ChevronLeft, ChevronRight, Crop, ArrowLeft, Sparkles,
  ZoomIn, ZoomOut, Hand, SquareDashedMousePointer, X, GripVertical, Eraser, Check,
} from 'lucide-react';
import { useT } from '../../../lib/i18n.jsx';
import { Modal } from '../../../components/ui.jsx';
import { compact, extractBillHeader, extractBillTable } from '../utils/billScan.js';
import { TARGETS, MIN_BOX, autoMapTable, linesOf } from '../utils/billIps.js';

export default function ScanBillModal({ open, onClose, onLines }) {
  const { t } = useT();
  const [step, setStep] = useState('pick');   // pick | select | map
  const [table, setTable] = useState(null);   // the bill's table as read { heads, rows }
  const [colMap, setColMap] = useState({});   // { tile key: bill column index }
  const [pages, setPages] = useState([]);     // page pictures (canvases), turned upright
  const [pageNo, setPageNo] = useState(0);
  const [box, setBox] = useState(null);       // selected area { x, y, w, h } as shares of the page
  const [zoom, setZoom] = useState(1);
  const [moving, setMoving] = useState(false); // zoomed in: drag pans the bill instead of drawing a box
  const [busy, setBusy] = useState(null);     // { stage, percent } while working
  const [error, setError] = useState('');
  const [supplier, setSupplier] = useState(null);   // { vendorName, billDate, … } read from the top of page 1
  const [done, setDone] = useState([]);       // pages whose lines are already in the table
  const [added, setAdded] = useState(0);      // lines sent to the table since the popup opened
  const lastMap = useRef(null);   // { n: column count, map } of the last fill, offered again for the next page
  const sentSupplier = useRef(false);
  const appendRef = useRef(false); // the file being picked adds pages instead of starting over
  const photoRef = useRef(null);
  const fileRef = useRef(null);
  const ocrRef = useRef(null);    // the Tesseract reader (a promise), made when the popup opens
  const readyRef = useRef(null);  // that promise once it has resolved

  const reset = () => {
    setStep('pick'); setPages([]); setPageNo(0); setBox(null); setZoom(1); setMoving(false);
    setError(''); setBusy(null); setSupplier(null); setTable(null); setColMap({});
    setDone([]); setAdded(0); lastMap.current = null; sentSupplier.current = false;
  };
  const pick = (ref, append) => { appendRef.current = append; ref.current?.click(); };

  // The reader is started when the popup opens (the first time it downloads its language data) and freed
  // when it closes; getOcr waits for it, or starts it again if that failed (e.g. no network then).
  const startOcr = () => {
    if (!ocrRef.current) {
      const p = import('../utils/billOcr.js').then((m) => m.createOcr());
      ocrRef.current = p;
      p.then(() => { readyRef.current = p; }, () => { if (ocrRef.current === p) ocrRef.current = null; });
    }
    return ocrRef.current;
  };
  const getOcr = async () => {
    const p = startOcr();
    if (readyRef.current !== p) setBusy({ stage: t('scan.busyReader'), percent: null });
    return p;
  };

  useEffect(() => {
    if (!open) return undefined;
    reset();
    startOcr();
    return () => {
      const ocr = ocrRef.current;
      ocrRef.current = null;
      readyRef.current = null;
      ocr?.then((o) => o.done()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 1. A bill was chosen (one or more photos / PDFs, in the order picked): show its pages, turned upright.
  //    When adding pages, they go after the ones already open and the first new one is shown.
  const onFile = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const append = appendRef.current && pages.length > 0;
    appendRef.current = false;
    if (!append) reset();
    setError('');
    try {
      setBusy({ stage: t('scan.busyOpen'), percent: null });
      const { loadBillPages, rotateCanvas } = await import('../utils/billOcr.js');
      const loaded = [];
      for (const f of files) loaded.push(...await loadBillPages(f));
      const ocr = await getOcr();
      setBusy({ stage: t('scan.busyTurn'), percent: null });
      const upright = [];
      let deg = null;   // a bill's pages are usually all turned the same way: the first page's angle is tried first
      for (const p of loaded) {
        deg = await ocr.uprightAngle(p, deg);
        upright.push(rotateCanvas(p, deg));
      }
      setPages((ps) => (append ? [...ps, ...upright] : upright));
      setPageNo(append ? pages.length : 0);
      setBox(null); setZoom(1); setMoving(false); setTable(null);
      setStep('select');
    } catch (err) {
      setError(err.message || t('scan.openFailed'));
      if (!append) setStep('pick');
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (deg) => {
    const { rotateCanvas } = await import('../utils/billOcr.js');
    setPages((ps) => ps.map((p, i) => (i === pageNo ? rotateCanvas(p, deg) : p)));
    setBox(null);
  };

  // 2. Read the selected area (or the whole page), and the supplier / bill date from the top of page 1
  const read = async (whole) => {
    setError('');
    const progress = (percent) => setBusy((b) => (b ? { ...b, percent } : b));
    try {
      const ocr = await getOcr();
      setBusy({ stage: whole ? t('scan.busyWhole') : t('scan.busyArea'), percent: 0 });
      const { layout } = await ocr.read(pages[pageNo], whole ? null : box, progress);
      if (!supplier) {
        setBusy({ stage: t('scan.busySupplier'), percent: 0 });
        try {
          setSupplier(extractBillHeader((await ocr.read(pages[0], { x: 0, y: 0, w: 1, h: 0.4 }, progress)).layout));
        } catch {
          setSupplier({ vendorName: '', billDate: '' });
        }
      }
      const billTable = extractBillTable(layout);
      if (!billTable?.rows.length) { setError(t('scan.noTable')); return; }
      setTable(billTable);
      const prev = lastMap.current;
      setColMap(prev && prev.n === billTable.heads.length ? prev.map : autoMapTable(billTable));
      setStep('map');
    } catch (err) {
      setError(err.message || t('scan.readFailed'));
    } finally {
      setBusy(null);
    }
  };

  // 3. The columns are matched: every line with an item name goes back to fill the table
  //    The popup stays open for the bill's next page.
  const apply = async () => {
    const lines = linesOf(table, colMap);
    lastMap.current = { n: table.heads.length, map: colMap };
    const first = !sentSupplier.current;
    sentSupplier.current = true;
    await onLines(lines, { supplier: first ? supplier : null });
    setAdded((n) => n + lines.length);
    setDone((d) => (d.includes(pageNo) ? d : [...d, pageNo]));
    setBox(null);
    setStep('done');
  };
  const nextOpen = pages.findIndex((_, i) => i > pageNo && !done.includes(i));
  const goPage = (n) => { setPageNo(n); setBox(null); setTable(null); setStep('select'); };

  const working = Boolean(busy);
  const page = pages[pageNo];
  const steps = [['pick', t('scan.stepUpload')], ['select', t('scan.stepSelect')], ['map', t('scan.stepMatch')]];
  const at = step === 'done' ? steps.length : steps.findIndex(([k]) => k === step);
  const ghost = 'btn-ghost !px-1.5 !py-1';

  return (
    <Modal open={open} onClose={working ? () => {} : onClose} size="xl" title={t('scan.title')}>
      <div className="space-y-3">
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.pdf" className="hidden" onChange={onFile} />

        <ol className="flex items-center gap-2 text-11 font-semibold">
          {steps.map(([k, label], i) => (
            <li key={k} className={`flex items-center gap-1.5 ${i <= at ? 'text-brand-700' : 'text-ink-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-10 ${i < at ? 'bg-brand-600 text-white' : i === at ? 'border-2 border-brand-600' : 'border border-ink-300'}`}>{i + 1}</span>
              <span className={i === at ? '' : 'max-sm:hidden'}>{label}</span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-5 bg-ink-200" />}
            </li>
          ))}
        </ol>

        {step === 'pick' && !busy && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 px-4 py-8 text-center">
            <ScanLine size={28} className="text-brand-500" />
            <div className="text-13 text-ink-600">
              <p className="font-semibold text-ink-800">{t('scan.uploadTitle')}</p>
              <p className="text-12">{t('scan.uploadHint')}</p>
            </div>
            <div className="flex w-full max-w-sm gap-2">
              <button type="button" className="btn-secondary min-w-0 flex-1 whitespace-nowrap px-2 sm:hidden" onClick={() => pick(photoRef, false)}>
                <Camera size={16} /> {t('scan.takePhoto')}
              </button>
              <button type="button" className="btn-primary min-w-0 flex-1 whitespace-nowrap px-2" onClick={() => pick(fileRef, false)}>
                <FileUp size={16} /> {t('scan.upload')}
              </button>
            </div>
          </div>
        )}

        {busy && (
          <div className="rounded-xl border border-ink-100 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-12 font-medium text-ink-600">
              <ScanLine size={14} className="animate-pulse text-brand-600" /> {busy.stage}
              {busy.percent != null && <span className="ml-auto tabular-nums">{busy.percent}%</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className={`h-full rounded-full bg-brand-500 transition-all ${busy.percent == null ? 'w-1/3 animate-pulse' : ''}`}
                style={busy.percent != null ? { width: `${busy.percent}%` } : undefined} />
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-12 font-medium text-red-700">{error}</p>}

        {step === 'select' && page && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-12 text-ink-600">{t('scan.selectHint')}</p>
              <div className="flex flex-wrap items-center gap-1">
                {pages.length > 1 && (
                  <>
                    <button type="button" className={ghost} disabled={working || pageNo === 0} title={t('scan.prevPage')} onClick={() => { setPageNo((x) => x - 1); setBox(null); }}><ChevronLeft size={16} /></button>
                    <span className="text-12 tabular-nums text-ink-500">{t('scan.page', { n: pageNo + 1, total: pages.length })}</span>
                    {done.includes(pageNo) && <span className="badge bg-emerald-50 text-emerald-700"><Check size={12} /> {t('scan.pageAdded')}</span>}
                    <button type="button" className={ghost} disabled={working || pageNo === pages.length - 1} title={t('scan.nextPage')} onClick={() => { setPageNo((x) => x + 1); setBox(null); }}><ChevronRight size={16} /></button>
                    <span className="mx-1 h-4 w-px bg-ink-200" />
                  </>
                )}
                <button type="button" className={ghost} disabled={working} title={t('scan.turnLeft')} onClick={() => rotate(270)}><RotateCcw size={16} /></button>
                <button type="button" className={ghost} disabled={working} title={t('scan.turnRight')} onClick={() => rotate(90)}><RotateCw size={16} /></button>
                <span className="mx-1 h-4 w-px bg-ink-200" />
                <button type="button" className={ghost} disabled={zoom === 1} title={t('scan.zoomOut')} onClick={() => { const z = zoom - 1; setZoom(z); if (z === 1) setMoving(false); }}><ZoomOut size={16} /></button>
                <span className="w-7 text-center text-12 tabular-nums text-ink-500">{zoom}×</span>
                <button type="button" className={ghost} disabled={zoom === 3} title={t('scan.zoomIn')} onClick={() => setZoom((z) => z + 1)}><ZoomIn size={16} /></button>
                {zoom > 1 && (
                  <div className="ml-1 flex overflow-hidden rounded-lg border border-ink-200 text-12 font-semibold">
                    <button type="button" className={`flex items-center gap-1 px-2 py-1 ${moving ? 'bg-brand-600 text-white' : 'text-ink-500'}`} onClick={() => setMoving(true)}><Hand size={14} /> {t('scan.move')}</button>
                    <button type="button" className={`flex items-center gap-1 px-2 py-1 ${!moving ? 'bg-brand-600 text-white' : 'text-ink-500'}`} onClick={() => setMoving(false)}><SquareDashedMousePointer size={14} /> {t('scan.select')}</button>
                  </div>
                )}
              </div>
            </div>

            <BoxSelect page={page} box={box} onBox={setBox} disabled={working} zoom={zoom} moving={moving} hint={t('scan.dragHint')} />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" disabled={working} title={t('scan.addPagesHint')} onClick={() => pick(fileRef, true)}><Plus size={16} /> {t('scan.addPages')}</button>
                {added > 0
                  ? <button type="button" className="btn-secondary" disabled={working} onClick={onClose}><Check size={16} /> {t('scan.finish')}</button>
                  : <button type="button" className="btn-secondary" disabled={working} onClick={() => pick(fileRef, false)}><FileUp size={16} /> {t('scan.anotherBill')}</button>}
              </div>
              <div className="flex flex-wrap gap-2">
                {box && <button type="button" className="btn-secondary" disabled={working} onClick={() => setBox(null)}><X size={16} /> {t('scan.cancelSelection')}</button>}
                <button type="button" className="btn-secondary" disabled={working} onClick={() => read(true)}><Sparkles size={16} /> {t('scan.readWhole')}</button>
                <button type="button" className="btn-primary" disabled={working || !box} onClick={() => read(false)}>
                  <Crop size={16} /> {box ? t('scan.readSelected') : t('scan.selectFirst')}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'map' && table && (
          <ColumnMatch
            table={table} map={colMap} setMap={setColMap} disabled={working}
            onRemoveCol={(i) => {
              // drop the bill's column i; tiles on the columns after it move along with them
              setTable((tb) => ({ heads: tb.heads.filter((_, c) => c !== i), rows: tb.rows.map((r) => r.filter((_, c) => c !== i)) }));
              setColMap((m) => Object.fromEntries(Object.entries(m).filter(([, c]) => c !== i).map(([k, c]) => [k, c > i ? c - 1 : c])));
            }}
            onRemoveRow={(r) => setTable((tb) => ({ ...tb, rows: tb.rows.filter((_, x) => x !== r) }))}
            onBack={() => setStep('select')} onDone={apply}
          />
        )}

        {step === 'done' && !busy && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-8 text-center">
            <Check size={28} className="text-emerald-600" />
            <div className="text-13 text-ink-600">
              <p className="font-semibold text-ink-800">{t('scan.doneTitle', { n: added, pages: done.length })}</p>
              <p className="text-12">{nextOpen >= 0 ? t('scan.doneNextHint', { n: nextOpen + 1 }) : t('scan.doneMoreHint')}</p>
            </div>
            <div className="flex w-full max-w-lg flex-wrap justify-center gap-2">
              {nextOpen >= 0 && (
                <button type="button" className="btn-primary" onClick={() => goPage(nextOpen)}>
                  <ChevronRight size={16} /> {t('scan.readPage', { n: nextOpen + 1 })}
                </button>
              )}
              <button type="button" className="btn-secondary sm:hidden" onClick={() => pick(photoRef, true)}><Camera size={16} /> {t('scan.photoNext')}</button>
              <button type="button" className={nextOpen >= 0 ? 'btn-secondary' : 'btn-primary'} onClick={() => pick(fileRef, true)}>
                <FileUp size={16} /> {t('scan.uploadNext')}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}><Check size={16} /> {t('scan.finish')}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// The bill picture; drag on it (mouse or finger) to mark the area to read. box / onBox use shares of the
// picture (0..1). zoom > 1 shows it larger in a scrolling box; while `moving`, a drag pans instead of drawing.
function BoxSelect({ page, box, onBox, disabled, zoom = 1, moving = false, hint }) {
  const url = useMemo(() => page.toDataURL('image/jpeg', 0.85), [page]);
  const wrap = useRef(null);
  const start = useRef(null);
  const [draft, setDraft] = useState(null);
  const at = (e) => {
    const r = wrap.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const down = (e) => {
    if (disabled || moving) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = at(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  };
  const move = (e) => { if (start.current) setDraft(rectOf(start.current, at(e))); };
  const up = (e) => {
    if (!start.current) return;
    const r = rectOf(start.current, at(e));
    start.current = null;
    setDraft(null);
    if (r.w >= MIN_BOX && r.h >= MIN_BOX) onBox(r);
  };
  const shown = draft || box;
  const zoomed = zoom > 1;
  return (
    <div className={`max-h-[62vh] overflow-auto rounded-xl border border-ink-100 bg-ink-50 p-2 ${zoomed ? '' : 'flex justify-center'}`}>
      <div ref={wrap}
        className={`relative select-none overflow-hidden ${zoomed ? 'block' : 'inline-block'} ${disabled ? 'cursor-wait' : moving ? 'cursor-grab' : 'cursor-crosshair'}`}
        style={{ touchAction: moving ? 'pan-x pan-y' : 'none', width: zoomed ? `${zoom * 100}%` : undefined }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDraft(null); }}>
        <img src={url} alt="" draggable={false} className={zoomed ? 'block w-full' : 'block max-h-[calc(62vh-1rem)] max-w-full'} />
        {shown && (
          <div className="pointer-events-none absolute rounded-sm border-2 border-brand-500"
            style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%`, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)' }} />
        )}
        {!shown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full bg-ink-900/75 px-3 py-1 text-11 font-medium text-white">{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const cell = 'border border-ink-200 px-1 py-0.5 break-words align-middle';
const hd = 'border border-ink-200 px-1.5 py-1.5 text-center align-middle text-11';

// Match columns. Top: the Three in One columns as tiles. Below: the bill's table as read – each column's
// heading is a slot for the tile that fills it. Drag a tile onto a column (or tap the tile, then the column,
// or the other way round on a phone). A column holds one tile and a tile sits on one column.
function ColumnMatch({ table, map, setMap, onRemoveCol, onRemoveRow, disabled, onBack, onDone }) {
  const { t } = useT();
  const [picked, setPicked] = useState(null);   // tapped and waiting for its partner: { tile } or { col }
  const [over, setOver] = useState(null);       // the column a tile is being dragged over
  const { heads, rows } = table;
  const label = Object.fromEntries(TARGETS.map(([k, l]) => [k, t(l)]));
  const tileOn = (i) => Object.keys(map).find((k) => map[k] === i);
  const place = (key, i) => {
    setMap((m) => {
      const next = {};
      for (const [k, c] of Object.entries(m)) if (k !== key && c !== i) next[k] = c;
      next[key] = i;
      return next;
    });
    setPicked(null);
  };
  const clear = (key) => setMap((m) => { const next = { ...m }; delete next[key]; return next; });
  const tapTile = (key) => {
    if (disabled) return;
    if (picked?.col != null) place(key, picked.col);
    else setPicked((p) => (p?.tile === key ? null : { tile: key }));
  };
  const tapCol = (i) => {
    if (disabled) return;
    if (picked?.tile) place(picked.tile, i);
    else setPicked((p) => (p?.col === i ? null : { col: i }));
  };
  const dropProps = (i) => (disabled ? {} : {
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(i); },
    onDragLeave: () => setOver((o) => (o === i ? null : o)),
    onDrop: (e) => { e.preventDefault(); setOver(null); const key = e.dataTransfer.getData('text/plain'); if (label[key]) place(key, i); },
  });
  const dragTile = (key) => (e) => { e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'move'; setPicked(null); };
  const matched = Object.keys(map).length;
  const names = map.name == null ? 0 : rows.filter((cells) => compact(cells[map.name])).length;
  const width = (i) => (i === map.name || heads[i].field === 'name' ? 200 : 100);

  return (
    <div className="space-y-3">
      <p className="text-12 text-ink-600">{t('scan.matchHint')}</p>
      <div>
        <p className="mb-1.5 text-11 font-semibold uppercase tracking-wide text-ink-500">
          {t('scan.tilesTitle', { n: matched })}
          {picked?.tile && <span className="ml-1 normal-case tracking-normal text-brand-700">{t('scan.tapColumnFor', { name: label[picked.tile] })}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map(([key]) => {
            const placed = map[key] != null;
            const sel = picked?.tile === key;
            return (
              <button key={key} type="button" disabled={disabled} draggable={!disabled} onDragStart={dragTile(key)} onClick={() => tapTile(key)}
                title={placed ? t('scan.tilePlaced') : t('scan.tileFree')}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-12 font-semibold shadow-sm transition-colors ${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${
                  sel ? 'border-brand-600 bg-brand-600 text-white' : placed ? 'border-brand-200 bg-brand-50 text-brand-400' : 'border-brand-300 bg-white text-brand-700 hover:bg-brand-50'}`}>
                <GripVertical size={12} className="opacity-50" /> {label[key]} {placed && <Check size={12} />}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-11 text-ink-400">{t('scan.tilesNote')}</p>
      </div>

      <div>
        <p className="mb-1 text-11 font-semibold uppercase tracking-wide text-ink-500">{t('scan.readLines', { n: rows.length })}</p>
        <div className="max-h-[42vh] overflow-auto rounded-lg border border-ink-200">
          <table className="w-full table-fixed border-collapse text-left text-12" style={{ minWidth: 40 + heads.reduce((s, _, i) => s + width(i), 0) }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-ink-50">
                <th className={`${hd} w-10 text-ink-400`}>#</th>
                {heads.map((_, i) => {
                  const key = tileOn(i);
                  const active = over === i || picked?.col === i;
                  return (
                    <th key={i} style={{ width: width(i) }} onClick={() => tapCol(i)} {...dropProps(i)}
                      title={key ? t('scan.fills', { name: label[key] }) : t('scan.dropHere')}
                      className={`${hd} !p-1 ${disabled ? '' : 'cursor-pointer'} ${active ? '!bg-brand-100' : ''} ${picked?.tile && !key ? 'ring-1 ring-inset ring-brand-300' : ''}`}>
                      {key ? (
                        <span className="flex items-center justify-between gap-1 rounded-md bg-brand-600 px-1.5 py-1 text-11 font-bold text-white shadow-sm" draggable={!disabled} onDragStart={dragTile(key)}>
                          <span className="truncate">{label[key]}</span>
                          <button type="button" className="shrink-0 rounded text-white/70 hover:text-white" title={t('scan.remove')} disabled={disabled}
                            onClick={(e) => { e.stopPropagation(); clear(key); }}><X size={12} /></button>
                        </span>
                      ) : (
                        <span className={`block rounded-md border border-dashed px-1.5 py-1 text-11 font-medium ${active ? 'border-brand-400 text-brand-600' : 'border-ink-300 text-ink-400'}`}>
                          {picked?.col === i ? t('scan.nowTapTile') : t('scan.dropTile')}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-ink-50">
                <th className={`${hd} !py-0.5`} />
                {heads.map((_, i) => (
                  <th key={i} className={`${hd} !py-0.5`}>
                    <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-10 font-medium text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      title={t('scan.removeCol')} disabled={disabled || heads.length <= 1} onClick={() => { setPicked(null); setOver(null); onRemoveCol(i); }}>
                      <Trash2 size={11} /> {t('scan.remove')}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, r) => (
                <tr key={r}>
                  <td className={`${cell} whitespace-nowrap text-center text-ink-400`}>
                    <span className="inline-flex items-center gap-1">
                      {r + 1}
                      <button type="button" className="rounded p-0.5 text-ink-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        title={t('scan.removeLine')} disabled={disabled || rows.length <= 1} onClick={() => onRemoveRow(r)}><Trash2 size={12} /></button>
                    </span>
                  </td>
                  {cells.map((x, i) => (
                    <td key={i} className={`${cell} px-1.5 ${tileOn(i) ? 'text-ink-800' : 'text-ink-400'} ${over === i ? 'bg-brand-50' : ''}`} {...dropProps(i)}>{x}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={disabled} onClick={onBack}><ArrowLeft size={16} /> {t('scan.selectAgain')}</button>
          <button type="button" className="btn-secondary" disabled={disabled || !matched} onClick={() => { setMap({}); setPicked(null); }}><Eraser size={16} /> {t('scan.clearAll')}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {map.name == null && <p className="text-11 font-medium text-amber-700">{t('scan.needName')}</p>}
          <button type="button" className="btn-primary" disabled={disabled || !names} onClick={onDone}><Plus size={16} /> {t('scan.fill', { n: names })}</button>
        </div>
      </div>
    </div>
  );
}
