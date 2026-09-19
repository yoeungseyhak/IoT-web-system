import { useState } from 'react';
import { Plus, X, Cpu, Tag, Layers, Loader2 } from 'lucide-react';
import { createDevice } from '../api';
import toast from 'react-hot-toast';

export default function AddComponentModal({ isOpen, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('light');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const componentTypes = [
    { id: 'light', label: 'Light', icon: '💡', desc: 'On / Off switch with live glow & automation' },
    { id: 'rolling-door', label: 'Rolling Door', icon: '🚪', desc: 'Open / Close / Stop motor controls' },
    { id: 'boom-gate', label: 'Boom Gate', icon: '🚧', desc: 'Open / Close barrier arm' },
    { id: 'party-light', label: 'Party Light', icon: '🎉', desc: 'RGB color studio with dynamic effects' },
  ];

  const commonPins = [
    'GPIO 2', 'GPIO 4', 'GPIO 5', 'GPIO 12', 'GPIO 13', 'GPIO 14',
    'GPIO 15', 'GPIO 18', 'GPIO 19', 'GPIO 21', 'GPIO 22', 'GPIO 23',
    'GPIO 25', 'GPIO 26', 'GPIO 27', 'GPIO 32', 'GPIO 33'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Component name is required');
      return;
    }
    if (!pin.trim()) {
      toast.error('ESP32 PIN is required');
      return;
    }

    setLoading(true);
    try {
      const newDevice = await createDevice({
        name: name.trim(),
        type,
        pin: pin.trim()
      });
      toast.success(`Component "${newDevice.name}" added successfully!`);
      if (onCreated) onCreated(newDevice);
      setName('');
      setPin('');
      setType('light');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to add component');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Add New Component</h3>
              <p className="text-xs text-slate-400">Configure device type and ESP32 hardware PIN</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Component Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              Component Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Garden Light, Warehouse Gate, Hallway Light"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
              required
            />
          </div>

          {/* Component Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Component Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {componentTypes.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    type === t.id
                      ? 'bg-cyan-500/15 border-cyan-500/50 shadow-sm ring-1 ring-cyan-500/20'
                      : 'bg-slate-900/40 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <span className="text-2xl mt-0.5">{t.icon}</span>
                  <div>
                    <span className={`text-sm font-semibold block ${type === t.id ? 'text-cyan-400' : 'text-slate-200'}`}>
                      {t.label}
                    </span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      {t.desc}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ESP32 Pin */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              ESP32 PIN
            </label>
            <input
              type="text"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="e.g. GPIO 13, GPIO 25, 26"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              required
            />
            
            {/* Pin quick presets */}
            <div className="mt-2">
              <span className="text-[11px] text-slate-400 block mb-1">Quick Select ESP32 Pin:</span>
              <div className="flex flex-wrap gap-1.5">
                {commonPins.slice(0, 10).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPin(p)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      pin === p
                        ? 'bg-cyan-500 text-slate-900 font-bold'
                        : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-700/60 flex justify-end gap-2">
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
              Add Component
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
