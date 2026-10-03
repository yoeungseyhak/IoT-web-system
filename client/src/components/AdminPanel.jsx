import { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { 
  Users, UserPlus, Trash2, KeyRound, Shield, User, X, Loader2, 
  ToggleLeft, ToggleRight, FileWarning, CheckCircle2, Search, Filter, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, AlertCircle
} from 'lucide-react';
import { AuthContext } from '../App';
import { 
  getUsers, createUser, deleteUser, changeUserPassword, toggleUserControl, 
  getReports, updateReportStatus, deleteReport 
} from '../api';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const { user: currentUser } = useContext(AuthContext);

  // Active Block / Blog: 'users' | 'reports'
  const [activeBlock, setActiveBlock] = useState('users');

  // --- Users State ---
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(10);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRole, setUsersRole] = useState('all');
  const [usersControlFilter, setUsersControlFilter] = useState('all'); // 'all' | 'enabled' | 'readonly'

  // --- Reports State ---
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsLimit, setReportsLimit] = useState(10);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [reportsSearch, setReportsSearch] = useState('');
  const [reportsStatus, setReportsStatus] = useState('all');
  const [reportsCategory, setReportsCategory] = useState('all');

  // Counts for status pills
  const [pendingCount, setPendingCount] = useState(0);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);

  // Search debounce timers
  const usersSearchTimeout = useRef(null);
  const reportsSearchTimeout = useRef(null);

  // --- Fetch Users ---
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await getUsers({
        page: usersPage,
        limit: usersLimit,
        search: usersSearch,
        role: usersRole !== 'all' ? usersRole : undefined
      });

      if (data && typeof data === 'object' && Array.isArray(data.users)) {
        setUsers(data.users);
        setUsersTotal(data.total || 0);
        setUsersTotalPages(data.totalPages || 1);
      } else if (Array.isArray(data)) {
        setUsers(data);
        setUsersTotal(data.length);
        setUsersTotalPages(Math.ceil(data.length / usersLimit) || 1);
      }
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, usersLimit, usersSearch, usersRole]);

  // --- Fetch Reports ---
  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const data = await getReports({
        page: reportsPage,
        limit: reportsLimit,
        search: reportsSearch,
        status: reportsStatus !== 'all' ? reportsStatus : undefined,
        category: reportsCategory !== 'all' ? reportsCategory : undefined
      });

      if (data && typeof data === 'object' && Array.isArray(data.reports)) {
        setReports(data.reports);
        setReportsTotal(data.total || 0);
        setReportsTotalPages(data.totalPages || 1);
        
        // Count pending reports in current dataset or total
        const pending = data.reports.filter(r => r.status === 'pending').length;
        setPendingCount(pending);
      } else if (Array.isArray(data)) {
        setReports(data);
        setReportsTotal(data.length);
        setReportsTotalPages(Math.ceil(data.length / reportsLimit) || 1);
        setPendingCount(data.filter(r => r.status === 'pending').length);
      }
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setReportsLoading(false);
    }
  }, [reportsPage, reportsLimit, reportsSearch, reportsStatus, reportsCategory]);

  useEffect(() => {
    if (activeBlock === 'users') {
      fetchUsers();
    } else {
      fetchReports();
    }
  }, [activeBlock, fetchUsers, fetchReports]);

  // Real-time report events
  useEffect(() => {
    const handleReportEvent = () => {
      fetchReports();
    };
    window.addEventListener('report-event', handleReportEvent);
    return () => window.removeEventListener('report-event', handleReportEvent);
  }, [fetchReports]);

  // Handle User Search Input with Debounce
  const handleUsersSearchChange = (val) => {
    if (usersSearchTimeout.current) clearTimeout(usersSearchTimeout.current);
    usersSearchTimeout.current = setTimeout(() => {
      setUsersSearch(val);
      setUsersPage(1);
    }, 300);
  };

  // Handle Report Search Input with Debounce
  const handleReportsSearchChange = (val) => {
    if (reportsSearchTimeout.current) clearTimeout(reportsSearchTimeout.current);
    reportsSearchTimeout.current = setTimeout(() => {
      setReportsSearch(val);
      setReportsPage(1);
    }, 300);
  };

  const handleUpdateReportStatus = async (id, status) => {
    try {
      await updateReportStatus(id, status);
      toast.success('Report status updated');
      fetchReports();
    } catch (err) {
      toast.error(err.message || 'Failed to update report');
    }
  };

  const handleDeleteReport = async (id) => {
    try {
      await deleteReport(id);
      toast.success('Report deleted');
      fetchReports();
    } catch (err) {
      toast.error(err.message || 'Failed to delete report');
    }
  };

  const handleCreateUser = async (userData) => {
    try {
      await createUser(userData);
      toast.success(`User "${userData.username}" created`);
      setShowAddModal(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await deleteUser(userId);
      toast.success('User deleted');
      setShowDeleteModal(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to delete user');
    }
  };

  const handleChangePassword = async (userId, newPassword) => {
    try {
      await changeUserPassword(userId, newPassword);
      toast.success('Password changed');
      setShowPasswordModal(null);
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    }
  };

  if (currentUser?.role !== 'admin') return null;

  // Filter users by client-side can_control if requested
  const displayedUsers = users.filter(u => {
    if (usersControlFilter === 'enabled') return u.can_control !== false;
    if (usersControlFilter === 'readonly') return u.can_control === false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* Top Segmented Navigation: Separate into 2 Independent Blogs    */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/60 border border-slate-700/60 p-2 sm:p-2.5 rounded-2xl shadow-lg">
        <div className="flex items-center gap-2 p-1 bg-slate-900/80 rounded-xl border border-slate-700/50 w-full sm:w-auto">
          {/* Blog 1: User Management Tab Button */}
          <button
            onClick={() => setActiveBlock('users')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-4 sm:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeBlock === 'users'
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Management</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeBlock === 'users' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {usersTotal}
            </span>
          </button>

          {/* Blog 2: Issue & Bug Reports Tab Button */}
          <button
            onClick={() => setActiveBlock('reports')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-4 sm:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 relative ${
              activeBlock === 'reports'
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileWarning className="w-4 h-4" />
            <span>Issue & Bug Reports</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeBlock === 'reports' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {reportsTotal}
            </span>
            {pendingCount > 0 && activeBlock !== 'reports' && (
              <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping absolute -top-1 -right-1" />
            )}
          </button>
        </div>

        <div className="text-xs text-slate-400 hidden sm:flex items-center gap-2 pr-3">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>Admin Portal Control Room</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* BLOG 1: USER MANAGEMENT                                       */}
      {/* ============================================================== */}
      {activeBlock === 'users' && (
        <div className="space-y-4 animate-fadeIn">
          {/* User Management Toolbar Card */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">User Account Management</h2>
                  <p className="text-xs text-slate-400">Configure roles, permissions, and passwords for system operators</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchUsers()}
                  disabled={usersLoading}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs transition-colors"
                  title="Reload users"
                >
                  <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 shadow-lg shadow-cyan-500/20"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add New User</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar for Users */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5 relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  defaultValue={usersSearch}
                  onChange={e => handleUsersSearchChange(e.target.value)}
                  placeholder="Search by username..."
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={usersRole}
                  onChange={e => { setUsersRole(e.target.value); setUsersPage(1); }}
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admins Only</option>
                  <option value="user">Standard Users Only</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <select
                  value={usersControlFilter}
                  onChange={e => setUsersControlFilter(e.target.value)}
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">All Access</option>
                  <option value="enabled">Can Control</option>
                  <option value="readonly">Read-Only</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <select
                  value={usersLimit}
                  onChange={e => { setUsersLimit(Number(e.target.value)); setUsersPage(1); }}
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 cursor-pointer"
                  title="Users per page"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Users List Table Container */}
          <div className="bg-slate-800/20 border border-slate-700/40 rounded-2xl p-2 sm:p-3 min-h-[250px]">
            {usersLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
                <span className="text-sm font-medium">Loading user accounts...</span>
              </div>
            ) : displayedUsers.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-400" />
                <p className="text-base font-medium text-slate-300">No users match your criteria</p>
                <p className="text-xs text-slate-500 mt-1">Try resetting the search or role filters</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Table Header (Desktop) */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/40">
                  <span className="col-span-4">User Information</span>
                  <span className="col-span-2">Role</span>
                  <span className="col-span-2">Created Date</span>
                  <span className="col-span-4 text-right">Actions</span>
                </div>

                {displayedUsers.map(u => (
                  <div
                    key={u.id}
                    className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 hover:border-slate-600 rounded-xl p-3.5 transition-all duration-150"
                  >
                    <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-3 md:space-y-0">
                      {/* User Avatar & Name */}
                      <div className="col-span-4 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm ${
                          u.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-700/60 text-slate-300 border border-slate-600/50'
                        }`}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-200 text-sm block">{u.username}</span>
                          <span className="text-[11px] text-slate-500 font-mono">ID: #{u.id}</span>
                        </div>
                      </div>

                      {/* Role Badge */}
                      <div className="col-span-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          u.role === 'admin' 
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' 
                            : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                        }`}>
                          {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {u.role.toUpperCase()}
                        </span>
                      </div>

                      {/* Created Date */}
                      <div className="col-span-2 text-xs text-slate-400">
                        {new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>

                      {/* Action Buttons */}
                      <div className="col-span-4 flex items-center gap-2 md:justify-end flex-wrap">
                        {/* Control Permission Toggle */}
                        <button
                          onClick={async () => {
                            try {
                              await toggleUserControl(u.id, !u.can_control);
                              toast.success(u.can_control ? 'User set to read-only' : 'User control enabled');
                              fetchUsers();
                            } catch (err) { toast.error(err.message); }
                          }}
                          disabled={u.id === currentUser.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                            u.can_control !== false
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                          title={u.can_control !== false ? 'Click to revoke device control' : 'Click to enable device control'}
                        >
                          {u.can_control !== false ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                          <span>{u.can_control !== false ? 'Control' : 'Read-Only'}</span>
                        </button>

                        {/* Change Password */}
                        <button
                          onClick={() => setShowPasswordModal(u)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/80 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-all active:scale-95 border border-slate-600"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Password</span>
                        </button>

                        {/* Delete User */}
                        <button
                          onClick={() => setShowDeleteModal(u)}
                          disabled={u.id === currentUser.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Pagination Bar */}
          {!usersLoading && usersTotal > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-2 text-xs text-slate-400">
              <div>
                Showing <strong className="text-slate-200">{(usersPage - 1) * usersLimit + 1}</strong> to <strong className="text-slate-200">{Math.min(usersPage * usersLimit, usersTotal)}</strong> of <strong className="text-slate-200">{usersTotal.toLocaleString()}</strong> users
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setUsersPage(1)}
                  disabled={usersPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="First page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                  disabled={usersPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-medium text-slate-200 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  Page {usersPage} of {usersTotalPages}
                </span>

                <button
                  onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                  disabled={usersPage >= usersTotalPages}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setUsersPage(usersTotalPages)}
                  disabled={usersPage >= usersTotalPages}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Last page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* BLOG 2: ISSUE & BUG REPORTS                                   */}
      {/* ============================================================== */}
      {activeBlock === 'reports' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Reports Toolbar Card */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <FileWarning className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-100">Issue & Incident Reports</h2>
                    {pendingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                        {pendingCount} Pending Action
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">Track, investigate and resolve hardware or software problems submitted by operators</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchReports()}
                  disabled={reportsLoading}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs transition-colors"
                  title="Reload reports"
                >
                  <RefreshCw className={`w-4 h-4 ${reportsLoading ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Status Pills Filter */}
            <div className="flex items-center gap-2 flex-wrap pb-1">
              {[
                { id: 'all', label: 'All Reports' },
                { id: 'pending', label: 'Pending', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
                { id: 'in_progress', label: 'In Progress', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
                { id: 'resolved', label: 'Resolved', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
              ].map(st => (
                <button
                  key={st.id}
                  onClick={() => { setReportsStatus(st.id); setReportsPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    reportsStatus === st.id
                      ? 'bg-slate-200 text-slate-900 border-slate-200 shadow-md'
                      : 'bg-slate-900/60 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Search & Category Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7 relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  defaultValue={reportsSearch}
                  onChange={e => handleReportsSearchChange(e.target.value)}
                  placeholder="Search by title, description or reporter..."
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <select
                  value={reportsCategory}
                  onChange={e => { setReportsCategory(e.target.value); setReportsPage(1); }}
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  <option value="bug">Bugs / Glitches</option>
                  <option value="hardware">Hardware / Sensor</option>
                  <option value="feature">Feature Requests</option>
                  <option value="other">General Inquiries</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <select
                  value={reportsLimit}
                  onChange={e => { setReportsLimit(Number(e.target.value)); setReportsPage(1); }}
                  className="w-full bg-slate-900/70 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 cursor-pointer"
                  title="Reports per page"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          </div>

          {/* Reports Cards Container */}
          <div className="bg-slate-800/20 border border-slate-700/40 rounded-2xl p-2 sm:p-3 min-h-[250px]">
            {reportsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
                <span className="text-sm font-medium">Loading issue tickets...</span>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-slate-700/50">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-slate-200 font-semibold text-sm">No issues found</p>
                <p className="text-slate-500 text-xs mt-1">
                  {reportsSearch || reportsStatus !== 'all' ? 'Try adjusting your search query or status filter' : 'All facility systems operating smoothly'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/50 hover:border-slate-600 rounded-xl p-4 transition-all duration-150 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-slate-100 text-sm">{report.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-cyan-300 border border-slate-600 uppercase tracking-wider">
                          {report.category}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">#{report.id}</span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <select
                          value={report.status}
                          onChange={(e) => handleUpdateReportStatus(report.id, e.target.value)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-semibold border focus:outline-none cursor-pointer ${
                            report.status === 'resolved'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : report.status === 'in_progress'
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          <option value="pending" className="bg-slate-900 text-amber-400">Pending</option>
                          <option value="in_progress" className="bg-slate-900 text-cyan-400">In Progress</option>
                          <option value="resolved" className="bg-slate-900 text-emerald-400">Resolved</option>
                        </select>

                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
                          title="Delete report"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-300 mb-3 leading-relaxed whitespace-pre-wrap bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/30">
                      {report.description}
                    </p>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/30">
                      <span>Reported by: <strong className="text-slate-200 font-semibold">{report.username}</strong></span>
                      <span className="text-slate-500">{new Date(report.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Report Pagination Bar */}
          {!reportsLoading && reportsTotal > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-2 text-xs text-slate-400">
              <div>
                Showing <strong className="text-slate-200">{(reportsPage - 1) * reportsLimit + 1}</strong> to <strong className="text-slate-200">{Math.min(reportsPage * reportsLimit, reportsTotal)}</strong> of <strong className="text-slate-200">{reportsTotal.toLocaleString()}</strong> tickets
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setReportsPage(1)}
                  disabled={reportsPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="First page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setReportsPage(p => Math.max(1, p - 1))}
                  disabled={reportsPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-medium text-slate-200 bg-slate-900/60 border border-slate-700/60 rounded-lg">
                  Page {reportsPage} of {reportsTotalPages}
                </span>

                <button
                  onClick={() => setReportsPage(p => Math.min(reportsTotalPages, p + 1))}
                  disabled={reportsPage >= reportsTotalPages}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setReportsPage(reportsTotalPages)}
                  disabled={reportsPage >= reportsTotalPages}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Last page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODALS                                                         */}
      {/* ============================================================== */}

      {/* Add User Modal */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Create New System User">
          <AddUserForm onSubmit={handleCreateUser} onCancel={() => setShowAddModal(false)} />
        </Modal>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <Modal onClose={() => setShowPasswordModal(null)} title={`Change Password — ${showPasswordModal.username}`}>
          <ChangePasswordForm
            userId={showPasswordModal.id}
            onSubmit={handleChangePassword}
            onCancel={() => setShowPasswordModal(null)}
          />
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal onClose={() => setShowDeleteModal(null)} title="Confirm Account Deletion">
          <div className="space-y-4">
            <p className="text-slate-300 text-sm leading-relaxed">
              Are you sure you want to permanently delete user <strong className="text-red-400">"{showDeleteModal.username}"</strong>? This will revoke all their access permissions immediately.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowDeleteModal(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={() => handleDeleteUser(showDeleteModal.id)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-colors active:scale-95 shadow-md shadow-red-500/20">Delete User</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-700/50">
          <h3 className="text-base sm:text-lg font-bold text-slate-100">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddUserForm({ onSubmit, onCancel }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    await onSubmit({ username, password, role });
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Username</label>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
          className="w-full bg-slate-900/60 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all" placeholder="Enter username" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
          className="w-full bg-slate-900/60 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all" placeholder="Min 6 characters" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Access Role</label>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="w-full bg-slate-900/60 border border-slate-700 text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all cursor-pointer">
          <option value="user">Standard User (Operator)</option>
          <option value="admin">Administrator (Full Access)</option>
        </select>
      </div>
      <div className="flex gap-3 justify-end pt-3 border-t border-slate-700/50">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700/70 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-cyan-500/20">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Create User
        </button>
      </div>
    </form>
  );
}

function ChangePasswordForm({ userId, onSubmit, onCancel }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    await onSubmit(userId, newPassword);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">New Password</label>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
          className="w-full bg-slate-900/60 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all" placeholder="Min 6 characters" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Confirm New Password</label>
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
          className="w-full bg-slate-900/60 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all" placeholder="Re-enter password" />
      </div>
      <div className="flex gap-3 justify-end pt-3 border-t border-slate-700/50">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700/70 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-cyan-500/20">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Update Password
        </button>
      </div>
    </form>
  );
}
