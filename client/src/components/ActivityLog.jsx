import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Clock, User, Zap, Loader2, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from 'lucide-react';
import { getLogs } from '../api';

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'device-update', label: 'Device Updates' },
  { value: 'login', label: 'User Logins' },
  { value: 'create-user', label: 'User Created' },
  { value: 'delete-user', label: 'User Deleted' },
  { value: 'update-control', label: 'Permission Changed' },
  { value: 'change-password', label: 'Password Changed' },
  { value: 'emergency-alert', label: 'Emergency Alert' },
  { value: 'emergency-cleared', label: 'Emergency Cleared' }
];

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounced search term
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef(null);

  const handleSearchChange = (val) => {
    setSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1); // Reset to page 1 on new search
    }, 300);
  };

  const fetchLogs = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setIsRefreshing(true);

    try {
      const data = await getLogs({
        page,
        limit,
        search: debouncedSearch,
        action: selectedAction !== 'all' ? selectedAction : undefined
      });

      if (data && typeof data === 'object' && Array.isArray(data.logs)) {
        setLogs(data.logs);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else if (Array.isArray(data)) {
        // Fallback for unpaginated array response
        setLogs(data);
        setTotal(data.length);
        setTotalPages(Math.ceil(data.length / limit) || 1);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [page, limit, debouncedSearch, selectedAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Real-time WebSocket listener
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (data.type === 'device-update') {
        // If on first page with no search/action filters, prepend live log
        if (page === 1 && !debouncedSearch && selectedAction === 'all') {
          const newLog = {
            id: Date.now(),
            username: data.triggeredBy || 'system',
            action: 'device-update',
            device_name: data.deviceId,
            details: JSON.stringify(data.state),
            created_at: new Date(data.timestamp || Date.now()).toISOString()
          };
          setLogs(prev => [newLog, ...prev.slice(0, limit - 1)]);
          setTotal(prev => prev + 1);
        }
      }
    };
    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [page, limit, debouncedSearch, selectedAction]);

  const getActionColor = (action) => {
    if (action === 'login') return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    if (action === 'device-update') return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    if (action === 'create-user') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (action === 'delete-user') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (action?.includes('password') || action === 'update-control') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (action?.includes('emergency')) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return 'Just now';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const startEntry = total === 0 ? 0 : (page - 1) * limit + 1;
  const endEntry = Math.min(page * limit, total);

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">System Activity Logs</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {total.toLocaleString()} total
                </span>
              </div>
              <p className="text-xs text-slate-400">High-volume audit trail of device triggers, user actions & alerts</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => fetchLogs(true)}
              disabled={loading || isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-all disabled:opacity-50"
              title="Refresh logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search user, device, action or details..."
              className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
            />
          </div>

          {/* Action Filter */}
          <div className="sm:col-span-4 relative">
            <div className="absolute left-3 top-2.5 pointer-events-none text-slate-400">
              <Filter className="w-4 h-4" />
            </div>
            <select
              value={selectedAction}
              onChange={e => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none cursor-pointer"
            >
              {ACTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Limit selector */}
          <div className="sm:col-span-2">
            <select
              value={limit}
              onChange={e => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all appearance-none cursor-pointer"
              title="Rows per page"
            >
              <option value={15} className="bg-slate-900">15 / page</option>
              <option value={25} className="bg-slate-900">25 / page</option>
              <option value={50} className="bg-slate-900">50 / page</option>
              <option value={100} className="bg-slate-900">100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log Entries Container */}
      <div className="bg-slate-800/20 border border-slate-700/40 rounded-2xl p-2 sm:p-3 min-h-[300px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
            <span className="text-sm font-medium">Loading activity records...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-400" />
            <p className="text-base font-medium text-slate-300">No activity logs found</p>
            <p className="text-xs text-slate-500 mt-1">
              {debouncedSearch || selectedAction !== 'all' ? 'Try adjusting your search or action filter' : 'New activities will automatically appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log, idx) => (
              <div
                key={log.id || `${log.created_at}-${idx}`}
                className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 hover:border-slate-600 rounded-xl px-3.5 py-2.5 transition-all duration-150"
              >
                <div className="flex items-start gap-3">
                  <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mt-0.5 flex-shrink-0 border ${getActionColor(log.action)}`}>
                    {log.action?.replace(/-/g, ' ') || 'ACTION'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-slate-200 break-words font-medium">
                      {log.details || `${log.username} performed ${log.action}`}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 text-slate-300">
                        <User className="w-3 h-3 text-cyan-400" />
                        <span className="font-semibold">{log.username || 'system'}</span>
                      </span>

                      {log.device_name && (
                        <span className="flex items-center gap-1 font-mono text-cyan-400">
                          <Zap className="w-3 h-3" />
                          <span>{log.device_name}</span>
                        </span>
                      )}

                      <span className="text-slate-500">
                        {formatTime(log.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-2 text-xs text-slate-400">
          <div>
            Showing <strong className="text-slate-200">{startEntry}</strong> to <strong className="text-slate-200">{endEntry}</strong> of <strong className="text-slate-200">{total.toLocaleString()}</strong> entries
          </div>

          <div className="flex items-center gap-1">
            {/* First Page */}
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Prev Page */}
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page Indicator */}
            <span className="px-3 py-1 font-medium text-slate-200 bg-slate-900/60 border border-slate-700/60 rounded-lg">
              Page {page} of {totalPages}
            </span>

            {/* Next Page */}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Last Page */}
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
