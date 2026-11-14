// Which kind of install the server is: multi-branch, or single clinic (SINGLE_CLINIC=1 in backend/.env).
// Loaded once at start-up, so one frontend/dist build serves both.
import { api } from './api.js';

const FALLBACK = { singleClinic: false, clinic: null };
let promise = null;

/** { singleClinic: boolean, clinic: { id, code, name } | null } (multi-branch if the call fails) */
export function loadAppConfig() {
  if (!promise) {
    promise = api('/app-config', { clinic: null })
      .then((c) => ({ singleClinic: !!c?.singleClinic, clinic: c?.clinic || null }))
      .catch(() => FALLBACK);
  }
  return promise;
}
