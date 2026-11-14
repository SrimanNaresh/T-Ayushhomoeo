# Prompt – Single-Clinic mode (same source as the multi-branch app)

Copy everything below the line into Claude (or another AI coding assistant) opened in the
`multi-branch_clinic` project. Change the words in **[square brackets]** first.

---

SmartClinic in this repo is a **multi-branch** app (Main Clinic + branch clinics A, B, …). I also want to run it
for a **single clinic** — **[Saravana Clinic]**, code **[SC]** — using **the same source code** for both the frontend
and the backend. Do **not** fork or copy the project and do **not** delete the multi-branch features. Add a
**single-clinic mode** that is switched on by settings in `backend/.env`, so one codebase and one `frontend/dist`
build serve both kinds of install.

Read `README.md`, `shared/permissions.js`, `backend/src/middleware/access.js`, `backend/src/utils/codes.js`,
`backend/scripts/seed.js`, `frontend/src/menu.js`, `frontend/src/components/Layout.jsx`,
`frontend/src/lib/auth.jsx` and `frontend/src/lib/api.js` before changing anything.

## 1. Settings (`backend/.env` and `.env.example`)

```
# 1 = single clinic: no branches, no clinic switcher. 0 or empty = multi-branch (current behaviour)
SINGLE_CLINIC=1
CLINIC_CODE=[SC]
CLINIC_NAME=[Saravana Clinic]
```

With `SINGLE_CLINIC` empty or `0` the app must behave **exactly** as it does today. Every change below is guarded by
this one setting — read it in `backend/src/config/env.js` and nowhere else.

## 2. Database — keep the schema as it is

- Do **not** drop `clinic_id` or change `database/schema.sql` / `init-db.js`. Single-clinic mode is simply
  "one row in `clinics`". This keeps every query, unique key, number series and test unchanged.
- On start-up (and in `seed.js`), when `SINGLE_CLINIC=1`: make sure **exactly one active clinic** exists with
  `CLINIC_CODE` / `CLINIC_NAME`. Create it if `clinics` is empty; if one clinic exists, use it (update its name only if
  it has no patients yet). If **more than one** clinic exists, stop with a clear message ("This database has N
  clinics – single-clinic mode needs one. Use a new database or set SINGLE_CLINIC=0.") instead of guessing.
- `SEED_DEMO=1` in single-clinic mode seeds only this one clinic and its staff (`[sc].reception`,
  `[sc].doctor`, `[sc].pharmacy`, `[sc].billing`), not Clinic A / Clinic B.

## 3. Backend

- **`clinicScope()`**: in single-clinic mode set `req.clinicId` to the single clinic's id for **every** user,
  admins included; ignore `X-Clinic-Id` / `?clinic_id=`. Never return `CLINIC_REQUIRED`. Cache the id after the first
  lookup.
- **Admin / Super Admin** keep `clinic_id = NULL` in `employees` (the CHECK constraints need that) — the scope above is
  what ties them to the clinic.
- **Clinic Generation**: `POST /clinics` returns 403 "Single-clinic mode: only one clinic" ; `GET/PUT /clinics/:id`
  still work so the admin can edit name, address, phone, consultation fee and logo of the one clinic.
- **Pharmacy / Lab Generation**: keep working, each unit is always linked to the single clinic (fill `clinic_id`
  automatically; hide/ignore the clinic picker).
- **Employees**: new branch staff are always assigned to the single clinic; drop the "Clinic" choice from the
  form's validation in this mode. Employee codes keep the current format (`SC-E001`).
- **Dashboard** `GET /dashboard/summary`: return the one clinic's figures (no per-branch table needed, but keep the
  same response shape so the page still renders).
- **Number formats** stay `CODE-0001`, `CODE-B0001`, `CODE-PO0001`, … using `CLINIC_CODE` — no code change needed in
  `codes.js`.
- Add `GET /api/app-config` (no login needed) returning
  `{ singleClinic: true|false, clinic: { id, code, name } | null }` so the frontend can adapt without a rebuild.

## 4. Frontend (same `dist` for both modes)

- Load `/api/app-config` once at start-up (in `auth.jsx` or a small `lib/appConfig.js`) and keep it in context.
- In single-clinic mode:
  - **Top bar**: no clinic switcher; show the clinic name + code chip for every user (including admins).
  - **Active clinic** is always the single clinic, so all branch menus show straight away for admins. `api.js` may
    keep sending `X-Clinic-Id` — the server ignores it.
  - **Sidebar**: one flat menu, no "Main Clinic" / "Clinic menus" split and no clinic-code badge on groups.
    Rename the `main` group to **"Admin"** and keep only Dashboard, Employee Registration, All Employees, Menu
    Permission, and **"Clinic Settings"** (opens the edit form of the one clinic instead of the Clinic Generation list).
    Show Pharmacy / Lab Generation only if they are in use.
  - Remove the "Clinic" column / filter from Employee List, Dashboard and any report that has one.
  - Login page and printed bills / receipts / PDFs show `CLINIC_NAME` as the heading.
- Add any new labels to **both** `i18n/en.js` and `i18n/ta.js`.
- Run `npm run build` in `frontend/` so `frontend/dist` is up to date.

## 5. Launcher and docs

- `start-windows.bat`: no change in logic; the first-run Notepad step should mention `SINGLE_CLINIC`, `CLINIC_CODE`
  and `CLINIC_NAME`.
- `README.md`: add a short **"Single-clinic mode"** section (the three settings, what changes on screen, that the
  database must be new or have only one clinic, and how to switch back).

## 6. Tests and checks

- Add tests in `backend/test/` for: `clinicScope` in single-clinic mode (admin and staff both get the single
  clinic, header ignored), `POST /clinics` refused, start-up check with 0 / 1 / 2 clinics, and `/api/app-config`.
- `cd backend && node --test` must pass in **both** modes.
- Smoke test on a **new empty database** with `SINGLE_CLINIC=1`: log in as `superadmin`, register a patient →
  Confirm & Search (token) → Doctor Examine → Pharmacy Sales/Dispense → Patient Bill (print). Check the codes look like
  `[SC]-0001` / `[SC]-B0001` and no clinic switcher appears.
- Then set `SINGLE_CLINIC=0` against the multi-branch database and confirm nothing changed there.

Keep the change small and isolated: one setting, guarded branches in code, no duplicated pages.
