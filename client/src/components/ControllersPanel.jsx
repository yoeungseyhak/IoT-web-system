import { useState, useEffect, useContext, useCallback } from 'react';
import { 
  Server, Plus, Cpu, Wifi, WifiOff, 
  Trash2, Edit3, Loader2, Info, ArrowUpRight, Terminal, Clock, ShieldCheck,
  Zap, Car
} from 'lucide-react';
import { WebSocketContext } from '../App';
import { getControllers, createController, updateController, deleteController } from '../api';
import toast from 'react-hot-toast';

export default function ControllersPanel() {
  const { controllers: wsControllers = [] } = useContext(WebSocketContext) || {};
  const [controllers, setControllers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingController, setEditingController] = useState(null);
  const [deletingController, setDeletingController] = useState(null);

  const fetchControllers = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const data = await getControllers();
      if (Array.isArray(data)) {
        setControllers(data);
      } else if (data && Array.isArray(data.controllers)) {
        setControllers(data.controllers);
      }
    } catch (err) {
      if (!isBackground) toast.error('Failed to load controllers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchControllers();
  }, [fetchControllers]);

  // Real-time listener for device and controller updates
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (
        data.type === 'device-update' ||
        data.type === 'slot-update' ||
        data.type === 'controllers-status' ||
        data.type === 'device-status' ||
        data.type === 'devices-changed' ||
        data.type === 'slots-changed'
      ) {
        fetchControllers(true);
      }
    };
    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [fetchControllers]);

  // Merge live WS status with DB controllers
  const mergedControllers = controllers.map(c => {
    const live = wsControllers.find(wc => wc.id === c.id);
    return {
      ...c,
      online: live ? Boolean(live.online) : Boolean(c.online),
      ip: live?.ip || c.ip_address || c.ip || '',
      last_seen: live?.last_seen || c.last_seen || c.created_at,
      devices: c.devices || [],
      slots: c.slots || []
    };
  });

  const handleCreateController = async (data) => {
    try {
      await createController(data);
      toast.success(`Controller "${data.name}" added successfully`);
      setShowAddModal(false);
      fetchControllers();
    } catch (err) {
      toast.error(err.message || 'Failed to create controller');
    }
  };

  const handleUpdateController = async (id, data) => {
    try {
      await updateController(id, data);
      toast.success('Controller updated');
      setEditingController(null);
      fetchControllers();
    } catch (err) {
      toast.error(err.message || 'Failed to update controller');
    }
  };

  const handleDeleteController = async (id) => {
    try {
      await deleteController(id);
      toast.success('Controller removed');
      setDeletingController(null);
      fetchControllers();
    } catch (err) {
      toast.error(err.message || 'Failed to delete controller');
    }
  };

  const onlineCount = mergedControllers.filter(c => c.online).length;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">ESP32 Controllers Hub</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  onlineCount > 0
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                    : 'bg-red-500/15 text-red-400 border border-red-500/25'
                }`}>
                  {onlineCount}/{mergedControllers.length} Online
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Manage 2 or more physical ESP32 boards concurrently connected via WebSocket
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 shadow-lg shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add ESP32 Controller</span>
            </button>
          </div>
        </div>

        {/* Quick Connection Guide */}
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <Terminal className="w-4 h-4" />
            <span>Multi-ESP32 Setup & Connection Protocol</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Each ESP32 microcontroller connects to this web server via WebSocket. You can configure each board with a unique Controller ID query param (e.g. <code className="bg-slate-800 text-cyan-300 px-1.5 py-0.5 rounded border border-slate-700">/ws/device?id=esp32-2</code>). If a board connects to the default <code className="bg-slate-800 text-cyan-300 px-1.5 py-0.5 rounded border border-slate-700">/ws/device</code> without an ID, the server automatically assigns it to the next available controller without collision.
          </p>
        </div>
      </div>

      {/* Controllers Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mr-2" />
          <span>Loading controllers...</span>
        </div>
      ) : mergedControllers.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 text-center space-y-3">
          <Server className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-semibold text-slate-200">No Controllers Registered</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Click "Add ESP32 Controller" above to register your hardware controllers.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mergedControllers.map(c => {
            const isOnline = Boolean(c.online);

            return (
              <div
                key={c.id}
                className={`bg-slate-800/60 border rounded-2xl p-5 transition-all duration-300 flex flex-col justify-between ${
                  isOnline 
                    ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/5' 
                    : 'border-slate-700/70 hover:border-slate-600'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                        isOnline 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-slate-700/50 text-slate-400 border border-slate-700'
                      }`}>
                        <Cpu className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-100 text-sm">{c.name || c.id}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                            isOnline 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-slate-700 text-slate-400 border border-slate-600'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingController(c)}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                        title="Edit controller info"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingController(c)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Remove controller"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Connected Hardware Components & Relays */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Connected Devices ({c.devices?.length || 0})</span>
                      </span>
                    </div>

                    {c.devices && c.devices.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {c.devices.map(dev => {
                          const isOn = dev.state?.on || dev.state?.status === 'open' || dev.state?.status === 'opened';
                          return (
                            <div
                              key={dev.id}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/60 text-xs"
                            >
                              <span className={`truncate font-medium max-w-[120px] ${dev.disabled ? 'text-slate-400 line-through decoration-amber-500/60' : 'text-slate-200'}`} title={dev.name}>
                                {dev.name}
                              </span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {dev.disabled && (
                                  <span className="text-[10px] font-medium text-amber-300 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30">
                                    Disabled
                                  </span>
                                )}
                                {dev.pin && (
                                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 px-1 py-0.2 rounded border border-cyan-800/40">
                                    {dev.pin}
                                  </span>
                                )}
                                <span className={`w-2 h-2 rounded-full ${dev.disabled ? 'bg-amber-400/70' : isOn ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-500'}`} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic bg-slate-900/40 rounded-lg p-2 border border-slate-800">
                        No relay devices assigned to this controller.
                      </p>
                    )}
                  </div>

                  {/* Connected Parking Bays */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Connected Parking Bays ({c.slots?.length || 0})</span>
                      </span>
                    </div>

                    {c.slots && c.slots.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {c.slots.map(slot => (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/60 text-xs"
                          >
                            <span className="text-slate-200 truncate font-medium max-w-[120px]" title={slot.name}>
                              {slot.name}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {slot.sensor_pin && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  {slot.sensor_pin}
                                </span>
                              )}
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                slot.occupied 
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {slot.occupied ? 'Occupied' : 'Free'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic bg-slate-900/40 rounded-lg p-2 border border-slate-800">
                        No parking sensors assigned to this controller.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Controller Modal */}
      {showAddModal && (
        <AddControllerModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleCreateController}
        />
      )}

      {/* Edit Controller Modal */}
      {editingController && (
        <EditControllerModal
          controller={editingController}
          onClose={() => setEditingController(null)}
          onSubmit={data => handleUpdateController(editingController.id, data)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingController && (
        <DeleteControllerModal
          controller={deletingController}
          onClose={() => setDeletingController(null)}
          onConfirm={() => handleDeleteController(deletingController.id)}
        />
      )}
    </div>
  );
}

function AddControllerModal({ isOpen, onClose, onSubmit }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      toast.error('Controller ID and Name are required');
      return;
    }
    // Clean ID format
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    setLoading(true);
    await onSubmit({ id: cleanId, name: name.trim(), description: description.trim() });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Register ESP32 Controller</h3>
              <p className="text-xs text-slate-400">Add an ESP32 hardware endpoint</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Controller ID (Unique key)
            </label>
            <input
              type="text"
              value={id}
              onChange={e => setId(e.target.value)}
              placeholder="e.g. esp32-3, gate-controller"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Used in the WebSocket path: <code className="text-cyan-400">/ws/device?id={id || '...'}</code>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. ESP32 Unit #3 (Gate & Garden)"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Description / Location (Optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Located near the front entrance, controls barrier servo and infrared sensors"
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-700/60 flex justify-end gap-2">
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
              Register Controller
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditControllerModal({ controller, onClose, onSubmit }) {
  const [name, setName] = useState(controller.name || '');
  const [description, setDescription] = useState(controller.description || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setLoading(true);
    await onSubmit({ name: name.trim(), description: description.trim() });
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">Edit Controller</h3>
              <p className="text-xs text-slate-400">ID: {controller.id}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Description / Location
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-700/60 flex justify-end gap-2">
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
        </form>
      </div>
    </div>
  );
}

function DeleteControllerModal({ controller, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-red-400">
          <Trash2 className="w-6 h-6" />
          <h3 className="font-semibold text-slate-100">Delete Controller</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Are you sure you want to remove controller <strong>"{controller.name || controller.id}"</strong>? Any devices or parking slots assigned to this controller will fallback to broadcast mode.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
