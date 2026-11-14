import { useState } from 'react';
import { KeyRound, Save, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { CardHeader, Input, useToast, FORM_ACTIONS } from '../components/ui.jsx';

const EMPTY = { current_password: '', new_password: '', confirm: '' };

export default function Profile() {
  const { user } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (f.new_password !== f.confirm) return toast(t('profile.mismatch'), 'error');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { current_password: f.current_password, new_password: f.new_password } });
      toast(t('profile.changed'));
      setF(EMPTY);
    } catch (err) {
      toast(err.message || t('common.saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <div className="card max-w-xl">
      <form onSubmit={submit}>
        <CardHeader icon={KeyRound} title={t('profile.changePassword')}
          subtitle={`${user.name} · ${user.emp_code} · ${t(`role.${user.role}`)}${user.clinic_name ? ' · ' + user.clinic_name : ''}`} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input type="password" label={t('profile.current')} required autoComplete="current-password" value={f.current_password}
            onChange={(e) => setF({ ...f, current_password: e.target.value })} />
          <Input type="password" label={t('profile.new')} required minLength={6} autoComplete="new-password" placeholder="6 characters or more"
            value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} />
          <Input type="password" label={t('profile.confirm')} required autoComplete="new-password" value={f.confirm}
            onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </div>
        <div className={FORM_ACTIONS.replace('grid-cols-3', 'grid-cols-2')}>
          <button type="button" className="btn-secondary px-2 sm:px-4" onClick={() => setF(EMPTY)}><X size={16} /> {t('common.cancel')}</button>
          <button type="submit" className="btn-primary px-2 sm:px-4" disabled={busy}><Save size={16} /> {busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
