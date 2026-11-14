// Single-clinic mode (SINGLE_CLINIC=1): no database needed, the SQL is answered by a fake.
// Each test sets env.singleClinic itself, so this file passes whatever backend/.env says.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { ensureSingleClinic, resetSingleClinicCache, singleClinic, SingleClinicError } from '../src/config/singleClinic.js';
import { clinicScope } from '../src/middleware/access.js';
import { appConfigHandler } from '../src/routes/appConfig.js';
import clinicRoutes from '../src/routes/main/clinics.js';

const saved = { singleClinic: env.singleClinic, clinicCode: env.clinicCode, clinicName: env.clinicName };
const singleMode = () => Object.assign(env, { singleClinic: true, clinicCode: 'SC', clinicName: 'Saravana Clinic' });
afterEach(() => { Object.assign(env, saved); resetSingleClinicCache(); });

/** Fake query(): `clinics` rows, patient counts per clinic; records every statement. */
function fakeDb(clinics, patients = {}) {
  const log = [];
  const q = async (sql, params = []) => {
    log.push({ sql, params });
    if (/^SELECT id, code, name, status FROM clinics/.test(sql)) return clinics.map((c) => ({ ...c }));
    if (/FROM patients WHERE clinic_id/.test(sql)) return [{ n: patients[params[0]] || 0 }];
    if (/^INSERT INTO \[clinics\]/.test(sql)) return [{ id: 77 }];
    if (/^UPDATE clinics/.test(sql)) return Object.assign([], { affectedRows: 1 });
    if (/^SELECT id, code, name FROM clinics WHERE id/.test(sql)) return clinics.filter((c) => c.id === params[0]);
    throw new Error(`unexpected SQL: ${sql}`);
  };
  return { q, log };
}

const run = async (mw, req) => {
  let err = null;
  try { await mw(req, {}, () => {}); } catch (e) { err = e; }
  return err;
};
const fakeReq = (user, headers = {}, query = {}) => ({ user, query, get: (h) => headers[h.toLowerCase()] });

/* ---------- start-up check ---------- */

test('start-up: an empty database gets the clinic from CLINIC_CODE / CLINIC_NAME', async () => {
  singleMode();
  const { q, log } = fakeDb([]);
  const c = await ensureSingleClinic(q);
  assert.deepEqual(c, { id: 77, code: 'SC', name: 'Saravana Clinic' });
  const insert = log.find((l) => l.sql.startsWith('INSERT'));
  assert.ok(insert.params.includes('SC') && insert.params.includes('Saravana Clinic') && insert.params.includes('active'));
});

test('start-up: one clinic without patients is used and renamed to .env', async () => {
  singleMode();
  const { q, log } = fakeDb([{ id: 3, code: 'OLD', name: 'Old name', status: 'active' }]);
  assert.deepEqual(await ensureSingleClinic(q), { id: 3, code: 'SC', name: 'Saravana Clinic' });
  assert.ok(log.some((l) => l.sql.startsWith('UPDATE clinics')));
});

test('start-up: one clinic with patients keeps its name and code', async () => {
  singleMode();
  const { q, log } = fakeDb([{ id: 3, code: 'OLD', name: 'Old name', status: 'active' }], { 3: 12 });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await ensureSingleClinic(q), { id: 3, code: 'OLD', name: 'Old name' });
  } finally { console.warn = warn; }
  assert.ok(!log.some((l) => l.sql.startsWith('UPDATE clinics')));
});

test('start-up: two clinics stop with a clear message instead of guessing', async () => {
  singleMode();
  const { q, log } = fakeDb([{ id: 1, code: 'CLA', name: 'A', status: 'active' }, { id: 2, code: 'CLB', name: 'B', status: 'active' }]);
  await assert.rejects(ensureSingleClinic(q), (e) => e instanceof SingleClinicError
    && e.message === 'This database has 2 clinics – single-clinic mode needs one. Use a new database or set SINGLE_CLINIC=0.');
  assert.equal(log.length, 1);                 // nothing written
  assert.equal(singleClinic(), null);
});

/* ---------- clinicScope ---------- */

test('clinicScope: admin and staff both get the single clinic; header and ?clinic_id= are ignored', async () => {
  singleMode();
  await ensureSingleClinic(fakeDb([{ id: 4, code: 'SC', name: 'Saravana Clinic', status: 'active' }]).q);

  for (const user of [{ role: 'super_admin', clinic_id: null }, { role: 'admin', clinic_id: null }, { role: 'receptionist', clinic_id: 4 }]) {
    const req = fakeReq(user, { 'x-clinic-id': '9' }, { clinic_id: '8' });
    assert.equal(await run(clinicScope(), req), null, user.role);
    assert.equal(req.clinicId, 4, user.role);
  }
  // never CLINIC_REQUIRED, and "optional" scope is still the one clinic, not "all"
  const admin = fakeReq({ role: 'admin', clinic_id: null });
  assert.equal(await run(clinicScope(), admin), null);
  assert.equal(admin.clinicId, 4);
  const opt = fakeReq({ role: 'admin', clinic_id: null }, { 'x-clinic-id': 'all' });
  assert.equal(await run(clinicScope({ optional: true }), opt), null);
  assert.equal(opt.clinicId, 4);
});

test('clinicScope: multi-branch behaviour is unchanged with SINGLE_CLINIC=0', async () => {
  env.singleClinic = false;
  const err = await run(clinicScope(), fakeReq({ role: 'admin', clinic_id: null }));
  assert.equal(err.code, 'CLINIC_REQUIRED');
  const staff = fakeReq({ role: 'doctor', clinic_id: 5 }, { 'x-clinic-id': '9' });
  assert.equal(await run(clinicScope(), staff), null);
  assert.equal(staff.clinicId, 5);
});

/* ---------- POST /clinics ---------- */

const callRouter = (router, req) => new Promise((resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
  router.handle({ params: {}, query: {}, get: () => undefined, ...req }, res, (err) => resolve({ err }));
});

test('POST /clinics is refused in single-clinic mode', async () => {
  singleMode();
  const r = await callRouter(clinicRoutes, {
    method: 'POST', path: '/', body: { name: 'Second', code: 'SC2' }, user: { id: 1, role: 'super_admin' },
  });
  assert.equal(r.err.status, 403);
  assert.equal(r.err.message, 'Single-clinic mode: only one clinic');
});

/* ---------- /api/app-config ---------- */

const callHandler = (h) => new Promise((resolve, reject) => {
  h({}, { json: resolve }).catch(reject);
});

test('/api/app-config reports the mode and the clinic', async () => {
  env.singleClinic = false;
  assert.deepEqual(await callHandler(appConfigHandler(async () => { throw new Error('no DB in multi mode'); })), { singleClinic: false, clinic: null });

  singleMode();
  const db = fakeDb([{ id: 6, code: 'SC', name: 'Saravana Clinic', status: 'active' }]);
  await ensureSingleClinic(db.q);
  assert.deepEqual(await callHandler(appConfigHandler(db.q)), { singleClinic: true, clinic: { id: 6, code: 'SC', name: 'Saravana Clinic' } });
});
