// Admin → Menu Access: Full / View / No Access per employee on each pharmacy page (keys 'pharmacy.*',
// shared/menuAccess.js). Only choices that differ from "Default" are stored (table menu_access); a page left
// on Default follows the employee's permissions. Same rules as Menu Permission on whose access may change.
import { Router } from '../../lib/mini-express.js';
import { query, tx } from '../../config/db.js';
import { requirePermission } from '../../middleware/access.js';
import { loadPermissions } from '../../middleware/auth.js';
import { ACCESS_LEVELS, MENU_KEYS, defaultLevel, menuAccessMap } from '../../../../shared/menuAccess.js';
import { badRequest, forbidden, toId } from '../../utils/http.js';
import { checkEditable, loadTarget } from './permissions.js';

const router = Router();
router.use(requirePermission('permission.manage'));

async function describe(emp, actor) {
  const user = { ...emp, permissions: await loadPermissions(emp) };
  const rows = await query('SELECT menu_key, access_level FROM menu_access WHERE employee_id = ?', [emp.id]);
  const saved = new Map(rows.map((r) => [r.menu_key, r.access_level]));
  const levels = menuAccessMap(user, rows);
  return {
    employee: emp,
    locked: checkEditable(actor, emp),
    pages: MENU_KEYS.map((key) => ({ key, level: levels[key], saved: saved.get(key) || null, default: defaultLevel(user, key) })),
  };
}

// GET /api/menu-access/:employeeId
router.get('/:employeeId', async (req, res) => {
  const emp = await loadTarget(toId(req.params.employeeId, 'employee'));
  res.json(await describe(emp, req.user));
});

// PUT /api/menu-access/:employeeId { items: [{ key, level: 'full' | 'view' | 'none' | 'default' }] }
router.put('/:employeeId', async (req, res) => {
  const emp = await loadTarget(toId(req.params.employeeId, 'employee'));
  const locked = checkEditable(req.user, emp);
  if (locked) throw forbidden(locked);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  for (const it of items) {
    if (!MENU_KEYS.includes(it?.key)) throw badRequest(`Unknown page ${it?.key}`, 'VALIDATION');
    if (it.level !== 'default' && !ACCESS_LEVELS.includes(it.level)) throw badRequest('Choose Full, View or No Access', 'VALIDATION');
  }
  await tx(async (q) => {
    for (const it of items) {
      if (it.level === 'default') {
        await q('DELETE FROM menu_access WHERE employee_id = ? AND menu_key = ?', [emp.id, it.key]);
      } else {
        await q(
          `UPDATE menu_access SET access_level = ?, updated_by = ?, updated_at = NOW() WHERE employee_id = ? AND menu_key = ?;
           IF @@ROWCOUNT = 0
             INSERT INTO menu_access (employee_id, menu_key, access_level, updated_by) VALUES (?, ?, ?, ?);`,
          [it.level, req.user.id, emp.id, it.key, emp.id, it.key, it.level, req.user.id],
        );
      }
    }
  });
  res.json(await describe(emp, req.user));
});

export default router;
