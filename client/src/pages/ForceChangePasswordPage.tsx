import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { authApi } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { Button } from '../components/ui/Button.js';

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

export const ForceChangePasswordPage: React.FC = () => {
  const { user, refresh, logout } = useAuth();
  const notify = useNotification();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location.state?.from || '/overview';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = useMemo(() => strengthInfo(newPassword), [newPassword]);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true, state: { from } });
    else if (!user.mustChangePassword) navigate(from, { replace: true });
  }, [user, navigate, from]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentPassword) return setError('Current (temporary) password is required');
    if (!newPassword) return setError('New password is required');
    if (newPassword !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      await refresh();
      notify.success('Password updated');
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-warning-subtle border border-warning/30 flex items-center justify-center"><ShieldAlert className="w-5 h-5 text-warning" /></div>
          <div>
            <h1 className="text-2xl font-black text-fg" style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>Change your password</h1>
            <p className="text-sm text-fg-muted">You must set a new password before continuing.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div>
            <Label htmlFor="current">Current / temporary password</Label>
            <Input id="current" type={show ? 'text' : 'password'} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </div>
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

          <Button type="submit" variant="primary" className="w-full h-11" disabled={busy} isLoading={busy}>Update password & continue</Button>
        </form>

        <div className="mt-4 text-center">
          <button type="button" onClick={() => logout().then(()=>navigate('/login', { replace: true }))} className="text-sm text-fg-muted hover:text-fg">Sign out</button>
        </div>
      </div>
    </div>
  );
};

export default ForceChangePasswordPage;

