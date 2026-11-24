import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertTriangle, ShieldCheck, Copy, Download, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { authApi } from '../services/api.js';
import { Button } from '../components/ui/Button.js';

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (/^\d{6,}$/.test(pw)) score = Math.max(score, 2); // PIN allowed case
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500', 'bg-emerald-400'];
  return { score, label: labels[score] || labels[0], color: colors[score] || colors[0] };
}

const FieldLabel: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold tracking-wide uppercase text-fg-muted mb-1">{children}</label>
);

const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <input
    ref={ref}
    {...props}
    className={`w-full h-11 px-3 rounded-[10px] bg-surface-sunken border border-border-strong text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background ${props.className || ''}`}
  />
));
TextInput.displayName = 'TextInput';

export const LoginPage: React.FC = () => {
  const { login, bootstrap, needsBootstrap, bootstrapInfo, loading, user } = useAuth();
  const notify = useNotification();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from || '/overview';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [ackCodes, setAckCodes] = useState(false);
  const userRef = useRef<HTMLInputElement | null>(null);

  // redirect away if already signed in
  useEffect(() => {
    if (!loading && user && !user.mustChangePassword) {
      navigate(from, { replace: true });
    } else if (!loading && user?.mustChangePassword) {
      navigate('/force-change-password', { replace: true, state: { from } });
    }
  }, [loading, user, navigate, from]);

  useEffect(() => { userRef.current?.focus(); }, [needsBootstrap]);

  // 401 toast on redirect (task 12)
  useEffect(() => {
    try {
      if (sessionStorage.getItem('qwesie.auth.toast401') === '1') {
        sessionStorage.removeItem('qwesie.auth.toast401');
        notify.info('Your session expired. Please sign in to continue.');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const t = setInterval(() => setLockoutSeconds(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockoutSeconds]);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const onKeyCheck = (e: React.KeyboardEvent<HTMLInputElement>) => {
    try { setCapsLock(!!e.getModifierState && e.getModifierState('CapsLock')); } catch {}
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!username.trim()) errs.username = 'Username is required';
    if (!password) errs.password = needsBootstrap ? 'Password or PIN is required' : 'Password or PIN is required';
    if (needsBootstrap) {
      if (!displayName.trim()) errs.displayName = 'Display name is required';
      if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
      if (bootstrapInfo?.setupTokenRequired && !setupToken.trim()) errs.setupToken = 'Setup token is required (shown in server console)';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (needsBootstrap) {
        const res = await bootstrap({ username: username.trim(), password, displayName: displayName.trim() || username.trim(), setupToken: setupToken.trim() || undefined });
        if (res?.recoveryCodes && Array.isArray(res.recoveryCodes)) {
          setRecoveryCodes(res.recoveryCodes);
          return; // show codes once before continuing
        }
        navigate(from, { replace: true });
      } else {
        const res = await login(username.trim(), password, rememberMe);
        if (res?.user?.mustChangePassword) {
          navigate('/force-change-password', { replace: true, state: { from } });
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.message || 'Authentication failed';
      if (status === 423) {
        // lockout
        const retry = Number(err?.response?.data?.error?.retryAfterSeconds || err?.retryAfterSeconds || 0);
        setLockoutSeconds(retry > 0 ? retry : 15 * 60);
        setError('Too many failed attempts. Try again later.');
      } else {
        setError(msg);
      }
    } finally { setBusy(false); }
  };

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    try { await navigator.clipboard.writeText(recoveryCodes.join('\n')); notify.success('Recovery codes copied'); } catch { notify.error('Copy failed'); }
  };
  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob([`Qwesie TV recovery codes\nGenerated: ${new Date().toISOString()}\n\n${recoveryCodes.join('\n')}\n\nKeep these codes safe. Each code can be used once.`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'qwesie-tv-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-fg">
        <div className="animate-pulse space-y-3 w-80">
          <div className="h-8 bg-surface-raised rounded w-40" />
          <div className="h-4 bg-surface rounded w-64" />
          <div className="h-40 bg-surface rounded-xl border border-border" />
        </div>
      </div>
    );
  }

  // Recovery codes screen (shown once after first-run bootstrap)
  if (recoveryCodes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-success-subtle border border-success/30 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-success" /></div>
            <div>
              <h1 className="text-2xl font-black text-fg" style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>Recovery Codes</h1>
              <p className="text-sm text-fg-muted">Save these codes now. They will not be shown again.</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4 mb-4 grid grid-cols-2 gap-2 font-mono text-sm text-warning">
            {recoveryCodes.map((c) => <div key={c} className="px-2 py-1.5 rounded bg-surface border border-border text-center tracking-wider">{c}</div>)}
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="secondary" onClick={copyCodes}><Copy className="w-4 h-4" />Copy</Button>
            <Button variant="secondary" onClick={downloadCodes}><Download className="w-4 h-4" />Download</Button>
          </div>
          <label className="flex items-start gap-2 text-sm text-fg-muted mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={ackCodes} onChange={e => setAckCodes(e.target.checked)} className="mt-1 accent-accent" />
            <span>I have saved these recovery codes in a safe place. I understand each code can be used once and they cannot be shown again.</span>
          </label>
          <Button variant="primary" className="w-full" disabled={!ackCodes} onClick={() => navigate(from, { replace: true })}><CheckCircle2 className="w-4 h-4" />Continue to Qwesie TV</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <div className="mb-6">
          <div className="text-3xl font-black text-fg tracking-tight" style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif', letterSpacing: '0.04em' }}>QWESIE TV</div>
          <div className="text-sm text-fg-muted mt-1">{needsBootstrap ? 'First-run setup: create the admin account' : 'Sign in to continue'}</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {needsBootstrap && (
            <div>
              <FieldLabel htmlFor="displayName">Display name</FieldLabel>
              <TextInput ref={!needsBootstrap ? undefined : userRef} id="displayName" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Administrator" autoComplete="name" />
              {fieldErrors.displayName && <div className="text-xs text-danger mt-1">{fieldErrors.displayName}</div>}
            </div>
          )}

          <div>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <TextInput ref={needsBootstrap ? undefined : userRef} id="username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoFocus />
            {fieldErrors.username && <div className="text-xs text-danger mt-1">{fieldErrors.username}</div>}
          </div>

          <div>
            <FieldLabel htmlFor="password">{needsBootstrap ? 'Password or PIN' : 'Password or PIN'}</FieldLabel>
            <div className="relative">
              <TextInput
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyUp={onKeyCheck}
                onKeyDown={onKeyCheck}
                autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && <div className="text-xs text-danger mt-1">{fieldErrors.password}</div>}
            {capsLock && <div className="text-xs text-warning mt-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Caps Lock is on</div>}
            {needsBootstrap && password && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-fg-muted mb-1"><span>Password strength</span><span>{strength.label}</span></div>
                <div className="h-1.5 rounded bg-surface-raised overflow-hidden flex gap-0.5">
                  {Array.from({length:5}).map((_,i)=> <div key={i} className={`flex-1 ${i < strength.score ? strength.color : 'bg-transparent'}`} />)}
                </div>
                <div className="text-[11px] text-fg-subtle mt-1">Min 8 characters, or a numeric PIN of 6+ digits for scorer/viewer accounts (if enabled).</div>
              </div>
            )}
          </div>

          {needsBootstrap && (
            <>
              <div>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <TextInput id="confirmPassword" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" />
                {fieldErrors.confirmPassword && <div className="text-xs text-danger mt-1">{fieldErrors.confirmPassword}</div>}
              </div>
              {bootstrapInfo?.setupTokenRequired && (
                <div>
                  <FieldLabel htmlFor="setupToken">Setup token</FieldLabel>
                  <TextInput id="setupToken" value={setupToken} onChange={e=>setSetupToken(e.target.value)} placeholder="Token from server console" autoComplete="off" />
                  {fieldErrors.setupToken && <div className="text-xs text-danger mt-1">{fieldErrors.setupToken}</div>}
                  <div className="text-[11px] text-fg-subtle mt-1">Required for protected first-run setup. Check the server console output.</div>
                </div>
              )}
            </>
          )}

          {!needsBootstrap && (
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} className="accent-accent" />
                <span>Remember me (7 days)</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-warning hover:text-warning">Forgot password?</Link>
            </div>
          )}

          {error && (
            <div className="text-sm text-danger bg-danger-subtle border border-danger/30 rounded-[10px] p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div>{error}</div>
                {lockoutSeconds > 0 && <div className="text-xs text-danger mt-1">Try again in {Math.floor(lockoutSeconds/60)}:{String(lockoutSeconds%60).padStart(2,'0')}</div>}
              </div>
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full h-11 text-base" disabled={busy || (lockoutSeconds > 0 && !needsBootstrap)} isLoading={busy}>
            {busy ? 'Please wait…' : (needsBootstrap ? 'Create admin & continue' : 'Sign in')}
          </Button>
        </form>

        <p className="mt-4 text-xs text-fg-subtle">Session uses a secure cookie. Overlay and output URLs remain public for OBS/displays.</p>
      </div>
    </div>
  );
};

export default LoginPage;

