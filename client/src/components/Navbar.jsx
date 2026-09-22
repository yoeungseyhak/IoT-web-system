import { useState, useEffect, useContext } from 'react';
import { Building2, Wifi, Bell, ChevronDown, LogOut, KeyRound, Clock, Menu, X, Sun, Moon, MessageSquareWarning } from 'lucide-react';
import { AuthContext, WebSocketContext } from '../App';
import { useTheme } from '../context/ThemeContext';

export default function Navbar({ notifications = [], onBellClick, onChangePassword, onReportIssue }) {
  const { user, logout } = useContext(AuthContext);
  const { deviceOnline, esp32Online } = useContext(WebSocketContext);
  const isOnline = deviceOnline ?? esp32Online;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-slate-900 rounded-full flex items-center justify-center">
              <Wifi className="w-2.5 h-2.5 text-cyan-400" />
            </div>
          </div>
          <span className="text-xl font-bold tracking-wider text-cyan-400 hidden sm:block">FLOOR MGMT</span>
        </div>

        {/* Center: Time (desktop) */}
        <div className="hidden md:flex items-center gap-2 text-slate-400 text-sm">
          <Clock className="w-4 h-4" />
          <span className="font-mono">
            {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' '}
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Right: Status + Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Device Status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            isOnline 
              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'
            }`} />
            <span className="hidden sm:inline">Device {isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400 hover:text-amber-300 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon className="w-5 h-5 text-indigo-600 hover:text-indigo-700 transition-transform duration-300 hover:-rotate-12" />
            )}
          </button>

          {/* Report Issue */}
          <button onClick={onReportIssue} className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-all" title="Report an issue">
            <MessageSquareWarning className="w-5 h-5" />
          </button>

          {/* Notification Bell */}
          <button
            onClick={onBellClick}
            className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all duration-200"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-300 hover:bg-slate-800 transition-all duration-200"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:block text-sm font-medium">{user?.username}</span>
              {user?.role === 'admin' && (
                <span className="hidden sm:inline text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-medium">Admin</span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-sm font-medium text-slate-200">{user?.username}</p>
                    <p className="text-xs text-slate-400 capitalize">{user?.role} account</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setDropdownOpen(false); onChangePassword(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                      Change Password
                    </button>
                    <button
                      onClick={() => { setDropdownOpen(false); logout(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
