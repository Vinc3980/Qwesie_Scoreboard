import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Mail, KeyRound, ShieldCheck } from 'lucide-react';
import { authApi } from '../services/api.js';
import { Button } from '../components/ui/Button.js';
import { useNotification } from '../contexts/NotificationContext.js';

const Label: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold tracking-wide uppercase text-fg-muted mb-1">{children}</label>
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} className={`w-full h-11 px-3 rounded-[10px] bg-surface-sunken border border-border-strong text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${props.className || ''}`} />
);

export const ForgotPasswordPage: React.FC = () => {
  const notify = useNotification();
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);

  useEffect(() => { authApi.smtpStatus().then(r => setSmtpEnabled(!!r?.enabled)).catch(() => setSmtpEnabled(false)); }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true);
    try {
      await authApi.forgotPassword(identifier.trim());
      setSubmitted(true);
      notify.success('If the account exists, reset options are available.');
    } catch (err: any) {
      notify.error(err?.message || 'Request failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <h1 className="text-3xl font-black text-fg mb-1" style={{ fontFamily: '"Barlow Condensed", Inter, sans-serif' }}>Account recovery</h1>
        <p className="text-sm text-fg-muted mb-5">Recover access on an offline/LAN venue. Options do not reveal whether an account exists.</p>

        <div className="space-y-3 mb-6">
          <div className="rounded-xl border border-border bg-background p-4 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-fg">Admin recovery code</div>
              <div className="text-sm text-fg-muted">If you are an admin and saved your one-time recovery codes, you can reset your password directly.</div>
              <Link to="/reset-password?mode=recovery" className="inline-block mt-2 text-sm text-warning hover:text-warning font-semibold">Use a recovery code →</Link>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4 flex gap-3">
            <KeyRound className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-fg">Temporary password from admin</div>
              <div className="text-sm text-fg-muted">If an administrator reset your password, use the temporary password they provided to set a new one.</div>
              <Link to="/reset-password?mode=temp" className="inline-block mt-2 text-sm text-warning hover:text-warning font-semibold">Use temporary password →</Link>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4 flex gap-3">
            <Mail className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-fg">Email reset link {smtpEnabled === false ? <span className="text-xs font-normal text-fg-subtle">(not configured)</span> : smtpEnabled ? <span className="text-xs font-normal text-success">(available)</span> : null}</div>
              <div className="text-sm text-fg-muted">If email is configured on this server, request a single-use reset link (valid 30 minutes).</div>
              {smtpEnabled !== false && (
                <form onSubmit={onSubmit} className="mt-3 space-y-2">
                  <div>
                    <Label htmlFor="identifier">Username or email</Label>
                    <Input id="identifier" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Enter username or email" autoComplete="username" />
                  </div>
                  <Button type="submit" variant="secondary" disabled={busy || !identifier.trim()} isLoading={busy}>Request reset link</Button>
                  {submitted && <div className="text-xs text-success">If the account exists, a reset link has been sent (when email is configured).</div>}
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link to="/login" className="text-sm text-fg-muted hover:text-fg">← Back to sign in</Link>
          <div className="text-xs text-fg-subtle flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />No account details are revealed</div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;

