import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from '../components/Toolbar.jsx';
import { nanoid } from '../utils/nanoid.js';

const API_BASE = import.meta.env.VITE_API_BASE;
const WS_URL = import.meta.env.VITE_WS_URL;

export default function CanvasPage({ initialRoomId = '', initialToken = '', onBack = () => {}, onExitedRoom = () => {} }) {
  const canvasRef = useRef(null);
  const dprRef = useRef(window.devicePixelRatio || 1);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [token, setToken] = useState(initialToken);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [activeTool, setActiveTool] = useState('rectangle');
  const [color, setColor] = useState('#10b981');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [elements, setElements] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [liveElements, setLiveElements] = useState({});
  const [status, setStatus] = useState('');
  const [currentEl, setCurrentEl] = useState(null);
  const [erasing, setErasing] = useState(false);
  const [eraseTargets, setEraseTargets] = useState([]);
  const [blockedErase, setBlockedErase] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  });
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [resizingHandle, setResizingHandle] = useState(null);
  const [hoverHandle, setHoverHandle] = useState(null);
  const dragOffset = useRef(null);
  const dragSnapshot = useRef(null);
  const resizeSnapshot = useRef(null);
  const [role, setRole] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const typingTimeout = useRef(null);
  const userNames = useRef({});
  const messagesRef = useRef(null);
  const pan = useRef({ x: 0, y: 0 });
  const scale = useRef(1);
  const lastPos = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('roomId');
    const jwt = params.get('token');
    if (room) setRoomId(room);
    if (jwt) setToken(jwt);
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      const storedRoom = localStorage.getItem('roomId');
      if (!room && storedRoom) setRoomId(storedRoom);
      const storedToken = localStorage.getItem('jwt');
      if (!jwt && storedToken) setToken(storedToken);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (joined) {
      setStatus('');
    }
  }, [joined, roomId]);

  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  // Fetch initial board elements
  const fetchBoard = useCallback(async () => {
    if (!roomId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/board-elements`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) return;
      const data = await res.json();
      const mapped =
        (data.elements || []).map((el) => ({
          elementId: el.elementId,
          type: el.type,
          data: el.data || {},
          userId: el.userId,
          createdAt: el.createdAt,
          updatedAt: el.updatedAt,
        })) || [];
      setElements(mapped);
    } catch (err) {
      console.error(err);
    }
  }, [roomId, token, authHeaders]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const fetchMessages = useCallback(async () => {
    if (!roomId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomId}/messages?limit=50`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list =
        (data.messages || []).map((m) => ({
          id: m.id,
          text: m.text,
          senderId: m.senderId,
          createdAt: m.createdAt,
          isDeleted: m.isDeleted,
        })) || [];
      setMessages(list.reverse());
    } catch (err) {
      // ignore
    }
  }, [roomId, token, authHeaders]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // fetch room role to decide exit availability
  useEffect(() => {
    const loadRole = async () => {
      if (!roomId || !token) {
        setRole('');
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/rooms/${roomId}`, { headers: { ...authHeaders } });
        if (!res.ok) return;
        const data = await res.json();
        setRole(data.role || '');
      } catch (e) {
        // ignore
      }
    };
    loadRole();
  }, [roomId, token, authHeaders]);

  useEffect(() => {
    if (joining) {
      setStatus('Joining room...');
    } else if (joined) {
      setStatus('');
    }
  }, [joining, joined]);

  useEffect(() => {
    setLiveElements({});
    setMessages([]);
    setTypingUsers([]);
  }, [roomId]);

  const scrollMessagesToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollMessagesToBottom();
  }, [messages, showChat, scrollMessagesToBottom]);

  // Join room when roomId changes and socket is connected
  useEffect(() => {
    if (ws && connected && roomId) {
      setJoined(false);
      setJoining(true);
      setStatus('Joining room...');
      ws.send(JSON.stringify({ type: 'ROOM_JOIN', payload: { roomId } }));
    }
    if (!roomId) {
      setJoined(false);
      setJoining(false);
    }
  }, [roomId, ws, connected]);

  // WebSocket setup
  useEffect(() => {
    if (!roomId || !token || !WS_URL) return;
    const socket = new WebSocket(`${WS_URL}?token=${token}`);
    socket.onopen = () => {
      setConnected(true);
      setJoined(false);
      setJoining(true);
      socket.send(JSON.stringify({ type: 'ROOM_JOIN', payload: { roomId } }));
      setStatus('Joining room...');
    };
    socket.onclose = () => {
      setConnected(false);
      setJoined(false);
      setJoining(false);
      setStatus('');
    };
    socket.onerror = () => {
      setConnected(false);
      setJoined(false);
      setJoining(false);
      setStatus('');
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ERROR':
            setStatus(msg.payload?.message || 'Error');
            setJoined(false);
            setJoining(false);
            break;
          case 'ROOM_JOINED':
            setJoined(true);
            setJoining(false);
            setStatus('');
            fetchBoard();
            fetchMessages();
            if (Array.isArray(msg.payload?.onlineUsers)) {
              msg.payload.onlineUsers.forEach((u) => {
                userNames.current[u.userId] = u.name;
              });
            }
            break;
          case 'BOARD_ELEMENT_ADDED':
            setStatus('');
            setElements((prev) => [...prev.filter((e) => e.elementId !== msg.payload.element.elementId), msg.payload.element]);
            setLiveElements((prev) => {
              const next = { ...prev };
              delete next[msg.payload.element.elementId];
              return next;
            });
            break;
          case 'BOARD_ELEMENT_UPDATED':
            setStatus('');
            setElements((prev) =>
              prev.map((el) =>
                el.elementId === msg.payload.elementId ? { ...el, data: { ...el.data, ...msg.payload.patch }, updatedAt: new Date().toISOString() } : el
              )
            );
            setLiveElements((prev) => {
              const next = { ...prev };
              delete next[msg.payload.elementId];
              return next;
            });
            break;
          case 'BOARD_ELEMENT_DELETED':
            setStatus('');
            setElements((prev) => prev.filter((el) => el.elementId !== msg.payload.elementId));
            setLiveElements((prev) => {
              const next = { ...prev };
              delete next[msg.payload.elementId];
              return next;
            });
            break;
          case 'BOARD_ELEMENT_LIVE': {
            const liveEl = msg.payload?.element;
            if (liveEl && liveEl.elementId) {
              setLiveElements((prev) => ({
                ...prev,
                [liveEl.elementId]: liveEl,
              }));
            }
            break;
          }
          case 'CHAT_NEW': {
            const m = msg.payload?.message;
            if (m?.senderId) {
              setMessages((prev) => [...prev, { id: m.id, text: m.text, senderId: m.senderId, createdAt: m.createdAt, isDeleted: m.isDeleted }]);
            }
            break;
          }
          case 'CHAT_TYPING': {
            const { userId, isTyping } = msg.payload || {};
            if (!userId || userId === (currentUser?.id || currentUser?._id)) break;
            setTypingUsers((prev) => {
              const set = new Set(prev);
              if (isTyping) set.add(userId);
              else set.delete(userId);
              return Array.from(set);
            });
            break;
          }
          case 'PRESENCE_JOIN': {
            if (msg.payload?.userId && msg.payload?.name) {
              userNames.current[msg.payload.userId] = msg.payload.name;
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('ws message parse error', err);
      }
    };
    setWs(socket);
    return () => {
      socket.close();
      setJoined(false);
      setStatus('');
    };
  }, [roomId, token, reconnectKey, fetchBoard]);

  // Canvas sizing + drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAll(ctx);
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Prevent browser zoom on pinch/ctrl+wheel so UI stays fixed
  useEffect(() => {
    const stopPinchZoom = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', stopPinchZoom, { passive: false });
    return () => window.removeEventListener('wheel', stopPinchZoom);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawAll(ctx);
  }, [elements, liveElements, currentEl, selectedId, eraseTargets, blockedErase]);

  const screenToWorld = (x, y) => {
    return {
      x: (x - pan.current.x) / scale.current,
      y: (y - pan.current.y) / scale.current,
    };
  };

  const drawAll = (ctx) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    ctx.translate(pan.current.x, pan.current.y);
    ctx.scale(scale.current, scale.current);

    const dimIds = new Set(eraseTargets);
    const blockedIds = new Set(blockedErase);
    const liveIds = new Set(Object.keys(liveElements));
    const myId = currentUser?.id || currentUser?._id || '';
    elements.forEach((el) => {
      const live = liveElements[el.elementId];
      if (live && live.userId && live.userId !== myId) {
        return; // hide base when a remote live preview exists
      }
      drawElement(ctx, el, false, dimIds.has(el.elementId), blockedIds.has(el.elementId));
    });
    Object.values(liveElements)
      .filter((el) => el.userId !== myId) // only render live overlays from others
      .forEach((el) => drawElement(ctx, el));
    if (currentEl) drawElement(ctx, currentEl, true);
    if (selectedId) {
      const sel = elements.find((e) => e.elementId === selectedId);
      if (sel) drawSelectionBox(ctx, sel);
    }

    ctx.restore();
  };

  const drawElement = (ctx, el, preview = false, dim = false, blocked = false) => {
    const { type, data } = el;
    ctx.strokeStyle = blocked ? '#b91c1c' : data.color || '#fff';
    ctx.lineWidth = data.strokeWidth || 2;
    ctx.fillStyle = data.fill || 'transparent';
    ctx.globalAlpha = blocked ? 0.6 : dim ? 0.3 : 1; // dim while erasing or blocked

    switch (type) {
      case 'rectangle': {
        const w = data.endX - data.startX;
        const h = data.endY - data.startY;
        ctx.strokeRect(data.startX, data.startY, w, h);
        if (data.fill && data.fill !== 'transparent') ctx.fillRect(data.startX, data.startY, w, h);
        break;
      }
      case 'ellipse': {
        ctx.beginPath();
        ctx.ellipse(
          (data.startX + data.endX) / 2,
          (data.startY + data.endY) / 2,
          Math.abs(data.endX - data.startX) / 2,
          Math.abs(data.endY - data.startY) / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        if (data.fill && data.fill !== 'transparent') ctx.fill();
        ctx.closePath();
        break;
      }
      case 'line':
      case 'arrow': {
        ctx.beginPath();
        ctx.moveTo(data.startX, data.startY);
        ctx.lineTo(data.endX, data.endY);
        ctx.stroke();
        if (type === 'arrow') {
          const angle = Math.atan2(data.endY - data.startY, data.endX - data.startX);
          const head = 10 + (data.strokeWidth || 2);
          ctx.beginPath();
          ctx.moveTo(data.endX, data.endY);
          ctx.lineTo(data.endX - head * Math.cos(angle - Math.PI / 6), data.endY - head * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(data.endX - head * Math.cos(angle + Math.PI / 6), data.endY - head * Math.sin(angle + Math.PI / 6));
          ctx.lineTo(data.endX, data.endY);
          ctx.fillStyle = data.color || '#fff';
          ctx.fill();
        }
        ctx.closePath();
        break;
      }
      case 'freehand': {
        const pts = data.points || [];
        if (pts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.closePath();
        break;
      }
      case 'text': {
        ctx.fillStyle = data.color || '#fff';
        ctx.font = `${data.fontSize || 18}px ${data.font || 'Arial'}`;
        ctx.fillText(data.text || '', data.startX, data.startY);
        break;
      }
      default:
        break;
    }
    ctx.globalAlpha = 1;
  };

  const startDrawing = (e) => {
    if (!canvasRef.current) return;
    if (!connected || !ws || !roomId || !token) {
      setStatus('Join room first');
      return;
    }
    if (!joined) {
      ws?.send(JSON.stringify({ type: 'ROOM_JOIN', payload: { roomId } }));
      setStatus('Joining room...');
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = screenToWorld(x, y);

    if (activeTool === 'pan') {
      lastPos.current = { x, y };
      return;
    }

    if (activeTool === 'select') {
      const currentSelected = selectedId ? elements.find((el) => el.elementId === selectedId) : null;
      const existingHandle = currentSelected ? hitResizeHandle(world.x, world.y, currentSelected, scale.current) : null;
      if (existingHandle) {
        setResizingHandle(existingHandle);
        resizeSnapshot.current = {
          original: JSON.parse(JSON.stringify(currentSelected)),
        };
        return;
      }

      const hit = hitTest(world.x, world.y, elements);
      if (hit) {
        setSelectedId(hit.elementId);
        dragOffset.current = { dx: world.x - hit.data.startX, dy: world.y - hit.data.startY };
        dragSnapshot.current = JSON.parse(JSON.stringify(hit));
        setResizingHandle(null);
        return;
      }

      if (currentSelected && isInsideBBox(world.x, world.y, currentSelected, 8 / scale.current)) {
        // keep selection; start drag
        dragOffset.current = { dx: world.x - currentSelected.data.startX, dy: world.y - currentSelected.data.startY };
        dragSnapshot.current = JSON.parse(JSON.stringify(currentSelected));
        return;
      }

      setSelectedId(null);
      dragOffset.current = null;
      setResizingHandle(null);
      return;
    }

    if (activeTool === 'erase') {
      setErasing(true);
      const hit = hitTest(world.x, world.y, elements);
      if (hit) {
        if (isMine(hit)) {
          setEraseTargets((prev) => (prev.includes(hit.elementId) ? prev : [...prev, hit.elementId]));
        } else {
          setBlockedErase((prev) => (prev.includes(hit.elementId) ? prev : [...prev, hit.elementId]));
        }
      }
      return;
    }

    if (activeTool === 'text') {
      const text = window.prompt('Enter text');
      if (!text) return;
      const el = {
        elementId: nanoid(),
        type: 'text',
        data: {
          startX: world.x,
          startY: world.y,
          text,
          color,
          fontSize: 18,
          strokeWidth,
        },
      };
      commitElement(el);
      return;
    }

    const base = {
      elementId: nanoid(),
      type: activeTool === 'ellipse' ? 'ellipse' : activeTool === 'freehand' ? 'freehand' : activeTool === 'arrow' ? 'arrow' : activeTool,
      data: {
        startX: world.x,
        startY: world.y,
        endX: world.x,
        endY: world.y,
        color,
        strokeWidth,
        points: activeTool === 'freehand' ? [{ x: world.x, y: world.y }] : [],
        userId: currentUser?.id || currentUser?._id || '',
      },
    };
    setCurrentEl(base);
  };

  const moveDrawing = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = screenToWorld(x, y);

    if (activeTool === 'pan' && lastPos.current) {
      const dx = x - lastPos.current.x;
      const dy = y - lastPos.current.y;
      pan.current.x += dx;
      pan.current.y += dy;
      lastPos.current = { x, y };
      drawAll(canvasRef.current.getContext('2d'));
      return;
    }

    if (activeTool === 'erase' && erasing) {
      const hit = hitTest(world.x, world.y, elements);
      if (hit) {
        if (isMine(hit)) {
          setEraseTargets((prev) => (prev.includes(hit.elementId) ? prev : [...prev, hit.elementId]));
        } else {
          setBlockedErase((prev) => (prev.includes(hit.elementId) ? prev : [...prev, hit.elementId]));
        }
      }
      drawAll(canvasRef.current.getContext('2d'));
      return;
    }

    if (activeTool === 'select' && selectedId && resizingHandle && resizeSnapshot.current) {
      let updated = null;
      setElements((prev) =>
        prev.map((el) => {
          if (el.elementId !== selectedId) return el;
          updated = resizeElement(el, resizeSnapshot.current.original, resizingHandle, world);
          return updated;
        })
      );
      if (updated) sendLiveElement(updated);
      drawAll(canvasRef.current.getContext('2d'));
      return;
    }

    if (activeTool === 'select' && selectedId && dragOffset.current) {
      const snap = dragSnapshot.current;
      if (!snap) return;
      const dx = world.x - dragOffset.current.dx - snap.data.startX;
      const dy = world.y - dragOffset.current.dy - snap.data.startY;
      let updated = null;
      setElements((prev) =>
        prev.map((el) => {
          if (el.elementId !== selectedId) return el;
          updated = shiftElement(snap, dx, dy);
          return updated;
        })
      );
      if (updated) sendLiveElement(updated);
      drawAll(canvasRef.current.getContext('2d'));
      return;
    }

    // Hover cursor for handles
    if (activeTool === 'select' && selectedId && !currentEl && !resizingHandle && !dragOffset.current) {
      const selected = elements.find((el) => el.elementId === selectedId);
      const handle = selected ? hitResizeHandle(world.x, world.y, selected, scale.current) : null;
      setHoverHandle(handle);
    } else {
      setHoverHandle(null);
    }

    if (!currentEl) return;
    setCurrentEl((prev) => {
      if (!prev) return prev;
      const next = { ...prev, data: { ...prev.data } };
      next.data.endX = world.x;
      next.data.endY = world.y;
      if (next.type === 'freehand') {
        next.data.points = [...(next.data.points || []), { x: world.x, y: world.y }];
      }
      sendLiveElement(next);
      return next;
    });
  };

  const endDrawing = () => {
    if (activeTool === 'select' && selectedId && resizingHandle && resizeSnapshot.current) {
      const moved = elements.find((el) => el.elementId === selectedId);
      if (moved && ws && connected) {
        ws.send(
          JSON.stringify({
            type: 'BOARD_ELEMENT_UPDATE',
            payload: { roomId, elementId: moved.elementId, patch: moved.data },
          })
        );
      }
      setLiveElements((prev) => {
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
      resizeSnapshot.current = null;
      setResizingHandle(null);
      return;
    }

    if (activeTool === 'select' && selectedId && dragOffset.current) {
      const moved = elements.find((el) => el.elementId === selectedId);
      if (moved && ws && connected) {
        ws.send(
          JSON.stringify({
            type: 'BOARD_ELEMENT_UPDATE',
            payload: { roomId, elementId: moved.elementId, patch: moved.data },
          })
        );
      }
      setLiveElements((prev) => {
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
      dragOffset.current = null;
      dragSnapshot.current = null;
      return;
    }
    if (activeTool === 'erase' && erasing) {
      const ids = [...eraseTargets];
      if (ids.length) {
    setElements((prev) => prev.filter((el) => !ids.includes(el.elementId)));
        setLiveElements((prev) => {
          const next = { ...prev };
          ids.forEach((id) => delete next[id]);
          return next;
        });
        if (ws && connected) {
          ids.forEach((id) => {
            ws.send(JSON.stringify({ type: 'BOARD_ELEMENT_DELETE', payload: { roomId, elementId: id } }));
          });
        }
      }
      setErasing(false);
      setEraseTargets([]);
      setBlockedErase([]);
      return;
    }
    if (currentEl) {
      commitElement(currentEl);
      setLiveElements((prev) => {
        const next = { ...prev };
        delete next[currentEl.elementId];
        return next;
      });
      setCurrentEl(null);
    }
    lastPos.current = null;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const step = e.ctrlKey ? 1.02 : 1.05; // ctrlKey catches trackpad pinch
    const zoom = e.deltaY < 0 ? step : 1 / step;
    const worldBefore = screenToWorld(x, y);
    scale.current = Math.max(0.3, Math.min(4, scale.current * zoom));
    const worldAfter = screenToWorld(x, y);
    pan.current.x += (worldAfter.x - worldBefore.x) * scale.current;
    pan.current.y += (worldAfter.y - worldBefore.y) * scale.current;
    drawAll(canvasRef.current.getContext('2d'));
  };

  const commitElement = (el) => {
    setRedoStack([]);
    if (ws && connected) {
      ws.send(
        JSON.stringify({
          type: 'BOARD_ELEMENT_ADD',
          payload: { roomId, element: el },
        })
      );
    } else {
      setStatus('Not connected to room');
    }
  };

  const sendLiveElement = useCallback(
    (el) => {
      if (!ws || !connected || !joined) return;
      const ownerId = el.userId || currentUser?.id || currentUser?._id || '';
      const payload = {
        elementId: el.elementId,
        type: el.type,
        data: el.data,
      };
      ws.send(
        JSON.stringify({
          type: 'BOARD_ELEMENT_LIVE',
          payload: { roomId, element: payload },
        })
      );
      setLiveElements((prev) => ({
        ...prev,
        [el.elementId]: {
          ...el,
          userId: ownerId,
        },
      }));
    },
    [ws, connected, joined, roomId, currentUser]
  );

  const isMine = useCallback(
    (el) => {
      const uid = currentUser?.id || currentUser?._id;
      return uid && el.userId === uid;
    },
    [currentUser]
  );

  const handleUndo = useCallback(() => {
    const uid = currentUser?.id || currentUser?._id;
    if (!uid) return;
    const mine = [...elements].reverse().find((el) => el.userId === uid);
    if (!mine) return;
    setElements((prev) => prev.filter((el) => el.elementId !== mine.elementId));
    setRedoStack((prev) => [...prev, mine]);
    if (ws && connected) {
      ws.send(
        JSON.stringify({
          type: 'BOARD_ELEMENT_DELETE',
          payload: { roomId, elementId: mine.elementId },
        })
      );
    }
  }, [elements, ws, connected, roomId, currentUser]);

  const handleRedo = useCallback(() => {
    const uid = currentUser?.id || currentUser?._id;
    if (!uid || !redoStack.length) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    if (!isMine(last)) return;
    setElements((prev) => [...prev, last]);
    if (ws && connected) {
      ws.send(
        JSON.stringify({
          type: 'BOARD_ELEMENT_ADD',
          payload: { roomId, element: last },
        })
      );
    }
  }, [redoStack, ws, connected, roomId, currentUser, isMine]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Helpers
  const getBoundingBox = (el) => {
    const { data } = el;
    let minX = Math.min(data.startX, data.endX);
    let maxX = Math.max(data.startX, data.endX);
    let minY = Math.min(data.startY, data.endY);
    let maxY = Math.max(data.startY, data.endY);
    if (data.points && data.points.length) {
      data.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    }
    return { minX, maxX, minY, maxY };
  };

  const hitTest = (x, y, list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      const { data, type } = el;
      if (!data) continue;
      switch (type) {
        case 'rectangle': {
          const minX = Math.min(data.startX, data.endX);
          const maxX = Math.max(data.startX, data.endX);
          const minY = Math.min(data.startY, data.endY);
          const maxY = Math.max(data.startY, data.endY);
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) return el;
          break;
        }
        case 'ellipse': {
          const cx = (data.startX + data.endX) / 2;
          const cy = (data.startY + data.endY) / 2;
          const rx = Math.abs(data.endX - data.startX) / 2;
          const ry = Math.abs(data.endY - data.startY) / 2;
          if (rx === 0 || ry === 0) break;
          const norm = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
          if (norm <= 1) return el;
          break;
        }
        case 'line':
        case 'arrow': {
          const dist = pointLineDistance({ x, y }, { x: data.startX, y: data.startY }, { x: data.endX, y: data.endY });
          if (dist < 6) return el;
          break;
        }
        case 'freehand': {
          const pts = data.points || [];
          for (let j = 0; j < pts.length - 1; j++) {
            const dist = pointLineDistance({ x, y }, pts[j], pts[j + 1]);
            if (dist < 6) return el;
          }
          break;
        }
        case 'text': {
          const w = (data.text || '').length * (data.fontSize || 18) * 0.6;
          const h = data.fontSize || 18;
          if (x >= data.startX && x <= data.startX + w && y <= data.startY && y >= data.startY - h) return el;
          break;
        }
        default:
          break;
      }
    }
    return null;
  };

  const pointLineDistance = (p, a, b) => {
    const A = p.x - a.x;
    const B = p.y - a.y;
    const C = b.x - a.x;
    const D = b.y - a.y;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) {
      xx = a.x;
      yy = a.y;
    } else if (param > 1) {
      xx = b.x;
      yy = b.y;
    } else {
      xx = a.x + param * C;
      yy = a.y + param * D;
    }
    const dx = p.x - xx;
    const dy = p.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const shiftElement = (el, dx, dy) => {
    const data = { ...el.data };
    data.startX += dx;
    data.startY += dy;
    data.endX += dx;
    data.endY += dy;
    if (data.points) {
      data.points = data.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    }
    return { ...el, data };
  };

  const drawSelectionBox = (ctx, el) => {
    const { minX, maxX, minY, maxY } = getBoundingBox(el);
    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1 / scale.current;
    ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
    ctx.setLineDash([]);
    const size = 8 / scale.current;
    const handles = [
      { x: minX, y: minY, key: 'tl' },
      { x: maxX, y: minY, key: 'tr' },
      { x: maxX, y: maxY, key: 'br' },
      { x: minX, y: maxY, key: 'bl' },
    ];
    ctx.fillStyle = '#22d3ee';
    handles.forEach((h) => {
      ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size);
    });
    ctx.restore();
  };

  const hitResizeHandle = (x, y, el, scaleVal) => {
    const { minX, maxX, minY, maxY } = getBoundingBox(el);
    const handles = [
      { key: 'tl', x: minX, y: minY },
      { key: 'tr', x: maxX, y: minY },
      { key: 'br', x: maxX, y: maxY },
      { key: 'bl', x: minX, y: maxY },
    ];
    const tolerance = 14 / scaleVal;
    for (const h of handles) {
      if (Math.abs(x - h.x) <= tolerance && Math.abs(y - h.y) <= tolerance) return h.key;
    }
    return null;
  };

  const isInsideBBox = (x, y, el, pad = 0) => {
    const { minX, maxX, minY, maxY } = getBoundingBox(el);
    return x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad;
  };

  const resizeElement = (el, original, handle, point) => {
    const data = { ...el.data };
    const { minX, maxX, minY, maxY } = getBoundingBox(original);
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const newX = point.x;
    const newY = point.y;

    const minScale = 0.01;
    let scaleX = 1;
    let scaleY = 1;
    if (handle === 'tl' || handle === 'bl') {
      scaleX = (maxX - newX) / width;
    } else {
      scaleX = (newX - minX) / width;
    }
    if (handle === 'tl' || handle === 'tr') {
      scaleY = (maxY - newY) / height;
    } else {
      scaleY = (newY - minY) / height;
    }
    const signX = scaleX < 0 ? -1 : 1;
    const signY = scaleY < 0 ? -1 : 1;
    scaleX = signX * Math.max(minScale, Math.abs(scaleX));
    scaleY = signY * Math.max(minScale, Math.abs(scaleY));

    const applyScale = (val, origin, scale) => origin + (val - origin) * scale;

    data.startX = applyScale(original.data.startX, handle.includes('l') ? maxX : minX, scaleX);
    data.endX = applyScale(original.data.endX, handle.includes('l') ? maxX : minX, scaleX);
    data.startY = applyScale(original.data.startY, handle.includes('t') ? maxY : minY, scaleY);
    data.endY = applyScale(original.data.endY, handle.includes('t') ? maxY : minY, scaleY);

    if (data.points) {
      data.points = original.data.points.map((p) => ({
        x: applyScale(p.x, handle.includes('l') ? maxX : minX, scaleX),
        y: applyScale(p.y, handle.includes('t') ? maxY : minY, scaleY),
      }));
    }

    if (el.type === 'text') {
      data.fontSize = Math.max(8, Math.round((original.data.fontSize || 18) * Math.abs(scaleY)));
    }

    return { ...el, data };
  };

  const getCursor = () => {
    if (activeTool === 'select' && hoverHandle) {
      if (hoverHandle === 'tl' || hoverHandle === 'br') return 'nwse-resize';
      if (hoverHandle === 'tr' || hoverHandle === 'bl') return 'nesw-resize';
    }
    if (activeTool === 'pan') return lastPos.current ? 'grabbing' : 'grab';
    if (activeTool === 'select') return 'default';
    if (activeTool === 'text') return 'text';
    if (activeTool === 'erase') return 'cell';
    return 'crosshair';
  };

  return (
    <div className="h-full w-full overflow-hidden bg-black">
      <div className="relative w-full h-full">
        <div className="absolute left-4 top-4 z-30 flex items-start pointer-events-none">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/90 border border-slate-800 text-slate-200 hover:border-slate-700 shadow pointer-events-auto"
          >
            <span className="text-lg leading-none flex items-center justify-center pb-0.5">←</span>
          </button>
        </div>

        <div className="absolute right-4 top-4 z-30">
          {role !== 'owner' && roomId ? (
            <button
              onClick={async () => {
                if (!token || !roomId) return;
                try {
                  const res = await fetch(`${API_BASE}/rooms/${roomId}/exit`, {
                    method: 'DELETE',
                    headers: { ...authHeaders },
                  });
                  if (res.ok) {
                    setRoomId('');
                    localStorage.removeItem('roomId');
                    onExitedRoom();
                  } else {
                    const data = await res.json().catch(() => ({}));
                    setStatus(data?.error || 'Failed to exit room');
                  }
                } catch (e) {
                  setStatus('Failed to exit room');
                }
              }}
              className="px-3 py-2 rounded-lg bg-rose-700 text-white text-sm border border-rose-600 hover:bg-rose-600 shadow"
            >
              Exit room
            </button>
          ) : null}
          <button
            onClick={() => setShowChat((s) => !s)}
            className="ml-2 px-3 py-2 rounded-lg bg-black/90 border border-slate-800 text-slate-200 hover:border-slate-700 shadow"
          >
            💬
          </button>
        </div>

        <div
          className="absolute left-4 top-1/2 z-10 bg-black/80 border border-slate-800 rounded-xl p-2 shadow-xl backdrop-blur pointer-events-auto"
          style={{ transform: 'translateY(-50%) translateY(32px)' }}
        >
          <Toolbar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            direction="vertical"
          />
        </div>

        <canvas
          ref={canvasRef}
          className="w-full h-full bg-black"
          onMouseDown={startDrawing}
          onMouseMove={moveDrawing}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onWheel={handleWheel}
          style={{
            touchAction: 'none',
            cursor: getCursor(),
          }}
        />
        {status && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-700 text-rose-100 px-4 py-2 rounded shadow">
            {status}
          </div>
        )}
        {(!roomId || !token) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 rounded bg-black/80 border border-slate-700 text-sm text-slate-300">
              Awaiting room and token (provide via props or query params roomId/token).
            </div>
          </div>
        )}

        {showChat && (
          <div className="absolute top-0 right-0 h-full w-80 bg-black/95 border-l border-slate-800 shadow-2xl z-30 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="font-semibold text-slate-100">Chat</div>
              <button
                onClick={() => setShowChat(false)}
                className="text-slate-300 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div ref={messagesRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 chat-scroll">
              {messages.map((m) => {
                const mine = m.senderId === (currentUser?.id || currentUser?._id);
                const name = mine ? 'You' : userNames.current[m.senderId] || m.senderId.slice(-4);
                return (
                  <div key={m.id || m.createdAt} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'}`}
                      style={{ wordBreak: 'break-word' }}
                    >
                      {!mine && <div className="text-xs text-slate-400 mb-1">{name}</div>}
                      <div>{m.text}</div>
                      <div className="text-[10px] text-slate-300 mt-1">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-slate-800">
              {typingUsers.length > 0 && (
                <div className="text-xs text-slate-400 mb-1">
                  {typingUsers.length === 1
                    ? `${userNames.current[typingUsers[0]] || 'Someone'} is typing...`
                    : '2 or more people are typing...'}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    if (ws && connected && joined && roomId) {
                      ws.send(JSON.stringify({ type: 'CHAT_TYPING', payload: { roomId, isTyping: true } }));
                      clearTimeout(typingTimeout.current);
                      typingTimeout.current = setTimeout(() => {
                        ws.send(JSON.stringify({ type: 'CHAT_TYPING', payload: { roomId, isTyping: false } }));
                      }, 1500);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (chatInput.trim() && ws && connected && joined && roomId) {
                        ws.send(JSON.stringify({ type: 'CHAT_SEND', payload: { roomId, text: chatInput.trim() } }));
                        setChatInput('');
                        ws.send(JSON.stringify({ type: 'CHAT_TYPING', payload: { roomId, isTyping: false } }));
                      }
                    }
                  }}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  placeholder="Type a message..."
                />
                <button
                  onClick={() => {
                    if (!chatInput.trim() || !ws || !connected || !joined || !roomId) return;
                    ws.send(JSON.stringify({ type: 'CHAT_SEND', payload: { roomId, text: chatInput.trim() } }));
                    setChatInput('');
                    ws.send(JSON.stringify({ type: 'CHAT_TYPING', payload: { roomId, isTyping: false } }));
                  }}
                  className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm border border-blue-500 hover:bg-blue-500"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
