import { useState } from 'react';
import { Bell, BellOff, X, Trash2, Lightbulb, Sparkles, Volume2, VolumeX } from 'lucide-react';

export default function NotificationCenter({ notifications, isOpen, onClose, onClear, soundEnabled, onToggleSound }) {
  if (!isOpen) return null;

  const getDeviceIcon = (deviceId) => {
    if (deviceId?.includes('light') && deviceId !== 'party-light') return '💡';
    if (deviceId === 'rolling-door') return '🚪';
    if (deviceId === 'boom-gate') return '🚧';
    if (deviceId === 'party-light') return '🎉';
    return '📱';
  };

  const getTimeAgo = (timestamp) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-slate-100">Notifications</h2>
            {notifications.length > 0 && (
              <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">{notifications.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-500 hover:bg-slate-800'}`}
              title={soundEnabled ? 'Mute notifications' : 'Enable notification sounds'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            {notifications.length > 0 && (
              <button
                onClick={onClear}
                className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 p-8">
              <BellOff className="w-12 h-12 opacity-50" />
              <p className="text-sm">No notifications yet</p>
              <p className="text-xs text-slate-600 text-center">
                Device changes will appear here in real-time
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {notifications.map((notif, idx) => (
                <div key={idx} className="px-5 py-3 hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{getDeviceIcon(notif.deviceId)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 leading-snug">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">{getTimeAgo(notif.timestamp)}</span>
                        {notif.triggeredBy && (
                          <>
                            <span className="text-xs text-slate-600">•</span>
                            <span className="text-xs text-slate-400">by {notif.triggeredBy}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
