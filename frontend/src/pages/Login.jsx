import { useEffect, useState } from 'react';
import { LogIn, User, Lock, Eye, EyeOff, AlertCircle, Stethoscope, Pill, Receipt } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { loadAppConfig } from '../lib/appConfig.js';
import { useT } from '../lib/i18n.jsx';
import { LangToggle } from '../components/Layout.jsx';

// Sign-in (as in Ayush ALL IN ONE): a branded gradient backdrop; on wide screens the app's name and what
// it does on the left, the sign-in card on the right.
export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // single-clinic install: CLINIC_NAME is the heading
  const [singleClinic, setSingleClinic] = useState(null);
  useEffect(() => { loadAppConfig().then((c) => setSingleClinic(c.singleClinic ? c.clinic : null)); }, []);
  const appName = singleClinic?.name || 'Ayush Pro';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
      window.location.hash = '/';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const features = [
    [Stethoscope, t('menu.doctor'), t('menu.examine') + ' · ' + t('menu.patientHistory')],
    [Pill, t('menu.pharmacy'), t('menu.itemGroup') + ' · ' + t('menu.stockIn') + ' · ' + t('menu.sales')],
    [Receipt, t('menu.billing'), t('menu.patientBill') + ' · ' + t('menu.billList')],
  ];

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-sidebar-gradient px-4 py-8">
      <span className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/5" />
      <span className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-teal-400/10" />
      <span className="pointer-events-none absolute right-1/3 top-10 h-40 w-40 rounded-full bg-brand-400/10 blur-2xl" />

      <div className="relative grid w-full max-w-4xl items-center gap-8 lg:grid-cols-2">
        <div className="hidden text-white lg:block">
          <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg">
            <img src="/logo-128.png" alt="" className="h-full w-full object-contain" />
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight">{appName}</h1>
          <p className="mt-2 max-w-sm text-sm text-white/70">{t(singleClinic ? 'login.taglineSingle' : 'login.tagline')}</p>
          <p className="mt-1 max-w-sm text-12 text-white/50">{t(singleClinic ? 'login.taglineSubSingle' : 'login.taglineSub')}</p>
          <ul className="mt-7 space-y-3.5">
            {features.map(([Icon, title, text]) => (
              <li key={title} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15"><Icon size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-12 text-white/60">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-sm animate-fade-in rounded-3xl bg-white p-7 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)] sm:p-8">
          <LangToggle className="absolute right-4 top-4" />
          <div className="mb-6 flex flex-col items-center pt-4 text-center">
            <span className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-md ring-1 ring-ink-100 lg:hidden">
              <img src="/logo-128.png" alt="" className="h-full w-full object-contain" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-ink-900">{t('login.title')}</h2>
            <p className="mt-1 text-13 text-ink-400"><span className="lg:hidden">{appName} · </span>{t('login.subtitle')}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="login-user">{t('login.username')}</label>
              <div className="relative">
                <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input id="login-user" className="input min-h-[38px] pl-9" value={username} onChange={(e) => setUsername(e.target.value)}
                  autoFocus required placeholder={t('login.username')} autoComplete="username" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="login-pass">{t('login.password')}</label>
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input id="login-pass" type={showPassword ? 'text' : 'password'} className="input min-h-[38px] pl-9 pr-10" value={password}
                  onChange={(e) => setPassword(e.target.value)} required placeholder={t('login.password')} autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && (
              <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-13 font-medium text-red-700">
                <AlertCircle size={15} className="shrink-0" /> {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={busy}>
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <LogIn size={16} />}
              {t('login.submit')}
            </button>
          </form>
          <p className="mt-6 text-center text-11 text-ink-300">© {new Date().getFullYear()} Ayush Pro · SmartClinic</p>
        </div>
      </div>
    </div>
  );
}
