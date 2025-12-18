import React, { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE;

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('signup');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const endpoint = mode === 'signup' ? '/auth/signup' : '/auth/login';
      const payload = mode === 'signup' ? form : { email: form.email, password: form.password };
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

      if (!res.ok || !data.token) {
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

  return (
    <div className="min-h-screen bg-slate-950 text-sky-50 relative overflow-hidden">
      <div className="neon-sheen" />
      <div className="neon-grid" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-14 flex flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-6">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.2em] bg-sky-500/10 border border-sky-500/40 text-sky-200">
            Neon Sketch
            <span className="h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
          </p>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-white drop-shadow-[0_0_30px_rgba(0,234,255,0.25)]">
            Craft ideas in a neon-lit workspace.
          </h1>
          <p className="text-slate-300 text-lg max-w-2xl">
            Create an account or jump back in. Built for fast sketching, live collaboration, and midnight bursts of inspiration.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <div className="p-3 rounded-xl border border-sky-500/20 bg-slate-900/60 backdrop-blur">
              <p className="text-sm text-slate-200 font-semibold">Real-time teams</p>
              <p className="text-xs text-slate-400">Invite friends with a code and draw together instantly.</p>
            </div>
            <div className="p-3 rounded-xl border border-sky-500/20 bg-slate-900/60 backdrop-blur">
              <p className="text-sm text-slate-200 font-semibold">Secure access</p>
              <p className="text-xs text-slate-400">Your rooms stay private with token-based access.</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="neon-card shadow-[0_0_45px_rgba(0,234,255,0.25)]">
            <div className="neon-card__inner">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-sky-200/80">Welcome {mode === 'signup' ? 'aboard' : 'back'}</p>
                  <h2 className="text-xl font-semibold text-white">{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
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
                  <label className="block text-sm text-slate-200">
                    Name
                    <input
                      className="mt-2 w-full neon-input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </label>
                )}

                <label className="block text-sm text-slate-200">
                  Email
                  <input
                    className="mt-2 w-full neon-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </label>

                <label className="block text-sm text-slate-200">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full neon-button"
                >
                  {loading ? 'Working...' : mode === 'signup' ? 'Create account' : 'Login'}
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
