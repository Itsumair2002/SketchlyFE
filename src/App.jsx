import CanvasPage from './pages/CanvasPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import RoomsPage from './pages/RoomsPage.jsx';
import { useEffect, useState } from 'react';

export default function App() {
  const getInitialTab = () => {
    const saved = localStorage.getItem('jwt');
    const savedRoom = localStorage.getItem('roomId');
    const lastPage = localStorage.getItem('lastPage');
    const hash = window.location.hash || '';
    if (hash === '#/canvas' && saved && savedRoom) return 'canvas';
    if (hash === '#/rooms' && saved) return 'rooms';
    if (hash === '#/auth') return 'auth';
    if (lastPage === 'canvas' && saved && savedRoom) return 'canvas';
    if (lastPage === 'rooms' && saved) return 'rooms';
    if (saved) return 'rooms';
    return 'auth';
  };

  const [activeTab, setActiveTab] = useState(() => getInitialTab());
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('jwt') || '');
  const [roomId, setRoomId] = useState(() => localStorage.getItem('roomId') || '');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lastPage', activeTab);
    window.location.hash = `#/${activeTab}`;
  }, [activeTab]);

  return (
    <div className="h-screen flex flex-col overflow-hidden safe-screen">
      <div className="flex-1 min-h-0">
        {activeTab === 'auth' ? (
          <div className="h-full overflow-auto">
            <AuthPage
              theme={theme}
              onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              onAuth={(token) => {
                setAuthToken(token);
                localStorage.setItem('jwt', token);
                setActiveTab('rooms');
              }}
            />
          </div>
        ) : activeTab === 'rooms' ? (
          <div className="h-full overflow-auto">
            <RoomsPage
              token={authToken}
              onOpenRoom={(id) => {
                setRoomId(id);
                localStorage.setItem('roomId', id);
                setActiveTab('canvas');
              }}
              onRequireAuth={() => setActiveTab('auth')}
              theme={theme}
              onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            />
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            <CanvasPage
              initialToken={authToken}
              initialRoomId={roomId}
              onBack={() => setActiveTab('rooms')}
              onExitedRoom={() => {
                setRoomId('');
                localStorage.removeItem('roomId');
                setActiveTab('rooms');
              }}
              theme={theme}
              onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
