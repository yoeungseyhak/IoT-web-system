import { useState, useContext, useEffect, useMemo } from 'react';
import { X, Car, Edit3, Loader2, Cpu, Server, AlertTriangle } from 'lucide-react';
import { updateParkingSlot } from '../api';
import { WebSocketContext } from '../App';
import { validateAndFindPinConflict, useHardwareInventory } from '../utils/pinValidator';
import toast from 'react-hot-toast';

export default function EditSlotModal({ slot, isOpen, onClose, onSlotUpdated }) {
  const { controllers = [] } = useContext(WebSocketContext) || {};
  const { devices, slots } = useHardwareInventory(isOpen);
  const [name, setName] = useState(slot?.name || '');
  const [sensorPin, setSensorPin] = useState((slot?.sensor_pin || '').replace(/GPIO\s*/gi, ''));
  const [controllerId, setControllerId] = useState(slot?.controller_id || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && slot) {
      setName(slot.name || '');
      setSensorPin((slot.sensor_pin || '').replace(/GPIO\s*/gi, ''));
      setControllerId(slot.controller_id || '');
    }
  }, [isOpen, slot]);

  const pinError = useMemo(
    () =>
      sensorPin.trim()
        ? validateAndFindPinConflict({
            pin: sensorPin,
            controllerId,
            devices,
            slots,
            controllers,
            excludeSlotId: slot?.id,
            allowInputOnly: true
          })
        : null,
    [sensorPin, controllerId, devices, slots, controllers, slot?.id]
  );

  if (!isOpen || !slot) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Slot name cannot be empty');
      return;
    }
    if (pinError) {
      toast.error(pinError);
      return;
    }

    setLoading(true);
    try {
      const res = await updateParkingSlot(slot.id, {
        name: name.trim(),
        sensor_pin: sensorPin.trim(),
        controller_id: controllerId
      });
      toast.success(`Slot renamed to "${res.slot?.name || name.trim()}"`);
      onSlotUpdated?.(res.slot || { ...slot, name: name.trim() }, res.stats);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update parking slot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Edit Parking Slot
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Update bay name or hardware assignment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Parking Bay / Slot Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bay A1, VIP Slot 2"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
              Assigned ESP32 Controller
            </label>
            <select
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            >
              <option value="">All Controllers (Broadcast)</option>
              {controllers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id} ({c.online ? 'Online' : 'Offline'}{c.ip ? ` - ${c.ip}` : ''})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
              Hardware ESP32 Pin(s)
            </label>
            <input
              type="text"
              value={sensorPin}
              onChange={(e) => setSensorPin(e.target.value)}
              placeholder="e.g. 32 or 32, 33 or 36"
              className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 font-mono text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 ${
                pinError
                  ? 'border-red-500/70 focus:ring-red-500/40 focus:border-red-500'
                  : 'border-slate-300 dark:border-slate-700 focus:ring-cyan-500/50 focus:border-cyan-500'
              }`}
            />
            {pinError && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-500 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{pinError}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || Boolean(pinError)}
              className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
