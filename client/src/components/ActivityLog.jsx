import { useState, useEffect } from 'react';
import { Search, Clock, User, Zap, Loader2 } from 'lucide-react';
import { getLogs } from '../api';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      const data = await getLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  // Listen for real-time updates
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (data.type === 'device-update') {
        const newLog = {
          id: Date.now(),
          username: data.triggeredBy || 'system',
          action: 'device-update',
          device_name: data.deviceId,
          details: JSON.stringify(data.state),
          created_at: new Date(data.timestamp).toISOString()
        };
        setLogs(prev => [newLog, ...prev].slice(0, 100));
      }
    };
    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, []);

  const filteredLogs = logs.filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (log.username || '').toLowerCase().includes(s) ||
      (log.action || '').toLowerCase().includes(s) ||
      (log.device_name || '').toLowerCase().includes(s) ||
      (log.details || '').toLowerCase().includes(s)
    );
  });

  const getActionColor = (action) => {
    if (action === 'login') return 'text-blue-400 bg-blue-500/10';
    if (action === 'device-update') return 'text-cyan-400 bg-cyan-500/10';
    if (action === 'create-user') return 'text-green-400 bg-green-500/10';
    if (action === 'delete-user') return 'text-red-400 bg-red-500/10';
    if (action?.includes('password')) return 'text-amber-400 bg-amber-500/10';
    return 'text-slate-400 bg-slate-500/10';
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-100">Activity Log</h2>
          <span className="text-xs text-slate-500">({filteredLogs.length} entries)</span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter logs..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500"
          />
        </div>
      </div>

      <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity logs found</p>
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div key={log.id || idx} className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 hover:border-slate-600 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider mt-0.5 flex-shrink-0 ${getActionColor(log.action)}`}>
                  {log.action?.replace(/-/g, ' ') || 'action'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {log.details || `${log.username} performed ${log.action}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.username || 'system'}
                    </span>
                    {log.device_name && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {log.device_name}
                      </span>
                    )}
                    <span>{formatTime(log.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
