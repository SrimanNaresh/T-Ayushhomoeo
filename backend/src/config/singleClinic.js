// Single-clinic mode (SINGLE_CLINIC=1 in backend/.env).
// The schema is unchanged: single-clinic mode is simply "exactly one row in `clinics`".
// ensureSingleClinic() runs on start-up (server.js) and in seed.js; it caches the clinic id
// so clinicScope() can tie every request to that clinic without a lookup.
import { env } from './env.js';
import { query as dbQuery, insertRow } from './db.js';

let cached = null;   // { id, code, name }

export class SingleClinicError extends Error {}

/**
 * Makes sure exactly one active clinic exists and returns it ({ id, code, name }).
 *  - no clinic   → creates it from CLINIC_CODE / CLINIC_NAME
 *  - one clinic  → uses it; name/code follow .env only while it has no patients
 *  - more        → throws SingleClinicError (never guesses which one to use)
 * @param q query function (defaults to the pool; tests pass a fake)
 */
export async function ensureSingleClinic(q = dbQuery) {
  const rows = await q('SELECT id, code, name, status FROM clinics ORDER BY id');
  if (rows.length > 1) {
    throw new SingleClinicError(
      `This database has ${rows.length} clinics – single-clinic mode needs one. Use a new database or set SINGLE_CLINIC=0.`,
    );
  }

  if (!rows.length) {
    const id = await insertRow(q, 'clinics', { name: env.clinicName, code: env.clinicCode, status: 'active' });
    cached = { id, code: env.clinicCode, name: env.clinicName };
    return cached;
  }

  const c = rows[0];
  const changes = {};
  if (c.status !== 'active') changes.status = 'active';
  if (c.name !== env.clinicName || c.code !== env.clinicCode) {
    const [{ n }] = await q('SELECT COUNT(*) AS n FROM patients WHERE clinic_id = ?', [c.id]);
    if (Number(n) === 0) {
      changes.name = env.clinicName;
      changes.code = env.clinicCode;
    } else if (c.code !== env.clinicCode) {
      console.warn(`Single-clinic mode: keeping clinic code ${c.code} (patients already registered); CLINIC_CODE=${env.clinicCode} is ignored.`);
    }
  }
  if (Object.keys(changes).length) {
    const cols = Object.keys(changes);
    await q(`UPDATE clinics SET ${cols.map((k) => `[${k}] = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...cols.map((k) => changes[k]), c.id]);
  }
  cached = { id: c.id, code: changes.code ?? c.code, name: changes.name ?? c.name };
  return cached;
}

/** The single clinic's id (looked up once, then cached). */
export async function singleClinicId() {
  if (!cached) await ensureSingleClinic();
  return cached.id;
}

/** The cached clinic ({ id, code, name }) or null before the start-up check ran. */
export const singleClinic = () => cached;

/** Tests only: forget the cached clinic. */
export function resetSingleClinicCache() { cached = null; }
