import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import { getMe } from './api';
import { ThemeProvider } from './context/ThemeContext';

export const AuthContext = createContext();
export const WebSocketContext = createContext();

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div className="h-screen w-screen flex items-center justify-center text-cyan-500">Loading...</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // WebSocket state
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const backoffRef = useRef(1000);
  const intentionalClose = useRef(false);

  const updateUser = (newUser) => setUser(newUser);

  const login = (newUser, newToken) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    if (wsRef.current) {
      intentionalClose.current = true;
      wsRef.current.close();
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await getMe(token);
          setUser(userData);
        } catch (error) {
          console.error("Auth init failed", error);
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const connectWs = useCallback(() => {
    if (!token) return;

    // Prevent duplicate connection if socket is already open or connecting
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Clean up any previous socket before creating a new one
    if (wsRef.current) {
      const old = wsRef.current;
      wsRef.current = null;
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try { old.close(); } catch (e) {}
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?token=${token}`;
    
    const socket = new WebSocket(wsUrl);
    intentionalClose.current = false;
    
    socket.onopen = () => {
      console.log("WS connected");
      setIsConnected(true);
      backoffRef.current = 1000;
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'device-status' || data.type === 'esp32-status') {
          setDeviceOnline(data.online);
        }
        // Expose message via custom event to avoid deep prop drilling for real-time
        window.dispatchEvent(new CustomEvent('ws-message', { detail: data }));
      } catch (err) {
        console.error("WS parse error", err);
      }
    };
    
    socket.onclose = () => {
      console.log("WS disconnected");
      setIsConnected(false);
      setDeviceOnline(false);
      
      if (!intentionalClose.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 10000);
          connectWs();
        }, backoffRef.current);
      }
    };
    
    socket.onerror = (err) => {
      console.error("WS error", err);
      try { socket.close(); } catch (e) {}
    };

    wsRef.current = socket;
    setWs(socket);
  }, [token]);

  useEffect(() => {
    if (user && token) {
      connectWs();
    }
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        intentionalClose.current = true;
        const old = wsRef.current;
        wsRef.current = null;
        old.onopen = null;
        old.onmessage = null;
        old.onclose = null;
        old.onerror = null;
        try { old.close(); } catch (e) {}
      }
    };
  }, [user, token, connectWs]);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
        <WebSocketContext.Provider value={{ ws, isConnected, deviceOnline, esp32Online: deviceOnline, sendMessage }}>
          <BrowserRouter>
            <Toaster position="top-right" toastOptions={{
              style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' }
            }} />
            <Routes>
              <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
        </WebSocketContext.Provider>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}
