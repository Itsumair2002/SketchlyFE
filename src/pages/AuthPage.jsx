import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3000';

export default function AuthPage({ onAuth, theme = 'dark', onToggleTheme = () => {} }) {
  const [mode, setMode] = useState('signup');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const isLight = theme === 'light';
  const [resending, setResending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  useEffect(() => {
    setOtpStep(false);
    setOtp('');
    setExpiresAt(null);
    setRemainingMs(0);
    setMessage('');
    setPendingEmail('');
  }, [mode]);

  useEffect(() => {
    if (!expiresAt) return;
    const updateRemaining = () => setRemainingMs(Math.max(0, expiresAt - Date.now()));
    updateRemaining();
    const id = setInterval(updateRemaining, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const formatTimer = () => {
    if (!expiresAt) return '';
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      let endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      let payload = mode === 'signup' ? form : { email: form.email, password: form.password };
      if (otpStep) {
        endpoint = '/auth/verify';
        payload = { email: pendingEmail || form.email, otp };
      }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        data = text ? { error: text } : {};
      }

      if (data.pending || data.code === 'UNVERIFIED') {
        setOtpStep(true);
        setPendingEmail(data.email || form.email);
        setMessage('OTP sent to your email. Please enter it below.');
        setExpiresAt(Date.now() + 10 * 60 * 1000);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      if (!data.token) {
        throw new Error(data.error || 'Request failed');
      }

      localStorage.setItem('jwt', data.token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      onAuth?.(data.token);
      setMessage('');
    } catch (err) {
      setMessage(err.message || 'Unable to sign in right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/auth/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail || form.email }),
      });
      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        data = text ? { error: text } : {};
      }
      if (!res.ok) {
        throw new Error(data.error || 'Unable to resend OTP');
      }
      setOtp('');
      setOtpStep(true);
      setExpiresAt(Date.now() + 10 * 60 * 1000);
      setMessage('OTP re-sent. Check your email.');
    } catch (err) {
      setMessage(err.message || 'Unable to resend OTP right now.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen theme-bg text-theme relative overflow-hidden">
      <div className="neon-sheen" />
      <div className="neon-grid" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-14 flex flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.2em] bg-sky-500/10 border border-sky-500/40 text-subtle">
              Sketchly
            <span className="h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
          </p>
            <button
              onClick={onToggleTheme}
              className={`h-10 w-10 rounded-full border text-sm shadow transition flex items-center justify-center ${
                isLight
                  ? 'bg-white/90 border-slate-200 text-slate-900 hover:border-slate-300'
                  : 'bg-slate-900/80 border-sky-500/30 text-sky-100 hover:border-sky-400/50'
              }`}
            >
              {isLight ? '☾' : '☀'}
            </button>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight drop-shadow-[0_0_30px_rgba(0,234,255,0.25)]">
            Visualize and collaborate instantly.
          </h1>
          <p className="text-subtle text-lg max-w-2xl">
            Create an account or jump back in. Built for fast sketching, live collaboration, and midnight bursts of inspiration.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <div className="p-3 rounded-xl border border-sky-500/20 theme-card backdrop-blur">
              <p className="text-sm font-semibold">Real-time teams</p>
              <p className="text-xs text-subtle">Invite friends with a code and draw together instantly.</p>
            </div>
            <div className="p-3 rounded-xl border border-sky-500/20 theme-card backdrop-blur">
              <p className="text-sm font-semibold">Secure access</p>
              <p className="text-xs text-subtle">Your rooms stay private with token-based access.</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="neon-card shadow-[0_0_45px_rgba(0,234,255,0.25)]">
            <div className="neon-card__inner">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-subtle">Welcome {mode === 'signup' ? 'aboard' : 'back'}</p>
                  <h2 className="text-xl font-semibold">{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
                </div>
                <div className="flex bg-slate-900/80 border border-sky-500/40 rounded-full p-1">
                  <button
                    onClick={() => setMode('signup')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                      mode === 'signup'
                        ? 'bg-sky-500 text-slate-950 shadow-[0_0_20px_rgba(0,234,255,0.45)]'
                        : 'text-sky-100 hover:text-white'
                    }`}
                  >
                    Signup
                  </button>
                  <button
                    onClick={() => setMode('login')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                      mode === 'login'
                        ? 'bg-sky-500 text-slate-950 shadow-[0_0_20px_rgba(0,234,255,0.45)]'
                        : 'text-sky-100 hover:text-white'
                    }`}
                  >
                    Login
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <label className={`block text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                    Name
                    <input
                      className="mt-2 w-full neon-input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </label>
                )}

                <label className={`block text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  Email
                  <input
                    className="mt-2 w-full neon-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>

                <label className={`block text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  Password
                  <input
                    className="mt-2 w-full neon-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    minLength={6}
                  />
                </label>

                {otpStep && (
                  <div className="space-y-1">
                    <label className={`block text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                      Enter OTP
                      <input
                        className="mt-2 w-full neon-input"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="6-digit code"
                      />
                    </label>
                    {expiresAt && (
                      <div className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'} flex items-center gap-2`}>
                        <span>Expires in {formatTimer()}</span>
                        <button
                          type="button"
                          className="underline text-sky-500 disabled:opacity-60"
                          disabled={resending}
                          onClick={handleResend}
                        >
                          {resending ? 'Resending...' : 'Resend OTP'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full neon-button"
                >
                  {loading
                    ? 'Working...'
                    : mode === 'signup'
                      ? otpStep
                        ? 'Submit OTP'
                        : 'Create account'
                      : otpStep
                        ? 'Submit OTP'
                        : 'Login'}
                </button>
              </form>

              {message && <p className="mt-4 text-sm text-rose-200">{message}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
