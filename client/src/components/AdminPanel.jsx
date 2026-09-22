import { useState, useContext, useEffect } from 'react';
import { Users, UserPlus, Trash2, KeyRound, Shield, User, X, Loader2, ToggleLeft, ToggleRight, FileWarning, CheckCircle2, Clock as ClockIcon, AlertCircle } from 'lucide-react';
import { AuthContext } from '../App';
import { getUsers, createUser, deleteUser, changeUserPassword, toggleUserControl, getReports, updateReportStatus, deleteReport } from '../api';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    try {
      const data = await getReports();
      setReports(data || []);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchReports();

    const handleReportEvent = () => {
      fetchReports();
    };
    window.addEventListener('report-event', handleReportEvent);
    return () => window.removeEventListener('report-event', handleReportEvent);
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">User Management</h2>
            <p className="text-sm text-slate-400">{users.length} registered users</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 shadow-lg shadow-cyan-500/20"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {/* Desktop table header */}
          <div className="hidden md:grid grid-cols-4 gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
            <span>User</span>
            <span>Role</span>
            <span>Created</span>
            <span className="text-right">Actions</span>
          </div>

          {users.map(u => (
            <div key={u.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-all duration-200">
              <div className="md:grid md:grid-cols-4 md:gap-4 md:items-center space-y-3 md:space-y-0">
                {/* User */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                    u.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-slate-200">{u.username}</span>
                </div>

                {/* Role */}
                <div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                    u.role === 'admin' 
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                  }`}>
                    {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                  </span>
                </div>

                {/* Created */}
                <div className="text-sm text-slate-400">
                  {new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 md:justify-end">
                  <button
                    onClick={() => setShowPasswordModal(u)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Password
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(u)}
                    disabled={u.id === currentUser.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await toggleUserControl(u.id, !u.can_control);
                        toast.success(u.can_control ? 'User set to read-only' : 'User control enabled');
                        fetchUsers();
                      } catch (err) { toast.error(err.message); }
                    }}
                    disabled={u.id === currentUser.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                      u.can_control !== false
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {u.can_control !== false ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    {u.can_control !== false ? 'Enabled' : 'Read-Only'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issue & Bug Reports Section */}
      <div className="pt-6 border-t border-slate-700/60 dark:border-slate-700/60 border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <FileWarning className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Issue & Bug Reports</h2>
              <p className="text-sm text-slate-400">{reports.length} reports submitted</p>
            </div>
          </div>
        </div>

        {reportsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2 opacity-80" />
            <p className="text-slate-300 font-medium text-sm">No issues reported</p>
            <p className="text-slate-500 text-xs mt-0.5">All systems running smoothly</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">{report.title}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-700 text-slate-300 border border-slate-600">
                      {report.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={report.status}
                      onChange={(e) => handleUpdateReportStatus(report.id, e.target.value)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium border focus:outline-none cursor-pointer ${
                        report.status === 'resolved'
                          ? 'bg-green-500/10 text-green-400 border-green-500/30'
                          : report.status === 'in_progress'
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      <option value="pending" className="bg-slate-800 text-amber-400">Pending</option>
                      <option value="in_progress" className="bg-slate-800 text-cyan-400">In Progress</option>
                      <option value="resolved" className="bg-slate-800 text-green-400">Resolved</option>
                    </select>
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-2 leading-relaxed">{report.description}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Reported by: <strong className="text-slate-300 font-medium">{report.username}</strong></span>
                  <span>{new Date(report.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} title="Create New User">
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
        <Modal onClose={() => setShowDeleteModal(null)} title="Confirm Delete">
          <div className="space-y-4">
            <p className="text-slate-300">
              Are you sure you want to delete user <strong className="text-red-400">"{showDeleteModal.username}"</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteModal(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
              <button onClick={() => handleDeleteUser(showDeleteModal.id)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm transition-colors active:scale-95">Delete User</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 transition-colors">
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
        <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
          className="w-full bg-slate-900/50 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500" placeholder="Enter username" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
          className="w-full bg-slate-900/50 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500" placeholder="Min 6 characters" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-600 text-slate-100 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500">
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 flex items-center gap-2 disabled:opacity-60">
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
        <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
          className="w-full bg-slate-900/50 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500" placeholder="Min 6 characters" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Confirm Password</label>
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
          className="w-full bg-slate-900/50 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500" placeholder="Re-enter password" />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">Cancel</button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 flex items-center gap-2 disabled:opacity-60">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Update Password
        </button>
      </div>
    </form>
  );
}
