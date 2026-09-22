import { useState } from 'react';
import { X, Car, Plus, Loader2, Cpu, Radio } from 'lucide-react';
import { createParkingSlot } from '../api';
import toast from 'react-hot-toast';

export default function AddSlotModal({ isOpen, onClose, onSlotAdded }) {
  const [name, setName] = useState('');
  const [sensorType, setSensorType] = useState('ultrasonic');
  const [sensorPin, setSensorPin] = useState('GPIO 32, 33');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Slot name is required');
      return;
    }

    setLoading(true);
    try {
      const res = await createParkingSlot({
        name: name.trim(),
        sensor_type: sensorType,
        sensor_pin: sensorPin.trim()
      });
      toast.success(`Parking slot "${name}" created successfully!`);
      setName('');
      onSlotAdded?.(res.slot, res.stats);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create slot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-500 dark:text-cyan-400 flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add Parking Slot</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure space and hardware telemetry</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Slot Name / Identifier
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Slot A5, VIP-1, EV-Charge 2"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Sensor Detection Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setSensorType('ultrasonic'); setSensorPin('GPIO 32, 33'); }}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  sensorType === 'ultrasonic'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Radio className="w-3.5 h-3.5" />
                  Ultrasonic (HC-SR04)
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Distance measurement</span>
              </button>

              <button
                type="button"
                onClick={() => { setSensorType('ir'); setSensorPin('GPIO 36'); }}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  sensorType === 'ir'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Cpu className="w-3.5 h-3.5" />
                  IR Proximity Sensor
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Digital reflection barrier</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Hardware ESP32 GPIO Pin(s)
            </label>
            <input
              type="text"
              value={sensorPin}
              onChange={e => setSensorPin(e.target.value)}
              placeholder="e.g. GPIO 32, 33 (Trig, Echo) or GPIO 36"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-100 font-mono text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Mapped in ESP32 firmware for automated telemetry detection.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-medium shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Slot
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
