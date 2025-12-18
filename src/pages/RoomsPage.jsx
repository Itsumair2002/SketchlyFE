import React, { useEffect, useState } from 'react';
import { FiMoon, FiSun } from 'react-icons/fi';

const API_BASE = import.meta.env.VITE_API_BASE;

export default function RoomsPage({ token, onOpenRoom, onRequireAuth, theme = 'dark', onToggleTheme = () => {} }) {
  const [rooms, setRooms] = useState([]);
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  });
  const handleLogout = () => {
    localStorage.clear();
    onRequireAuth?.();
  };
  const isLight = theme === 'light';

  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    : { 'Content-Type': 'application/json' };

  const fetchRooms = async () => {
    if (!token) {
      onRequireAuth?.();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/rooms`, { headers });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load rooms');
      setRooms(data.rooms || []);
    } catch (err) {
      setError(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch (e) {
      // ignore
    }
  }, [token]);

  const createRoom = async () => {
    if (!createName.trim()) {
      setError('Room name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to create room');
      setCreateName('');
      fetchRooms();
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!joinCode.trim()) {
      setError('Join code is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/rooms/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ joinCode: joinCode.trim() }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to join room');
      setJoinCode('');
      fetchRooms();
    } catch (err) {
      setError(err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const deleteRoom = async (roomId) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to delete room');
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      setError(err.message || 'Failed to delete room');
    } finally {
      setLoading(false);
    }
  };

  const exitRoom = async (roomId) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/exit`, {
        method: 'DELETE',
        headers,
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to exit room');
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      setError(err.message || 'Failed to exit room');
    } finally {
      setLoading(false);
    }
  };

  const safeJson = async (res) => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    const text = await res.text();
    return text ? { error: text } : {};
  };

  return (
    <div className="min-h-screen bg-slate-950 text-sky-50 relative overflow-hidden">
      <div className="neon-sheen" />
      <div className="neon-grid" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-10 space-y-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-sky-200/70 inline-flex items-center gap-2">
              Control Room
              <span className="h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow-[0_0_30px_rgba(0,234,255,0.2)]">Rooms cockpit</h1>
            <p className="text-slate-300 text-sm max-w-2xl">
              Create, join, or jump into a canvas with a neon-blue glow. Stay signed in while you orchestrate your boards.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              onClick={onToggleTheme}
              className={`h-10 w-10 rounded-full border text-sm shadow transition ${
                isLight
                  ? 'bg-white/90 border-slate-200 text-slate-900 hover:border-slate-300'
                  : 'bg-slate-900/80 border-sky-500/30 text-sky-100 hover:border-sky-400/50'
              }`}
            >
              {isLight ? <FiMoon size={18} /> : <FiSun size={18} />}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 h-10 rounded-full border border-sky-500/40 bg-slate-900/70 text-sky-50 text-sm shadow-[0_10px_30px_rgba(0,234,255,0.2)] hover:shadow-[0_15px_40px_rgba(0,234,255,0.25)] transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="neon-card shadow-[0_0_30px_rgba(0,234,255,0.18)]">
            <div className="neon-card__inner space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold text-lg">Create a room</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-sky-200/70">New</span>
              </div>
              <p className="text-slate-400 text-sm">Name your space and start drawing instantly.</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 neon-input"
                  placeholder="Room name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
                <button
                  onClick={createRoom}
                  disabled={loading}
                  className="neon-button min-w-[110px]"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
          <div className="neon-card shadow-[0_0_30px_rgba(0,234,255,0.18)]">
            <div className="neon-card__inner space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold text-lg">Join a room</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-sky-200/70">Invite</span>
              </div>
              <p className="text-slate-400 text-sm">Drop in with a join code from a teammate.</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 neon-input"
                  placeholder="Join code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                />
                <button
                  onClick={joinRoom}
                  disabled={loading}
                  className="neon-button min-w-[110px]"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="neon-card shadow-[0_0_40px_rgba(0,234,255,0.2)]">
          <div className="neon-card__inner">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-sky-200/80 uppercase tracking-[0.25em]">Rooms</p>
                <h3 className="text-white font-semibold text-xl">Your spaces</h3>
              </div>
              <button
                onClick={fetchRooms}
                disabled={loading}
                className="px-4 py-2 rounded-full border border-sky-500/40 bg-slate-900/60 text-sky-50 text-sm hover:border-sky-400/70 transition disabled:opacity-60"
              >
                Refresh
              </button>
            </div>
            {error && <p className="text-rose-300 text-sm mb-3">{error}</p>}
            {loading && rooms.length === 0 ? (
              <p className="text-slate-300 text-sm">Loading...</p>
            ) : rooms.length === 0 ? (
              <p className="text-slate-400 text-sm">No rooms yet. Create or join one.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="rounded-xl border border-sky-500/20 bg-slate-900/70 p-4 shadow-[0_10px_30px_rgba(0,234,255,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-white font-semibold">{room.name}</h4>
                        <p className="text-slate-400 text-xs mt-1">Join code: {room.joinCode}</p>
                        <p className="text-slate-500 text-[11px]">Created: {new Date(room.createdAt).toLocaleString()}</p>
                      </div>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-sky-100 border border-sky-500/30">
                        {room.role || (room.ownerId === room.userId ? 'owner' : 'member')}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => onOpenRoom?.(room.id)}
                        className="px-4 py-2 rounded-full bg-sky-500 text-slate-950 text-sm font-semibold shadow-[0_10px_30px_rgba(0,234,255,0.3)] hover:shadow-[0_12px_34px_rgba(0,234,255,0.35)] transition"
                      >
                        Open in canvas
                      </button>
                      {(room.role === 'owner' || room.ownerId === user?.id || room.ownerId === user?._id) ? (
                        <button
                          onClick={() => deleteRoom(room.id)}
                          disabled={loading}
                          className="px-4 py-2 rounded-full bg-rose-700 hover:bg-rose-600 text-white text-sm border border-rose-500/80 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => exitRoom(room.id)}
                          disabled={loading}
                          className="px-4 py-2 rounded-full border border-sky-500/30 text-sky-100 text-sm bg-slate-900/80 hover:border-sky-400/60 disabled:opacity-60"
                        >
                          Exit
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
