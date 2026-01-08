import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMoon, FiSun } from 'react-icons/fi';
import Toolbar from '../components/Toolbar.jsx';
import { nanoid } from '../utils/nanoid.js';

const API_BASE = import.meta.env.VITE_API_BASE;
const WS_URL = import.meta.env.VITE_WS_URL;
const TEXT_FONT_FAMILY = "'Baloo Bhai 2', 'Baloo Bhai', cursive";

export default function CanvasPage({ initialRoomId = '', initialToken = '', onBack = () => {}, onExitedRoom = () => {}, theme = 'dark', onToggleTheme = () => {} }) {
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
  const [hoverMove, setHoverMove] = useState(false);
  const dragOffset = useRef(null);
  const dragSnapshot = useRef(null);
  const resizeSnapshot = useRef(null);
  const hoverTargetRef = useRef(null);
  const activeTransformId = useRef(null);
  const [transformPreview, setTransformPreview] = useState(null);
  const lastHitRef = useRef({ key: '', index: 0 });
  const [role, setRole] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const typingTimeout = useRef(null);
  const userNames = useRef({});
  const messagesRef = useRef(null);
  const pendingAdds = useRef(new Map());
  const pendingAddsByElement = useRef(new Map());
  const pendingUpdates = useRef(new Map());
  const persistedIds = useRef(new Set());
  const isLight = theme === 'light';
  const [textEditor, setTextEditor] = useState(null);
  const textInputRef = useRef(null);
  const textEditorRef = useRef(null);
  const [caretVisible, setCaretVisible] = useState(true);
  const lastTextLiveAt = useRef(0);
  const textSaveTimer = useRef(null);
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
      localStorage.setItem('lastPage', 'canvas');
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
  const sendWs = useCallback(
    (message) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(message));
      return true;
    },
    [ws]
  );

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
      const serverIds = new Set(mapped.map((el) => el.elementId));
      const activeTextEditor = textEditorRef.current;
      setElements((prev) => {
        const keep = prev.filter(
          (el) =>
            (activeTextEditor && el.elementId === activeTextEditor.elementId) ||
            pendingAddsByElement.current.has(el.elementId) ||
            pendingUpdates.current.has(el.elementId)
        );
        const dedupedKeep = keep.filter((el) => !serverIds.has(el.elementId));
        return [...mapped, ...dedupedKeep];
      });
      persistedIds.current = serverIds;
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

  useEffect(() => {
    if (textEditor && textInputRef.current) {
      setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus();
        }
      }, 0);
    }
  }, [textEditor]);

  useEffect(() => {
    textEditorRef.current = textEditor;
  }, [textEditor]);

  useEffect(() => {
    if (!textEditor) return;
    const id = setInterval(() => {
      setCaretVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(id);
  }, [textEditor]);

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
      sendWs({ type: 'ROOM_JOIN', payload: { roomId } });
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
            if (msg.payload?.code === 'NOT_JOINED') {
              setJoined(false);
              setJoining(true);
              sendWs({ type: 'ROOM_JOIN', payload: { roomId } });
            } else if (msg.payload?.code === 'ACCESS_DENIED' || msg.payload?.code === 'UNAUTHORIZED') {
              setJoined(false);
              setJoining(false);
            }
            if (msg.requestId && pendingAdds.current.has(msg.requestId)) {
              const elementId = pendingAdds.current.get(msg.requestId);
              pendingAdds.current.delete(msg.requestId);
              pendingAddsByElement.current.delete(elementId);
              pendingUpdates.current.delete(elementId);
              setElements((prev) => prev.filter((el) => el.elementId !== elementId));
            }
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
            persistedIds.current.add(msg.payload.element.elementId);
            pendingAdds.current.forEach((value, key) => {
              if (value === msg.payload.element.elementId) {
                pendingAdds.current.delete(key);
              }
            });
            pendingAddsByElement.current.delete(msg.payload.element.elementId);
            if (pendingUpdates.current.has(msg.payload.element.elementId)) {
              const latest = pendingUpdates.current.get(msg.payload.element.elementId);
              pendingUpdates.current.delete(msg.payload.element.elementId);
              sendWs({
                type: 'BOARD_ELEMENT_UPDATE',
                payload: { roomId, elementId: latest.elementId, patch: latest.data },
              });
            }
            break;
          case 'BOARD_ELEMENT_UPDATED':
            setStatus('');
            if (activeTransformId.current === msg.payload.elementId) {
              break;
            }
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
          case 'BOARD_ELEMENT_RESTORED':
            setStatus('');
            if (msg.payload?.element?.elementId) {
              setElements((prev) => [...prev.filter((el) => el.elementId !== msg.payload.element.elementId), msg.payload.element]);
              setLiveElements((prev) => {
                const next = { ...prev };
                delete next[msg.payload.element.elementId];
                return next;
              });
              persistedIds.current.add(msg.payload.element.elementId);
            }
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
  }, [elements, liveElements, currentEl, selectedId, eraseTargets, blockedErase, transformPreview, color, caretVisible]);

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
      const renderEl = transformPreview && transformPreview.elementId === el.elementId ? transformPreview : el;
      drawElement(ctx, renderEl, false, dimIds.has(el.elementId), blockedIds.has(el.elementId));
    });
    Object.values(liveElements)
      .filter((el) => el.userId !== myId) // only render live overlays from others
      .forEach((el) => drawElement(ctx, el));
    if (currentEl) drawElement(ctx, currentEl, true);
    if (textEditor) {
      drawTextCaret(ctx, textEditor);
    }
    if (selectedId) {
      const sel = transformPreview && transformPreview.elementId === selectedId ? transformPreview : elements.find((e) => e.elementId === selectedId);
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
        const fontSize = data.fontSize || 18;
        ctx.fillStyle = blocked ? '#b91c1c' : data.color || '#fff';
        ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
        const lines = String(data.text || '').split('\n');
        const lineHeight = Math.round(fontSize * 1.2);
        lines.forEach((line, idx) => {
          ctx.fillText(line, data.startX, data.startY + idx * lineHeight);
        });
        break;
      }
      default:
        break;
    }
    ctx.globalAlpha = 1;
  };

  const drawTextCaret = (ctx, editor) => {
    if (!caretVisible) return;
    const fontSize = editor.fontSize || 18;
    ctx.save();
    ctx.fillStyle = isLight ? '#111827' : '#f9fafb';
    ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
    const lines = String(editor.value || '').split('\n');
    const lineHeight = Math.round(fontSize * 1.2);
    const caretIndex = editor.caretIndex ?? editor.value?.length ?? 0;
    let remaining = caretIndex;
    let lineIndex = 0;
    let col = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (remaining <= line.length) {
        lineIndex = i;
        col = remaining;
        break;
      }
      remaining -= line.length + 1;
    }
    const lineText = lines[lineIndex] || '';
    const measure = ctx.measureText(lineText.slice(0, col));
    const x = editor.worldX + measure.width;
    const y = editor.worldY + lineIndex * lineHeight;
    ctx.fillRect(x, y - fontSize + 4, 1.5, fontSize);
    ctx.restore();
  };

  const startDrawing = (e) => {
    if (!canvasRef.current) return;
    if (e.pointerId !== undefined) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (!connected || !ws || !roomId || !token) {
      setStatus('Join room first');
      return;
    }
    if (!joined) {
      setJoining(true);
      setStatus('Joining room...');
      sendWs({ type: 'ROOM_JOIN', payload: { roomId } });
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
        activeTransformId.current = currentSelected?.elementId || null;
        return;
      }

      const hits = hitTestAll(world.x, world.y, elements);
      if (hits.length) {
        const key = `${Math.round(world.x)}:${Math.round(world.y)}`;
        const hoverTarget = hoverTargetRef.current;
        let hit = hoverTarget ? hits.find((el) => el.elementId === hoverTarget.elementId) : null;
        if (!hit) {
          let idx = 0;
          if (lastHitRef.current.key === key) {
            idx = (lastHitRef.current.index + 1) % hits.length;
          }
          hit = hits[idx];
          lastHitRef.current = { key, index: idx };
        }
        setSelectedId(hit.elementId);
        dragOffset.current = { dx: world.x - hit.data.startX, dy: world.y - hit.data.startY };
        dragSnapshot.current = JSON.parse(JSON.stringify(hit));
        activeTransformId.current = hit.elementId;
        setResizingHandle(null);
        return;
      }

      if (currentSelected && isInsideBBox(world.x, world.y, currentSelected, 8 / scale.current)) {
        // keep selection; start drag
        dragOffset.current = { dx: world.x - currentSelected.data.startX, dy: world.y - currentSelected.data.startY };
        dragSnapshot.current = JSON.parse(JSON.stringify(currentSelected));
        activeTransformId.current = currentSelected.elementId;
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
      const id = nanoid();
      const el = {
        elementId: id,
        type: 'text',
        data: {
          startX: world.x,
          startY: world.y,
          text: '',
          color,
          fontSize: 18,
          strokeWidth,
        },
      };
      setElements((prev) => [...prev, el]);
      setTextEditor({
        x,
        y,
        worldX: world.x,
        worldY: world.y,
        value: '',
        elementId: id,
        caretIndex: 0,
        color,
        fontSize: 18,
        strokeWidth,
      });
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

  const handleDoubleClick = (e) => {
    if (!canvasRef.current) return;
    if (!roomId) {
      setStatus('Join room first');
      return;
    }
    if (!joined) {
      setJoining(true);
      setStatus('Joining room...');
      sendWs({ type: 'ROOM_JOIN', payload: { roomId } });
      return;
    }
    e.preventDefault();
    textInputRef.current?.blur();
    setActiveTool('text');
    setSelectedId(null);
    setResizingHandle(null);
    dragOffset.current = null;
    dragSnapshot.current = null;
    setCurrentEl(null);
    activeTransformId.current = null;
    setTransformPreview(null);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = screenToWorld(x, y);
    const id = nanoid();
    const el = {
      elementId: id,
      type: 'text',
      data: {
        startX: world.x,
        startY: world.y,
        text: '',
        color,
        fontSize: 18,
        strokeWidth,
      },
    };
    setElements((prev) => [...prev, el]);
    setTextEditor({
      x,
      y,
      worldX: world.x,
      worldY: world.y,
      value: '',
      elementId: id,
      caretIndex: 0,
      color,
      fontSize: 18,
      strokeWidth,
    });
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
      const updated = resizeElement(resizeSnapshot.current.original, resizeSnapshot.current.original, resizingHandle, world);
      sendLiveElement(updated);
      setTransformPreview(updated);
      return;
    }

    if (activeTool === 'select' && selectedId && dragOffset.current) {
      const snap = dragSnapshot.current;
      if (!snap) return;
      const dx = world.x - dragOffset.current.dx - snap.data.startX;
      const dy = world.y - dragOffset.current.dy - snap.data.startY;
      const updated = shiftElement(snap, dx, dy);
      sendLiveElement(updated);
      setTransformPreview(updated);
      return;
    }

    // Hover cursor for handles
    if (activeTool === 'select' && !currentEl && !resizingHandle && !dragOffset.current) {
      const selected = selectedId ? elements.find((el) => el.elementId === selectedId) : null;
      const handle = selected ? hitResizeHandle(world.x, world.y, selected, scale.current) : null;
      setHoverHandle(handle);
      if (handle) {
        setHoverMove(false);
        hoverTargetRef.current = null;
      } else {
        const hits = hitTestAll(world.x, world.y, elements);
        if (hits.length) {
          const borderHits = hits
            .map((el) => ({ el, dist: hitBorder(world.x, world.y, el, scale.current) ? borderDistance(world.x, world.y, el) : null }))
            .filter((item) => item.dist !== null);
          if (borderHits.length) {
            borderHits.sort((a, b) => a.dist - b.dist);
            hoverTargetRef.current = borderHits[0].el;
            setHoverMove(true);
          } else {
            hoverTargetRef.current = null;
            setHoverMove(false);
          }
        } else {
          hoverTargetRef.current = null;
          setHoverMove(false);
        }
      }
    } else {
      setHoverHandle(null);
      setHoverMove(false);
      hoverTargetRef.current = null;
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
      const moved = transformPreview || elements.find((el) => el.elementId === selectedId);
      if (moved) {
        setElements((prev) => prev.map((el) => (el.elementId === moved.elementId ? { ...el, data: moved.data } : el)));
      }
      if (moved) {
        sendWs({
          type: 'BOARD_ELEMENT_UPDATE',
          payload: { roomId, elementId: moved.elementId, patch: moved.data },
        });
      }
      setLiveElements((prev) => {
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
      resizeSnapshot.current = null;
      setResizingHandle(null);
      activeTransformId.current = null;
      setTransformPreview(null);
      return;
    }

    if (activeTool === 'select' && selectedId && dragOffset.current) {
      const moved = transformPreview || elements.find((el) => el.elementId === selectedId);
      if (moved) {
        setElements((prev) => prev.map((el) => (el.elementId === moved.elementId ? { ...el, data: moved.data } : el)));
      }
      if (moved) {
        sendWs({
          type: 'BOARD_ELEMENT_UPDATE',
          payload: { roomId, elementId: moved.elementId, patch: moved.data },
        });
      }
      setLiveElements((prev) => {
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
      dragOffset.current = null;
      dragSnapshot.current = null;
      activeTransformId.current = null;
      setTransformPreview(null);
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
        ids.forEach((id) => {
          sendWs({ type: 'BOARD_ELEMENT_DELETE', payload: { roomId, elementId: id } });
        });
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

  const handlePointerUp = (e) => {
    if (e.pointerId !== undefined) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    endDrawing();
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

  const pinchState = useRef({ active: false, dist: 0, center: { x: 0, y: 0 } });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const getTouchPoints = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return Array.from(e.touches).map((t) => ({
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const [p1, p2] = getTouchPoints(e);
      pinchState.current.active = true;
      pinchState.current.dist = distance(p1, p2);
      pinchState.current.center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchState.current.active) {
      e.preventDefault();
      const [p1, p2] = getTouchPoints(e);
      const newDist = distance(p1, p2);
      const zoom = newDist / (pinchState.current.dist || newDist);
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const worldBefore = screenToWorld(center.x, center.y);
      scale.current = Math.max(0.3, Math.min(4, scale.current * zoom));
      const worldAfter = screenToWorld(center.x, center.y);
      pan.current.x += (worldAfter.x - worldBefore.x) * scale.current;
      pan.current.y += (worldAfter.y - worldBefore.y) * scale.current;
      pinchState.current.dist = newDist;
      pinchState.current.center = center;
      drawAll(canvasRef.current.getContext('2d'));
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      pinchState.current.active = false;
    }
  };

  const commitElement = (el) => {
    setRedoStack([]);
    if (!joined) {
      setElements((prev) => {
        if (prev.find((e) => e.elementId === el.elementId)) return prev;
        return [...prev, el];
      });
      pendingUpdates.current.set(el.elementId, el);
      return;
    }
    if (persistedIds.current.has(el.elementId)) {
      if (!sendWs({ type: 'BOARD_ELEMENT_UPDATE', payload: { roomId, elementId: el.elementId, patch: el.data } })) {
        setStatus('Not connected to room');
      }
      return;
    }
    if (pendingAddsByElement.current.has(el.elementId)) {
      pendingUpdates.current.set(el.elementId, el);
      return;
    }
    setElements((prev) => {
      if (prev.find((e) => e.elementId === el.elementId)) return prev;
      return [...prev, el];
    });
    if (ws && connected) {
      const requestId = nanoid();
      pendingAdds.current.set(requestId, el.elementId);
      pendingAddsByElement.current.set(el.elementId, requestId);
      sendWs({
        type: 'BOARD_ELEMENT_ADD',
        payload: { roomId, element: el },
        requestId,
      });
    } else {
      setStatus('Not connected to room');
      setElements((prev) => prev.filter((e) => e.elementId !== el.elementId));
    }
  };

  const flushPendingCommits = useCallback(() => {
    if (!joined || !roomId) return;
    const entries = Array.from(pendingUpdates.current.values());
    if (!entries.length) return;
    pendingUpdates.current.clear();
    entries.forEach((el) => {
      if (persistedIds.current.has(el.elementId)) {
        sendWs({ type: 'BOARD_ELEMENT_UPDATE', payload: { roomId, elementId: el.elementId, patch: el.data } });
        return;
      }
      const requestId = nanoid();
      pendingAdds.current.set(requestId, el.elementId);
      pendingAddsByElement.current.set(el.elementId, requestId);
      sendWs({
        type: 'BOARD_ELEMENT_ADD',
        payload: { roomId, element: el },
        requestId,
      });
    });
  }, [joined, roomId, sendWs]);

  const sendLiveElement = useCallback(
    (el) => {
      if (!joined) return;
      const ownerId = el.userId || currentUser?.id || currentUser?._id || '';
      const payload = {
        elementId: el.elementId,
        type: el.type,
        data: el.data,
      };
      if (!sendWs({ type: 'BOARD_ELEMENT_LIVE', payload: { roomId, element: payload } })) return;
      setLiveElements((prev) => ({
        ...prev,
        [el.elementId]: {
          ...el,
          userId: ownerId,
        },
      }));
    },
    [sendWs, joined, roomId, currentUser]
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
    sendWs({ type: 'BOARD_ELEMENT_DELETE', payload: { roomId, elementId: mine.elementId } });
  }, [elements, sendWs, roomId, currentUser]);

  const handleRedo = useCallback(() => {
    const uid = currentUser?.id || currentUser?._id;
    if (!uid || !redoStack.length) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    if (!isMine(last)) return;
    setElements((prev) => [...prev, last]);
    sendWs({ type: 'BOARD_ELEMENT_RESTORE', payload: { roomId, elementId: last.elementId, element: last } });
  }, [redoStack, sendWs, roomId, currentUser, isMine]);

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

  useEffect(() => {
    if (joined) {
      flushPendingCommits();
    }
  }, [joined, flushPendingCommits]);

  // Helpers
  const measureTextWidth = (text, fontSize) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return text.length * fontSize * 0.6;
    ctx.save();
    ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  };

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
    if (el.type === 'text') {
      const fontSize = data.fontSize || 18;
      const lines = String(data.text || '').split('\n');
      const lineHeight = Math.round(fontSize * 1.2);
      const width = lines.reduce((max, line) => Math.max(max, measureTextWidth(line, fontSize)), 0);
      minX = data.startX;
      maxX = data.startX + width;
      minY = data.startY - fontSize;
      maxY = data.startY + (lines.length - 1) * lineHeight;
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
          const fontSize = data.fontSize || 18;
          const lines = String(data.text || '').split('\n');
          const lineHeight = Math.round(fontSize * 1.2);
          const width = lines.reduce((max, line) => Math.max(max, measureTextWidth(line, fontSize)), 0);
          const height = fontSize + (lines.length - 1) * lineHeight;
          if (x >= data.startX && x <= data.startX + width && y <= data.startY + (lines.length - 1) * lineHeight && y >= data.startY - fontSize) return el;
          break;
        }
        default:
          break;
      }
    }
    return null;
  };

  const hitTestAll = (x, y, list) => {
    const hits = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      if (hitTest(x, y, [el])) {
        hits.push(el);
      }
    }
    return hits;
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
      { x: minX - 4, y: minY - 4, key: 'tl' },
      { x: maxX + 4, y: minY - 4, key: 'tr' },
      { x: maxX + 4, y: maxY + 4, key: 'br' },
      { x: minX - 4, y: maxY + 4, key: 'bl' },
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
      { key: 'tl', x: minX - 4, y: minY - 4 },
      { key: 'tr', x: maxX + 4, y: minY - 4 },
      { key: 'br', x: maxX + 4, y: maxY + 4 },
      { key: 'bl', x: minX - 4, y: maxY + 4 },
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
    if (activeTool === 'select' && hoverMove) return 'move';
    if (activeTool === 'pan') return lastPos.current ? 'grabbing' : 'grab';
    if (activeTool === 'select') return 'default';
    if (activeTool === 'text') return 'text';
    if (activeTool === 'erase') return 'cell';
    return 'crosshair';
  };

  const hitBorder = (x, y, el, scaleVal) => {
    const tol = 6 / scaleVal;
    const { data, type } = el;
    if (!data) return false;
    switch (type) {
      case 'rectangle': {
        const minX = Math.min(data.startX, data.endX);
        const maxX = Math.max(data.startX, data.endX);
        const minY = Math.min(data.startY, data.endY);
        const maxY = Math.max(data.startY, data.endY);
        const onLeft = Math.abs(x - minX) <= tol && y >= minY - tol && y <= maxY + tol;
        const onRight = Math.abs(x - maxX) <= tol && y >= minY - tol && y <= maxY + tol;
        const onTop = Math.abs(y - minY) <= tol && x >= minX - tol && x <= maxX + tol;
        const onBottom = Math.abs(y - maxY) <= tol && x >= minX - tol && x <= maxX + tol;
        return onLeft || onRight || onTop || onBottom;
      }
      case 'ellipse': {
        const cx = (data.startX + data.endX) / 2;
        const cy = (data.startY + data.endY) / 2;
        const rx = Math.abs(data.endX - data.startX) / 2;
        const ry = Math.abs(data.endY - data.startY) / 2;
        if (!rx || !ry) return false;
        const norm = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
        return Math.abs(norm - 1) <= tol / Math.max(rx, ry);
      }
      case 'line':
      case 'arrow':
      case 'freehand': {
        return hitTest(x, y, [el]) !== null;
      }
      case 'text': {
        return hitTest(x, y, [el]) !== null;
      }
      default:
        return false;
    }
  };

  const borderDistance = (x, y, el) => {
    const { data, type } = el;
    if (!data) return Infinity;
    switch (type) {
      case 'rectangle': {
        const minX = Math.min(data.startX, data.endX);
        const maxX = Math.max(data.startX, data.endX);
        const minY = Math.min(data.startY, data.endY);
        const maxY = Math.max(data.startY, data.endY);
        const dx = Math.min(Math.abs(x - minX), Math.abs(x - maxX));
        const dy = Math.min(Math.abs(y - minY), Math.abs(y - maxY));
        return Math.min(dx, dy);
      }
      case 'ellipse': {
        const cx = (data.startX + data.endX) / 2;
        const cy = (data.startY + data.endY) / 2;
        const rx = Math.abs(data.endX - data.startX) / 2;
        const ry = Math.abs(data.endY - data.startY) / 2;
        if (!rx || !ry) return Infinity;
        const norm = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
        return Math.abs(norm - 1) * Math.max(rx, ry);
      }
      case 'line':
      case 'arrow': {
        return pointLineDistance({ x, y }, { x: data.startX, y: data.startY }, { x: data.endX, y: data.endY });
      }
      case 'freehand': {
        const pts = data.points || [];
        let best = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          best = Math.min(best, pointLineDistance({ x, y }, pts[i], pts[i + 1]));
        }
        return best;
      }
      case 'text': {
        const fontSize = data.fontSize || 18;
        const lines = String(data.text || '').split('\n');
        const lineHeight = Math.round(fontSize * 1.2);
        const width = lines.reduce((max, line) => Math.max(max, measureTextWidth(line, fontSize)), 0);
        const left = data.startX;
        const right = data.startX + width;
        const top = data.startY - fontSize;
        const bottom = data.startY + (lines.length - 1) * lineHeight;
        const dx = Math.min(Math.abs(x - left), Math.abs(x - right));
        const dy = Math.min(Math.abs(y - top), Math.abs(y - bottom));
        return Math.min(dx, dy);
      }
      default:
        return Infinity;
    }
  };

  return (
    <div className={`safe-screen safe-bottom h-full w-full overflow-hidden ${isLight ? 'bg-white' : 'bg-black'}`}>
      <div className="relative w-full h-full">
        <div className="absolute left-4 top-4 z-30 flex items-start pointer-events-none">
          <button
            onClick={onBack}
            className={`flex items-center justify-center w-10 h-10 rounded-full border shadow pointer-events-auto ${
              isLight ? 'bg-white/90 border-slate-200 text-slate-900 hover:border-slate-300' : 'bg-black/90 border-slate-800 text-slate-200 hover:border-slate-700'
            }`}
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
            onClick={onToggleTheme}
            className={`ml-2 px-3 py-2 rounded-lg border shadow flex items-center justify-center ${
              isLight ? 'bg-white/90 border-slate-200 text-slate-900 hover:border-slate-300' : 'bg-black/90 border-slate-800 text-slate-200 hover:border-slate-700'
            }`}
          >
            {isLight ? <FiMoon size={18} /> : <FiSun size={18} />}
          </button>
          <button
            onClick={() => setShowChat((s) => !s)}
            className={`ml-2 px-3 py-2 rounded-lg border shadow ${
              isLight ? 'bg-white/90 border-slate-200 text-slate-900 hover:border-slate-300' : 'bg-black/90 border-slate-800 text-slate-200 hover:border-slate-700'
            }`}
          >
            💬
          </button>
        </div>

        <div
          className={`absolute z-10 rounded-2xl p-2 shadow-xl backdrop-blur pointer-events-auto border sm:hidden ${
            isLight ? 'bg-white/90 border-slate-200' : 'bg-black/90 border-slate-800'
          } left-3 right-3`}
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          <div className="toolbar-scroll">
            <Toolbar
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              color={color}
              setColor={setColor}
              strokeWidth={strokeWidth}
              setStrokeWidth={setStrokeWidth}
              direction="horizontal"
              theme={theme}
              compact
            />
          </div>
        </div>
        <div
          className={`absolute z-10 rounded-xl p-2 shadow-xl backdrop-blur pointer-events-auto border hidden sm:block ${
            isLight ? 'bg-white/80 border-slate-200' : 'bg-black/80 border-slate-800'
          } left-4 top-1/2 -translate-y-1/2`}
        >
          <Toolbar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            direction="vertical"
            theme={theme}
          />
        </div>

        <canvas
          ref={canvasRef}
          className={`w-full h-full ${isLight ? 'bg-white' : 'bg-black'}`}
          onMouseDown={startDrawing}
          onMouseMove={moveDrawing}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onDoubleClick={handleDoubleClick}
          onPointerDown={startDrawing}
          onPointerMove={moveDrawing}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{
            touchAction: 'none',
            cursor: getCursor(),
          }}
        />
        {textEditor && (
          <textarea
            ref={textInputRef}
            value={textEditor.value}
            onChange={(e) => {
              const value = e.target.value;
              setTextEditor((prev) => ({
                ...prev,
                value,
                caretIndex: e.target.selectionStart ?? value.length,
              }));
              if (textEditor.elementId) {
                const updated = {
                  elementId: textEditor.elementId,
                  type: 'text',
                  data: {
                    startX: textEditor.worldX,
                    startY: textEditor.worldY,
                    text: value,
                    color: textEditor.color || color,
                    fontSize: textEditor.fontSize || 18,
                    strokeWidth: textEditor.strokeWidth || strokeWidth,
                  },
                };
                setElements((prev) =>
                  prev.map((el) => (el.elementId === textEditor.elementId ? { ...el, data: { ...el.data, text: value } } : el))
                );
                const now = Date.now();
                if (now - lastTextLiveAt.current > 80) {
                  lastTextLiveAt.current = now;
                  sendLiveElement(updated);
                }
                clearTimeout(textSaveTimer.current);
                textSaveTimer.current = setTimeout(() => {
                  const trimmed = (value || '').trim();
                  if (!trimmed) return;
                  commitElement(updated);
                }, 1000);
              }
            }}
            onSelect={(e) => {
              const caretIndex = e.target.selectionStart ?? 0;
              setTextEditor((prev) => ({ ...prev, caretIndex }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                if (textEditor.elementId) {
                  setElements((prev) => prev.filter((el) => el.elementId !== textEditor.elementId));
                }
                setTextEditor(null);
              }
            }}
            onBlur={() => {
              clearTimeout(textSaveTimer.current);
              const value = (textEditor.value || '').trim();
              if (textEditor.elementId) {
                if (value) {
                  commitElement({
                    elementId: textEditor.elementId,
                    type: 'text',
                    data: {
                      startX: textEditor.worldX,
                      startY: textEditor.worldY,
                      text: textEditor.value,
                      color: textEditor.color || color,
                      fontSize: textEditor.fontSize || 18,
                      strokeWidth: textEditor.strokeWidth || strokeWidth,
                    },
                  });
                } else {
                  setElements((prev) => prev.filter((el) => el.elementId !== textEditor.elementId));
                }
              }
              setTextEditor(null);
            }}
            className="absolute -left-[9999px] -top-[9999px] w-px h-px opacity-0"
          />
        )}
        {status && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-900/80 border border-rose-700 text-rose-100 px-4 py-2 rounded shadow">
            {status}
          </div>
        )}
        {(!roomId || !token) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`px-4 py-2 rounded border text-sm ${isLight ? 'bg-white/80 border-slate-200 text-slate-700' : 'bg-black/80 border-slate-700 text-slate-300'}`}>
              Awaiting room and token (provide via props or query params roomId/token).
            </div>
          </div>
        )}

        {showChat && (
          <div className={`absolute top-0 right-0 h-full w-full sm:w-80 border-l shadow-2xl z-30 flex flex-col ${isLight ? 'bg-white/95 border-slate-200' : 'bg-black/95 border-slate-800'}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Chat</div>
              <button
                onClick={() => setShowChat(false)}
                className={`${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-300 hover:text-white'} text-lg leading-none`}
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
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        mine
                          ? isLight
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-600 text-white'
                          : isLight
                          ? 'bg-white text-slate-900 border border-slate-200'
                          : 'bg-slate-800 text-slate-100 border border-slate-700'
                      }`}
                      style={{ wordBreak: 'break-word' }}
                    >
                      {!mine && <div className={`text-xs mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{name}</div>}
                      <div>{m.text}</div>
                      <div className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`px-3 py-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'} sticky bottom-0 ${isLight ? 'bg-white/95' : 'bg-black/95'}`}>
              {typingUsers.length > 0 && (
                <div className={`text-xs mb-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
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
                    if (joined && roomId) {
                      sendWs({ type: 'CHAT_TYPING', payload: { roomId, isTyping: true } });
                      clearTimeout(typingTimeout.current);
                      typingTimeout.current = setTimeout(() => {
                        sendWs({ type: 'CHAT_TYPING', payload: { roomId, isTyping: false } });
                      }, 1500);
                    }
                  }}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (chatInput.trim() && joined && roomId) {
                          sendWs({ type: 'CHAT_SEND', payload: { roomId, text: chatInput.trim() } });
                          setChatInput('');
                          sendWs({ type: 'CHAT_TYPING', payload: { roomId, isTyping: false } });
                        }
                      }
                    }}
                  className={`flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${
                    isLight ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-800 text-slate-100 border-slate-700'
                  }`}
                  placeholder="Type a message..."
                />
                <button
                  onClick={() => {
                    if (!chatInput.trim() || !joined || !roomId) return;
                    sendWs({ type: 'CHAT_SEND', payload: { roomId, text: chatInput.trim() } });
                    setChatInput('');
                    sendWs({ type: 'CHAT_TYPING', payload: { roomId, isTyping: false } });
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
