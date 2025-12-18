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
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-6">
      <div className="flex justify-end gap-2">
        <button
          onClick={onToggleTheme}
          className={`px-3 py-1.5 rounded-md border text-sm shadow ${
            isLight ? 'bg-white border-slate-200 text-slate-900 hover:border-slate-300' : 'bg-black border-slate-700 text-slate-200 hover:border-slate-600'
          }`}
        >
          {isLight ? <FiMoon size={16} /> : <FiSun size={16} />}
        </button>
        <button
          onClick={handleLogout}
          className={`px-3 py-1.5 rounded-md border text-sm ${
            isLight ? 'bg-white text-slate-900 border-slate-200 hover:border-slate-300' : 'bg-black text-slate-200 border-slate-700 hover:border-slate-600'
          }`}
        >
          Logout
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 bg-black/80 border border-slate-800 rounded-xl p-4 shadow">
          <h3 className="text-slate-100 font-semibold mb-3">Create a room</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="Room name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <button
              onClick={createRoom}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white border border-blue-500"
            >
              Create
            </button>
          </div>
        </div>
        <div className="flex-1 bg-black/80 border border-slate-800 rounded-xl p-4 shadow">
          <h3 className="text-slate-100 font-semibold mb-3">Join a room</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
              placeholder="Join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button
              onClick={joinRoom}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white border border-blue-500"
            >
              Join
            </button>
          </div>
        </div>
      </div>

      <div className="bg-black/80 border border-slate-800 rounded-xl p-4 shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-100 font-semibold">Your rooms</h3>
          <button
            onClick={fetchRooms}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 text-sm disabled:opacity-60"
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
              <div key={room.id} className="border border-slate-800 rounded-lg p-3 bg-black/60">
                <div className="flex items-center justify-between">
                  <h4 className="text-slate-100 font-semibold">{room.name}</h4>
                  <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                    {room.role || (room.ownerId === room.userId ? 'owner' : 'member')}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-1">Join code: {room.joinCode}</p>
                <p className="text-slate-500 text-xs">Created: {new Date(room.createdAt).toLocaleString()}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onOpenRoom?.(room.id)}
                    className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm border border-blue-500"
                  >
                    Open in canvas
                  </button>
                  {(room.role === 'owner' || room.ownerId === user?.id || room.ownerId === user?._id) ? (
                    <button
                      onClick={() => deleteRoom(room.id)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-md bg-rose-700 hover:bg-rose-600 text-white text-sm border border-rose-600 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => exitRoom(room.id)}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 text-sm disabled:opacity-60"
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
  );
}
