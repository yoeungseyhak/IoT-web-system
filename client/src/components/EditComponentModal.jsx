import { useState, useContext, useEffect } from 'react';
import { Settings2, X, Trash2, Cpu, Edit3, Loader2, AlertTriangle, Server, Ban } from 'lucide-react';
import { updateDeviceDetails, deleteDevice } from '../api';
import { WebSocketContext } from '../App';
import toast from 'react-hot-toast';

export default function EditComponentModal({ device, isOpen, onClose, onUpdated, onDeleted }) {
  const { controllers = [] } = useContext(WebSocketContext) || {};
  const [name, setName] = useState(device.name || '');
  const [pin, setPin] = useState((device.pin || '').replace(/GPIO\s*/gi, ''));
  const [controllerId, setControllerId] = useState(device.controller_id || '');
  const [disabled, setDisabled] = useState(Boolean(device.disabled));
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && device) {
      setName(device.name || '');
      setPin((device.pin || '').replace(/GPIO\s*/gi, ''));
      setControllerId(device.controller_id || '');
      setDisabled(Boolean(device.disabled));
      setShowDeleteConfirm(false);
    }
  }, [isOpen, device]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Component name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const updated = await updateDeviceDetails(device.id, {
        name: name.trim(),
        pin: pin.trim(),
        controller_id: controllerId,
        disabled
      });
      toast.success(`Updated "${updated.name}"`);
      if (onUpdated) onUpdated(updated);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update component');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteDevice(device.id);
      toast.success(`Removed component "${device.name}"`);
      if (onDeleted) onDeleted(device.id);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to delete component');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Configure Component</h3>
              <p className="text-xs text-slate-400">Edit name or hardware pin</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {!showDeleteConfirm ? (
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                Component Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Living Room Light, Garage Gate"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
                required
              />
            </div>

            {/* Controller Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                Assigned ESP32 Controller
              </label>
              <select
                value={controllerId}
                onChange={e => setControllerId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              >
                <option value="">All Controllers (Broadcast)</option>
                {controllers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id} ({c.online ? 'Online' : 'Offline'}{c.ip ? ` - ${c.ip}` : ''})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Select which ESP32 unit will receive control commands for this component.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                Assigned ESP32 Pin
              </label>
              <input
                type="text"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="e.g. 2 or 18, 19"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Specifies which physical pin on the ESP32 microcontroller controls this component.
              </p>
            </div>

            <div className={`rounded-xl p-3.5 border transition-colors ${
              disabled
                ? 'bg-amber-500/10 border-amber-500/40'
                : 'bg-slate-900/50 border-slate-700/60'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    disabled ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Ban className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        Disable Component
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        disabled
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {disabled ? 'Disabled' : 'Active'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {disabled
                        ? 'Controls and scheduled automations are locked while this component is disabled.'
                        : 'Temporarily disable manual controls and scheduled automations for this component.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDisabled(!disabled)}
                  aria-label="Toggle Disable Component"
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                    disabled ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    disabled ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Component
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Confirm Deletion</p>
                <p className="text-xs text-red-300 mt-1">
                  Are you sure you want to delete component <strong>"{device.name}"</strong>? All associated schedules and countdown timers will also be removed.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Yes, Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
