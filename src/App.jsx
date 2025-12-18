import CanvasPage from './pages/CanvasPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import RoomsPage from './pages/RoomsPage.jsx';
import { useEffect, useState } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('auth');
  const [authToken, setAuthToken] = useState('');
  const [roomId, setRoomId] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('jwt');
    if (saved) {
      setAuthToken(saved);
      setActiveTab('rooms');
    }
    const savedRoom = localStorage.getItem('roomId');
    if (savedRoom) setRoomId(savedRoom);
  }, []);

  return (
    <div className="h-screen bg-black text-slate-100 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        {activeTab === 'auth' ? (
          <div className="h-full overflow-auto">
            <AuthPage
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
