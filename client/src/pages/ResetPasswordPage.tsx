import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authApi } from '../services/api.js';
import { Button } from '../components/ui/Button.js';
import { useNotification } from '../contexts/NotificationContext.js';

const Label: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold tracking-wide uppercase text-fg-muted mb-1">{children}</label>
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`w-full h-11 px-3 rounded-[10px] bg-surface-sunken border border-border-strong text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${props.className || ''}`} />
);

function strengthInfo(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (/^\d{6,}$/.test(pw)) score = Math.max(score, 2);
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500', 'bg-emerald-400'];
  return { score, label: labels[score] || labels[0], color: colors[score] || colors[0] };
}

export const ResetPasswordPage: React.FC = () => {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const token = search.get('token') || '';
  const initialMode = token ? 'token' : (search.get('mode') === 'temp' ? 'temp' : 'recovery');
  const [mode, setMode] = useState<'recovery' | 'temp' | 'token'>(initialMode as any);
  const [username, setUsername] = useState('');
  const [code, setCode] = useState(''); // recovery code or temp password
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { if (token) setMode('token'); }, [token]);
  const strength = useMemo(() => strengthInfo(newPassword), [newPassword]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode !== 'token' && !username.trim()) return setError('Username is required');
    if (!code.trim() && mode !== 'token') return setError(mode === 'recovery' ? 'Recovery code is required' : 'Temporary password is required');
    if (mode === 'token' && !token) return setError('Reset token is missing');
    if (!newPassword) return setError('New password is required');
    if (newPassword !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      if (mode === 'recovery') {
        await authApi.resetWithRecoveryCode({ username: username.trim(), recoveryCode: code.trim(), newPassword });
      } else if (mode === 'temp') {
        await authApi.resetWithTempPassword({ username: username.trim(), tempPassword: code, newPassword });
      } else {
        await authApi.resetWithToken({ token, newPassword });
      }
      setDone(true);
      notify.success('Password updated. Please sign in.');
    } catch (err: any) {
      setError(err?.message || 'Unable to reset password');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-success-subtle border border-success/30 flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="w-6 h-6 text-success" /></div>
          <h1 className="text-2xl font-black text-fg mb-2" style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>Password updated</h1>
          <p className="text-sm text-fg-muted mb-4">Your password has been reset. Sign in with your new password.</p>
          <Button variant="primary" onClick={() => navigate('/login', { replace: true })}>Go to sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <h1 className="text-3xl font-black text-fg mb-1" style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>Reset password</h1>
        <p className="text-sm text-fg-muted mb-4">Set a new password using an approved recovery method.</p>

        {!token && (
          <div className="flex gap-2 mb-4">
            <button type="button" onClick={()=>setMode('recovery')} className={`flex-1 h-9 rounded-[10px] border text-sm font-semibold ${mode==='recovery'?'bg-accent text-accent-fg border-accent':'bg-surface text-fg-muted border-border-strong'}`}>Recovery code</button>
            <button type="button" onClick={()=>setMode('temp')} className={`flex-1 h-9 rounded-[10px] border text-sm font-semibold ${mode==='temp'?'bg-accent text-accent-fg border-accent':'bg-surface text-fg-muted border-border-strong'}`}>Temporary password</button>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {mode !== 'token' && (
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoFocus />
            </div>
          )}
          {mode === 'recovery' && (
            <div>
              <Label htmlFor="recovery">Recovery code</Label>
              <Input id="recovery" value={code} onChange={e=>setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="one-time-code" />
              <div className="text-[11px] text-fg-subtle mt-1">Admins only. Each code can be used once.</div>
            </div>
          )}
          {mode === 'temp' && (
            <div>
              <Label htmlFor="temp">Temporary password</Label>
              <Input id="temp" type={show ? 'text' : 'password'} value={code} onChange={e=>setCode(e.target.value)} autoComplete="current-password" />
              <div className="text-[11px] text-fg-subtle mt-1">Provided by an administrator. You will set a new password now.</div>
            </div>
          )}
          {mode === 'token' && (
            <div className="text-sm text-fg-muted bg-background border border-border rounded-[10px] p-3">Using a secure email reset link.</div>
          )}

          <div>
            <Label htmlFor="newpw">New password</Label>
            <div className="relative">
              <Input id="newpw" type={show ? 'text' : 'password'} value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" className="pr-11" />
              <button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'} aria-pressed={show} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-fg-muted mb-1"><span>Strength</span><span>{strength.label}</span></div>
                <div className="h-1.5 rounded bg-surface-raised overflow-hidden flex gap-0.5">{Array.from({length:5}).map((_,i)=> <div key={i} className={`flex-1 ${i < strength.score ? strength.color : 'bg-transparent'}`} />)}</div>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type={show ? 'text' : 'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" />
          </div>

          {error && <div className="text-sm text-danger bg-danger-subtle border border-danger/30 rounded-[10px] p-3 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span></div>}

          <Button type="submit" variant="primary" className="w-full h-11" disabled={busy} isLoading={busy}>Set new password</Button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <Link to="/forgot-password" className="text-fg-muted hover:text-fg">Recovery options</Link>
          <Link to="/login" className="text-warning hover:text-warning">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

