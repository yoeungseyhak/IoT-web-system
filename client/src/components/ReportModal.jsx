import { useState, useEffect } from 'react';
import { X, MessageSquareWarning, Loader2, Clock, CheckCircle2, AlertCircle, Plus, FileText } from 'lucide-react';
import { createReport, getReports } from '../api';
import toast from 'react-hot-toast';

export default function ReportModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'my-reports'
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Bug/Software');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [myReports, setMyReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const fetchMyReports = async () => {
    setReportsLoading(true);
    try {
      const data = await getReports();
      setMyReports(data || []);
    } catch (err) {
      console.error('Failed to load my reports', err);
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMyReports();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleReportEvent = () => {
      if (isOpen) {
        fetchMyReports();
      }
    };
    window.addEventListener('report-event', handleReportEvent);
    return () => window.removeEventListener('report-event', handleReportEvent);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Title and description are required');
      return;
    }

    setLoading(true);
    try {
      await createReport({ title, category, description });
      toast.success('Report submitted successfully! Admin will review it.');
      setTitle('');
      setCategory('Bug/Software');
      setDescription('');
      await fetchMyReports();
      setActiveTab('my-reports'); // Switch to My Reports tab so user sees their submission!
    } catch (err) {
      toast.error(err.message || 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-500 dark:text-cyan-400 flex items-center justify-center">
              <MessageSquareWarning className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Issue & Bug Reports</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Report problems and track resolution updates</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-700/80 bg-slate-100/60 dark:bg-slate-900/40 px-6 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'new'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Submit New Report
          </button>
          <button
            onClick={() => setActiveTab('my-reports')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'my-reports'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            My Reports ({myReports.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'new' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
                >
                  <option value="Bug/Software">Bug/Software</option>
                  <option value="Hardware/Pin">Hardware/Pin</option>
                  <option value="Building/Facility">Building/Facility</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detailed explanation..."
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm resize-none"
                  required
                />
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700/60 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Report
                </button>
              </div>
            </form>
          ) : (
            /* My Reports List */
            <div className="space-y-3">
              {reportsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
                </div>
              ) : myReports.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                  <p className="text-slate-700 dark:text-slate-300 font-medium text-sm">No reports submitted yet</p>
                  <p className="text-slate-400 text-xs mt-0.5">Click "Submit New Report" to file an issue</p>
                </div>
              ) : (
                myReports.map(report => (
                  <div
                    key={report.id}
                    className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/70 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {report.title}
                      </h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 border ${
                          report.status === 'resolved'
                            ? 'bg-green-500/10 text-green-500 border-green-500/30'
                            : report.status === 'in_progress'
                            ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30'
                            : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                        }`}
                      >
                        {report.status === 'resolved' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : report.status === 'in_progress' ? (
                          <Clock className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {report.status === 'resolved'
                          ? 'Resolved'
                          : report.status === 'in_progress'
                          ? 'In Progress'
                          : 'Pending'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {report.description}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span className="font-medium bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                        {report.category}
                      </span>
                      <span>{new Date(report.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
