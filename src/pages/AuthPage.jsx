import React, { useState } from 'react';

const API_BASE = 'https://sketchly-jabk.onrender.com';

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
    <div className="max-w-lg mx-auto py-10 px-4">
      <div className="bg-black/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-100">{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('signup')}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                mode === 'signup' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Signup
            </button>
            <button
              onClick={() => setMode('login')}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                mode === 'login' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Login
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <label className="block text-sm text-slate-300">
              Name
              <input
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
          )}

          <label className="block text-sm text-slate-300">
            Email
            <input
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>

          <label className="block text-sm text-slate-300">
            Password
            <input
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
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
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2 rounded-md border border-blue-500 transition"
          >
            {loading ? 'Working...' : mode === 'signup' ? 'Create account' : 'Login'}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-rose-200">{message}</p>}
      </div>
    </div>
  );
}
