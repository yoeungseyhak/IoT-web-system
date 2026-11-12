import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { 
  Search, Clock, User, Zap, Loader2, Filter, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, 
  Car, AlertTriangle, Shield, Timer, KeyRound, ShieldAlert 
} from 'lucide-react';
import { getLogs } from '../api';
import { AuthContext } from '../App';

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'device-update', label: 'Device & Relay Updates' },
  { value: 'parking', label: 'Parking Bays & Sensors' },
  { value: 'automation', label: 'Automations & Timers' },
  { value: 'emergency', label: 'Emergency Events' },
  { value: 'login', label: 'User Logins' },
  { value: 'user', label: 'User & Access Management' }
];

export default function ActivityLog() {
  const { user } = useContext(AuthContext);
  const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');

  // Filter available actions based on user privilege level
  const actionOptions = ACTION_OPTIONS.filter(opt => isAdmin || opt.value !== 'user');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

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
    }
  }, [page, limit, debouncedSearch, selectedAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Real-time WebSocket listener: auto-refreshes log table when events occur
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (
        data.type === 'device-update' ||
        data.type === 'slot-update' ||
        data.type === 'emergency-alert' ||
        data.type === 'emergency-cleared' ||
        data.type === 'automation-update' ||
        data.type === 'devices-changed' ||
        data.type === 'slots-changed'
      ) {
        // If on first page with no search/action filters, fetch fresh logs from backend seamlessly
        if (page === 1 && !debouncedSearch && selectedAction === 'all') {
          fetchLogs(true);
        }
      }
    };
    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [page, debouncedSearch, selectedAction, fetchLogs]);

  // Visual categorization and icon selector for each log entry
  const getActionConfig = (log) => {
    const action = log.action || '';
    
    if (action === 'device-update') {
      const isGate = log.device_id?.includes('gate') || log.device_name?.toLowerCase().includes('gate');
      return {
        Icon: isGate ? ShieldAlert : Zap,
        iconBg: 'bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border border-cyan-500/20',
        badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25',
        badgeText: isGate ? 'GATE' : 'DEVICE'
      };
    }

    if (action.includes('slot') || action.includes('parking')) {
      const isOcc = log.details?.toLowerCase().includes('occupied');
      return {
        Icon: Car,
        iconBg: isOcc 
          ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20' 
          : 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20',
        badgeClass: isOcc 
          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' 
          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        badgeText: 'PARKING BAY'
      };
    }

    if (action.includes('emergency')) {
      return {
        Icon: AlertTriangle,
        iconBg: 'bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 animate-pulse',
        badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
        badgeText: 'EMERGENCY'
      };
    }

    if (action.includes('schedule') || action.includes('countdown') || action.includes('cycle') || action.includes('automation')) {
      return {
        Icon: Timer,
        iconBg: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20',
        badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
        badgeText: 'AUTOMATION'
      };
    }

    if (action === 'login' || action === 'logout') {
      return {
        Icon: KeyRound,
        iconBg: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20',
        badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
        badgeText: 'AUTH'
      };
    }

    if (action.startsWith('create-') || action.startsWith('delete-') || action.includes('user') || action.includes('control') || action.includes('password') || action.includes('role')) {
      const isDel = action.startsWith('delete-');
      return {
        Icon: Shield,
        iconBg: isDel 
          ? 'bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20' 
          : 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20',
        badgeClass: isDel 
          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25' 
          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
        badgeText: 'SECURITY'
      };
    }

    return {
      Icon: Clock,
      iconBg: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20',
      badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25',
      badgeText: 'EVENT'
    };
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return 'Just now';
    const now = Date.now();
    const past = new Date(dateStr).getTime();
    const diffSec = Math.max(0, Math.floor((now - past) / 1000));

    if (diffSec < 45) return 'Just now';
    if (diffSec < 90) return '1m ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatFullTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
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
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">System Activity Logs</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  {total.toLocaleString()} total
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Live operational timeline of devices, parking bays, automations & staff actions</p>
            </div>
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
              placeholder="Search by user, hardware, action, or details..."
              className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 transition-all"
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
              className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 transition-all appearance-none cursor-pointer"
            >
              {actionOptions.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
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
              className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 transition-all appearance-none cursor-pointer"
              title="Rows per page"
            >
              <option value={15} className="bg-white dark:bg-slate-900">15 / page</option>
              <option value={25} className="bg-white dark:bg-slate-900">25 / page</option>
              <option value={50} className="bg-white dark:bg-slate-900">50 / page</option>
              <option value={100} className="bg-white dark:bg-slate-900">100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log Entries Container */}
      <div className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/50 rounded-2xl p-2 sm:p-3 min-h-[300px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
            <span className="text-sm font-medium">Loading activity records...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="text-base font-medium text-slate-700 dark:text-slate-300">No activity logs found</p>
            <p className="text-xs text-slate-400 mt-1">
              {debouncedSearch || selectedAction !== 'all' ? 'Try adjusting your search query or action filter' : 'Physical triggers and system actions will stream here live'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, idx) => {
              const config = getActionConfig(log);
              return (
                <div
                  key={log.id || `${log.created_at}-${idx}`}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-white dark:bg-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 hover:border-cyan-500/40 dark:hover:border-cyan-500/40 rounded-xl transition-all duration-150 shadow-sm"
                >
                  {/* Left Column: Icon + Category Badge + Message */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${config.iconBg}`}>
                      <config.Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${config.badgeClass}`}>
                          {config.badgeText}
                        </span>

                        {log.device_name && (
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 font-mono">
                            <span className="text-cyan-500 dark:text-cyan-400">•</span>
                            {log.device_name}
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 break-words leading-relaxed">
                        {log.details || `${log.username} triggered ${log.action}`}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Actor Chip + Readable Time */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700/50">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-600/50">
                      <User className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      <span className="truncate max-w-[140px] font-semibold">{log.username || 'System'}</span>
                    </span>

                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 cursor-default"
                      title={formatFullTime(log.created_at)}
                    >
                      <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                      <span>{formatRelativeTime(log.created_at)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing <strong className="text-slate-800 dark:text-slate-200">{startEntry}</strong> to <strong className="text-slate-800 dark:text-slate-200">{endEntry}</strong> of <strong className="text-slate-800 dark:text-slate-200">{total.toLocaleString()}</strong> events
          </div>

          <div className="flex items-center gap-1">
            {/* First Page */}
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Prev Page */}
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page Indicator */}
            <span className="px-3 py-1 font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-lg">
              Page {page} of {totalPages}
            </span>

            {/* Next Page */}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Last Page */}
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
