import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, session } from './api.js';
import { loadAppConfig } from './appConfig.js';
import { isGlobalRole, userCan } from '../../../shared/permissions.js';
import { accessOf } from '../../../shared/menuAccess.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [activeClinicId, setActiveClinicIdState] = useState(session.clinicId);
  const [config, setConfig] = useState(null);       // /api/app-config: single clinic or multi-branch
  const [loading, setLoading] = useState(!!session.token);

  useEffect(() => { loadAppConfig().then(setConfig); }, []);

  const logout = useCallback(() => {
    session.setToken(null);
    session.setClinicId(null);
    setUser(null);
    setClinics([]);
    setActiveClinicIdState(null);
  }, []);

  useEffect(() => session.onUnauthorized(logout), [logout]);

  const loadClinics = useCallback(async () => {
    const res = await api('/clinics', { clinic: null });
    setClinics(res.rows);
    return res.rows;
  }, []);

  const bootstrap = useCallback(async (u) => {
    const cfg = await loadAppConfig();
    setUser(u);
    if (cfg.singleClinic && cfg.clinic) {
      // Single clinic: the active clinic is always the one clinic, for admins too (no switcher)
      const list = isGlobalRole(u.role) ? await loadClinics() : null;
      if (!list) setClinics([{ ...cfg.clinic, status: 'active' }]);
      const id = String(cfg.clinic.id);
      session.setClinicId(id);                       // the server ignores it in this mode
      setActiveClinicIdState(id);
    } else if (isGlobalRole(u.role)) {
      const list = await loadClinics();
      // keep the last chosen clinic if it still exists, otherwise "All clinics"
      const keep = list.find((c) => String(c.id) === String(session.clinicId));
      const id = keep ? String(keep.id) : null;
      session.setClinicId(id);
      setActiveClinicIdState(id);
    } else {
      setClinics(u.clinic_id ? [{ id: u.clinic_id, name: u.clinic_name, code: u.clinic_code, status: 'active' }] : []);
      session.setClinicId(null);                     // branch users: the server uses their own clinic
      setActiveClinicIdState(u.clinic_id ? String(u.clinic_id) : null);
    }
  }, [loadClinics]);

  useEffect(() => {
    if (!session.token) return;
    api('/auth/me')
      .then((r) => bootstrap(r.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [bootstrap, logout]);

  const login = useCallback(async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password }, clinic: null });
    session.setToken(r.token);
    await bootstrap(r.user);
    return r.user;
  }, [bootstrap]);

  const setActiveClinic = useCallback((id) => {
    if (config?.singleClinic) return;                // nothing to switch
    const v = id && id !== 'all' ? String(id) : null;
    session.setClinicId(v);
    setActiveClinicIdState(v);
  }, [config]);

  const value = useMemo(() => {
    const isGlobal = !!user && isGlobalRole(user.role);
    const activeClinic = clinics.find((c) => String(c.id) === String(activeClinicId)) || null;
    const singleClinic = !!config?.singleClinic;
    return {
      user, loading: loading || !config, clinics, isGlobal, activeClinic, activeClinicId,
      singleClinic,
      // the one clinic of a single-clinic install (fresh name after Clinic Settings), else null
      appClinic: singleClinic ? (activeClinic || config.clinic) : null,
      login, logout, setActiveClinic, reloadClinics: loadClinics,
      can: (perm) => userCan(user, perm),   // role defaults + Menu Permission changes (sent by the server)
      access: (key) => accessOf(user, key),   // Menu Access on a pharmacy page: 'full' | 'view' | 'none'
    };
  }, [user, loading, clinics, activeClinicId, config, login, logout, setActiveClinic, loadClinics]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
