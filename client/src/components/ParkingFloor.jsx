import { useState, useContext } from 'react';
import { Car, Plus, Trash2, CheckCircle2, AlertCircle, Radio, Cpu, RefreshCw, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { AuthContext } from '../App';
import { updateSlotStatus, deleteParkingSlot } from '../api';
import AddSlotModal from './AddSlotModal';
import toast from 'react-hot-toast';

export default function ParkingFloor({ slots = [], stats, onSlotUpdated, onSlotRemoved, onSlotAdded }) {
  const { user } = useContext(AuthContext);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const total = stats?.total ?? slots.length;
  const occupied = stats?.occupied ?? slots.filter(s => s.occupied).length;
  const available = stats?.available ?? Math.max(0, total - occupied);
  const isFull = stats?.isFull ?? (total > 0 && available === 0);

  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const handleToggleOccupancy = async (slot) => {
    const nextState = !slot.occupied;
    setActionLoading(prev => ({ ...prev, [slot.id]: true }));
    try {
      const res = await updateSlotStatus(slot.id, nextState);
      onSlotUpdated?.(res.slot, res.stats);
      toast.success(`${slot.name} marked as ${nextState ? 'Occupied' : 'Available'}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update slot status');
    } finally {
      setActionLoading(prev => ({ ...prev, [slot.id]: false }));
    }
  };

  const handleDeleteSlot = async (slot) => {
    if (!window.confirm(`Are you sure you want to remove "${slot.name}"?`)) return;
    setActionLoading(prev => ({ ...prev, [slot.id]: true }));
    try {
      const res = await deleteParkingSlot(slot.id);
      onSlotRemoved?.(slot.id, res.stats);
      toast.success(`Parking slot "${slot.name}" removed`);
    } catch (err) {
      toast.error(err.message || 'Failed to delete slot');
    } finally {
      setActionLoading(prev => ({ ...prev, [slot.id]: false }));
    }
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 mb-8">
      {/* Header & Stats Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
            isFull ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-cyan-500/20 text-cyan-400'
          }`}>
            <Car className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">Parking Space Management</h2>
              {isFull ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                  PARKING FULL (GATE LOCKED)
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  SPACES AVAILABLE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Real-time ultrasonic & IR telemetry slot tracking</p>
          </div>
        </div>

        {/* Counter Cards */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-2">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Available</span>
              <span className={`text-xl font-bold font-mono ${available === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {available}
              </span>
            </div>
            <div className="h-8 w-[1px] bg-slate-700" />
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Occupied</span>
              <span className="text-xl font-bold font-mono text-slate-200">
                {occupied}
              </span>
            </div>
            <div className="h-8 w-[1px] bg-slate-700" />
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Total Slots</span>
              <span className="text-xl font-bold font-mono text-cyan-400">
                {total}
              </span>
            </div>
          </div>

          {user?.role === 'admin' && (
            <button
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              Add Parking Slot
            </button>
          )}
        </div>
      </div>

      {/* Capacity Progress Bar */}
      <div className="mt-4 mb-6">
        <div className="flex justify-between text-xs text-slate-400 mb-1.5">
          <span>Floor Occupancy Rate</span>
          <span className="font-semibold text-slate-200 font-mono">{occupancyRate}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-700/50 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              occupancyRate >= 100
                ? 'bg-red-500'
                : occupancyRate >= 75
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
            }`}
            style={{ width: `${occupancyRate}%` }}
          />
        </div>
      </div>

      {/* Parking Slots Grid */}
      {slots.length === 0 ? (
        <div className="text-center py-10 bg-slate-900/30 rounded-xl border border-slate-700/50">
          <Car className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-300 font-medium">No parking slots configured</p>
          <p className="text-xs text-slate-500 mt-1">Admin can add parking slots to start tracking occupancy.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {slots.map((slot) => {
            const isOccupied = slot.occupied === 1 || slot.occupied === true;
            const isLoading = actionLoading[slot.id];

            return (
              <div
                key={slot.id}
                className={`relative rounded-2xl p-4 border transition-all duration-300 flex flex-col justify-between ${
                  isOccupied
                    ? 'bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/5'
                    : 'bg-emerald-500/10 border-emerald-500/25 shadow-lg shadow-emerald-500/5'
                }`}
              >
                {/* Slot Top Bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-100">{slot.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isOccupied
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {isOccupied ? 'Occupied' : 'Free'}
                    </span>
                  </div>

                  {user?.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteSlot(slot)}
                      disabled={isLoading}
                      className="p-1 text-slate-400 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
                      title="Delete slot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Visual Parking Bay Graphic */}
                <div className={`my-3 p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all min-h-[110px] ${
                  isOccupied
                    ? 'border-red-500/40 bg-red-950/20'
                    : 'border-emerald-500/40 bg-emerald-950/20'
                }`}>
                  {isOccupied ? (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center mb-1">
                        <Car className="w-7 h-7" />
                      </div>
                      <span className="text-xs font-semibold text-red-400 font-mono">VEHICLE PARKED</span>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-1">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <span className="text-xs font-semibold text-emerald-400 font-mono">AVAILABLE</span>
                    </>
                  )}
                </div>

                {/* Sensor Info & Toggle Button */}
                <div className="space-y-2 pt-2 border-t border-slate-700/40">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      {slot.sensor_type === 'ir' ? <Cpu className="w-3 h-3 text-cyan-400" /> : <Radio className="w-3 h-3 text-cyan-400" />}
                      {slot.sensor_type === 'ir' ? 'IR Sensor' : 'Ultrasonic'}
                    </span>
                    <span className="font-mono text-slate-400">{slot.sensor_pin || 'Auto'}</span>
                  </div>

                  {/* Manual / Simulated Telemetry Toggle */}
                  <button
                    onClick={() => handleToggleOccupancy(slot)}
                    disabled={isLoading}
                    className={`w-full py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      isOccupied
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30'
                    } disabled:opacity-50`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {isOccupied ? 'Simulate Depart' : 'Simulate Park'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Slot Modal */}
      <AddSlotModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSlotAdded={onSlotAdded}
      />
    </div>
  );
}
