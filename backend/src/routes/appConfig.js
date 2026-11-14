// GET /api/app-config (no login): tells the one frontend build which kind of install it is talking to.
//   { singleClinic: true|false, clinic: { id, code, name } | null }
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { singleClinicId, singleClinic } from '../config/singleClinic.js';

/** @param q query function (tests pass a fake) */
export const appConfigHandler = (q = query) => async (_req, res) => {
  if (!env.singleClinic) return res.json({ singleClinic: false, clinic: null });
  const id = await singleClinicId();
  // fresh name / code (the admin may have edited them in Clinic Settings)
  const [row] = await q('SELECT id, code, name FROM clinics WHERE id = ?', [id]).catch(() => [null]);
  const c = row || singleClinic();
  res.json({ singleClinic: true, clinic: c ? { id: c.id, code: c.code, name: c.name } : null });
};

export const appConfig = appConfigHandler();
