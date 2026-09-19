import { useContext, useState } from 'react';
import { AuthContext, WebSocketContext } from '../App';
import { updateDevice } from '../api';
import {
  Lightbulb,
  ArrowUp,
  Square,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Power,
  Clock,
  Timer,
  Repeat,
  Edit3,
  Cpu
} from 'lucide-react';
import toast from 'react-hot-toast';
import LightAutomationModal from './LightAutomationModal';
import EditComponentModal from './EditComponentModal';

export default function DeviceCard({ device, onUpdate }) {
  const { sendMessage } = useContext(WebSocketContext);
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (newState) => {
    setLoading(true);
    try {
      await updateDevice(device.id, newState);
    } catch (err) {
      toast.error(err.message || 'Failed to update device');
    } finally {
      setLoading(false);
    }
  };

  if (device.type === 'light') return <LightCard device={device} onUpdate={handleUpdate} loading={loading} />;
  if (device.type === 'rolling-door') return <RollingDoorCard device={device} onUpdate={handleUpdate} loading={loading} />;
  if (device.type === 'boom-gate') return <BoomGateCard device={device} onUpdate={handleUpdate} loading={loading} />;
  if (device.type === 'party-light') return <PartyLightCard device={device} onUpdate={handleUpdate} loading={loading} />;
  return null;
}

// ============ LIGHT CARD ============
function LightCard({ device, onUpdate, loading }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const isOn = device.state?.on;
  const [showAutomation, setShowAutomation] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const automation = device.automation || {};

  const hasSchedule = automation.schedule?.enabled && (automation.schedule.on_time || automation.schedule.off_time);
  const hasCountdown = automation.countdown?.active;
  const hasCycle = automation.cycle_count?.active;
  const hasAnyAutomation = hasSchedule || hasCountdown || hasCycle;

  return (
    <div className={`relative bg-slate-800 border rounded-xl p-5 transition-all duration-500 flex flex-col justify-between ${
      isOn 
        ? 'border-amber-500/40 shadow-lg shadow-amber-500/10' 
        : 'border-slate-700 hover:border-slate-600'
    }`}>
      {isOn && <div className="absolute inset-0 rounded-xl bg-amber-500/5 pointer-events-none" />}
      
      <div>
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
              isOn 
                ? 'bg-amber-500/20 text-amber-400' 
                : 'bg-slate-700/50 text-slate-500'
            }`}>
              <Lightbulb className={`w-6 h-6 ${isOn ? 'drop-shadow-lg' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-semibold text-slate-100">{device.name}</h3>
                {device.pin && (
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Cpu className="w-2.5 h-2.5" /> {device.pin}
                  </span>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-md transition-colors"
                    title="Configure name & ESP32 pin"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className={`text-xs font-medium ${isOn ? 'text-amber-400' : 'text-slate-500'} mt-0.5`}>
                {isOn ? '● ON' : '○ OFF'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onUpdate({ on: !isOn })}
            disabled={loading}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
              isOn ? 'bg-cyan-500' : 'bg-slate-600'
            } ${loading ? 'opacity-50' : 'cursor-pointer active:scale-95'}`}
          >
            <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${
              isOn ? 'left-7.5' : 'left-0.5'
            }`} />
          </button>
        </div>

        {/* Active automation badges */}
        {hasAnyAutomation && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {hasSchedule && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
                <Clock className="w-3 h-3" />
                {automation.schedule.on_time && `ON ${automation.schedule.on_time}`}
                {automation.schedule.off_time && ` OFF ${automation.schedule.off_time}`}
              </span>
            )}
            {hasCountdown && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-mono">
                <Timer className="w-3 h-3 animate-pulse" />
                Auto-{automation.countdown.action === 'turn_on' ? 'ON' : 'OFF'}
              </span>
            )}
            {hasCycle && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-md font-mono">
                <Repeat className="w-3 h-3 animate-spin" />
                Cycle {automation.cycle_count.current_count}/{automation.cycle_count.total_count}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Schedule & Automation Button */}
      <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center">
        <button
          type="button"
          onClick={() => setShowAutomation(true)}
          className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg transition-all ${
            hasAnyAutomation
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Schedule & Count
          {hasAnyAutomation && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
        </button>
      </div>

      {/* Automations Modal */}
      <LightAutomationModal
        device={device}
        isOpen={showAutomation}
        onClose={() => setShowAutomation(false)}
      />

      {/* Edit Component Modal */}
      <EditComponentModal
        device={device}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </div>
  );
}

// ============ ROLLING DOOR CARD ============
function RollingDoorCard({ device, onUpdate, loading }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const [showEditModal, setShowEditModal] = useState(false);
  const status = device.state?.status || 'closed';
  const isMoving = status === 'opening' || status === 'closing';

  const statusColors = {
    opened: 'text-green-400',
    closed: 'text-red-400',
    opening: 'text-cyan-400',
    closing: 'text-amber-400',
    stopped: 'text-yellow-400'
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all duration-300 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center text-slate-400 flex-shrink-0">
            {/* Rolling door icon */}
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="16" x2="20" y2="16" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-slate-100">{device.name}</h3>
              {device.pin && (
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Cpu className="w-2.5 h-2.5" /> {device.pin}
                </span>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-md transition-colors"
                  title="Configure name & ESP32 pin"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className={`text-xs font-medium flex items-center gap-1 ${statusColors[status] || 'text-slate-500'} mt-0.5`}>
              {isMoving && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />}
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {isMoving && '...'}
            </p>
          </div>
        </div>

        {/* Visual door representation */}
        <div className="mb-4 bg-slate-900 rounded-lg p-3 h-20 flex flex-col justify-center overflow-hidden relative">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className={`h-3 bg-slate-600 rounded-sm mb-0.5 transition-all duration-700 ${
                status === 'opened' ? 'opacity-0 -translate-y-20' :
                status === 'opening' ? `opacity-${100 - i * 20} -translate-y-${i * 2}` :
                'opacity-100 translate-y-0'
              }`}
              style={{
                transitionDelay: `${i * 80}ms`,
                opacity: status === 'opened' ? 0 : status === 'opening' ? (1 - i * 0.15) : 1,
                transform: status === 'opened' ? 'translateY(-80px)' : status === 'opening' ? `translateY(-${i * 8}px)` : 'translateY(0)'
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onUpdate({ status: 'opening' })}
          disabled={loading || status === 'opened' || status === 'opening'}
          className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
            status === 'opening' || status === 'opened'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'
          } disabled:opacity-50`}
        >
          <ArrowUp className="w-4 h-4" />
          Open
        </button>
        <button
          onClick={() => onUpdate({ status: 'stopped' })}
          disabled={loading || !isMoving}
          className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
            status === 'stopped'
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'
          } disabled:opacity-50`}
        >
          <Square className="w-4 h-4" />
          Stop
        </button>
        <button
          onClick={() => onUpdate({ status: 'closing' })}
          disabled={loading || status === 'closed' || status === 'closing'}
          className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
            status === 'closing' || status === 'closed'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'
          } disabled:opacity-50`}
        >
          <ArrowDown className="w-4 h-4" />
          Close
        </button>
      </div>

      {/* Edit Component Modal */}
      <EditComponentModal
        device={device}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </div>
  );
}

// ============ BOOM GATE CARD ============
function BoomGateCard({ device, onUpdate, loading }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const [showEditModal, setShowEditModal] = useState(false);
  const status = device.state?.status || 'closed';
  const isOpen = status === 'open';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all duration-300 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 flex-shrink-0 ${
            isOpen ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="10" y="14" width="4" height="8" rx="1" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-slate-100">{device.name}</h3>
              {device.pin && (
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Cpu className="w-2.5 h-2.5" /> {device.pin}
                </span>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-md transition-colors"
                  title="Configure name & ESP32 pin"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className={`text-xs font-medium ${isOpen ? 'text-green-400' : 'text-red-400'} mt-0.5`}>
              {isOpen ? '● Open (Raised)' : '● Closed (Lowered)'}
            </p>
          </div>
        </div>

        {/* Visual boom gate */}
        <div className="mb-4 bg-slate-900 rounded-lg p-4 h-24 relative overflow-hidden flex items-end">
          {/* Post */}
          <div className="w-6 h-16 bg-slate-600 rounded-t-sm ml-4 relative z-10" />
          {/* Signal lights */}
          <div className="absolute left-6 top-3 flex flex-col gap-1">
            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${isOpen ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-green-900'}`} />
            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${!isOpen ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-red-900'}`} />
          </div>
          {/* Arm */}
          <div 
            className="absolute left-9 top-6 h-2 bg-gradient-to-r from-red-500 via-white to-red-500 rounded-full transition-all duration-700 ease-in-out origin-left"
            style={{
              width: '140px',
              transform: isOpen ? 'rotate(-80deg)' : 'rotate(0deg)',
            }}
          >
            {/* Stripes */}
            <div className="absolute inset-0 flex">
              {[...Array(7)].map((_, i) => (
                <div key={i} className={`flex-1 ${i % 2 === 0 ? 'bg-red-500' : 'bg-white'} ${i === 0 ? 'rounded-l-full' : ''} ${i === 6 ? 'rounded-r-full' : ''}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onUpdate({ status: 'open' })}
          disabled={loading || isOpen}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
            isOpen
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-green-500/10 hover:text-green-400 border border-transparent'
          } disabled:opacity-50`}
        >
          <ChevronUp className="w-4 h-4" />
          Open Gate
        </button>
        <button
          onClick={() => onUpdate({ status: 'closed' })}
          disabled={loading || !isOpen}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 ${
            !isOpen
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-slate-700 text-slate-300 hover:bg-red-500/10 hover:text-red-400 border border-transparent'
          } disabled:opacity-50`}
        >
          <ChevronDown className="w-4 h-4" />
          Close Gate
        </button>
      </div>

      {/* Edit Component Modal */}
      <EditComponentModal
        device={device}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </div>
  );
}

// ============ PARTY LIGHT CARD ============
function PartyLightCard({ device, onUpdate, loading }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const { on, brightness = 100, color = '#ff00ff', mode = 'static' } = device.state || {};
  const [showAutomation, setShowAutomation] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const automation = device.automation || {};

  const hasSchedule = automation.schedule?.enabled && (automation.schedule.on_time || automation.schedule.off_time);
  const hasCountdown = automation.countdown?.active;
  const hasCycle = automation.cycle_count?.active;
  const hasAnyAutomation = hasSchedule || hasCountdown || hasCycle;

  const modes = [
    { id: 'static', label: 'Static' },
    { id: 'rainbow', label: '🌈 Rainbow' },
    { id: 'pulse', label: '💫 Pulse' },
    { id: 'strobe', label: '⚡ Strobe' },
    { id: 'disco', label: '🪩 Disco' },
  ];

  const presetColors = ['#ff0000', '#0000ff', '#00ff00', '#8b5cf6', '#ec4899', '#ffffff'];

  return (
    <div className={`bg-slate-800 border rounded-xl p-5 transition-all duration-500 flex flex-col justify-between ${
      on 
        ? mode === 'rainbow' 
          ? 'border-purple-500/40 animate-rainbow' 
          : 'border-slate-600'
        : 'border-slate-700 hover:border-slate-600'
    }`}
      style={on ? { boxShadow: `0 0 30px ${color}15, 0 0 60px ${color}08` } : {}}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
              on ? 'text-purple-400' : 'bg-slate-700/50 text-slate-500'
            }`}
              style={on ? { backgroundColor: `${color}20`, color: color } : {}}
            >
              <Sparkles className={`w-6 h-6 ${on ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-semibold text-slate-100">{device.name}</h3>
                {device.pin && (
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Cpu className="w-2.5 h-2.5" /> {device.pin}
                  </span>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-md transition-colors"
                    title="Configure name & ESP32 pin"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className={`text-xs font-medium ${on ? 'text-purple-400' : 'text-slate-500'} mt-0.5`}>
                {on ? `● ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode` : '○ OFF'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onUpdate({ on: !on })}
            disabled={loading}
            className={`p-2.5 rounded-xl transition-all duration-300 active:scale-95 ${
              on 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30' 
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600 border border-transparent'
            }`}
          >
            <Power className="w-5 h-5" />
          </button>
        </div>

        {/* Active automation badges */}
        {hasAnyAutomation && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {hasSchedule && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
                <Clock className="w-3 h-3" />
                {automation.schedule.on_time && `ON ${automation.schedule.on_time}`}
                {automation.schedule.off_time && ` OFF ${automation.schedule.off_time}`}
              </span>
            )}
            {hasCountdown && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-mono">
                <Timer className="w-3 h-3 animate-pulse" />
                Auto-{automation.countdown.action === 'turn_on' ? 'ON' : 'OFF'}
              </span>
            )}
            {hasCycle && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-md font-mono">
                <Repeat className="w-3 h-3 animate-spin" />
                Cycle {automation.cycle_count.current_count}/{automation.cycle_count.total_count}
              </span>
            )}
          </div>
        )}

        {on && (
          <div className="space-y-4 mb-4 animate-in">
            {/* Brightness slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-slate-400">Brightness</label>
                <span className="text-xs font-bold text-slate-300">{brightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={brightness}
                onChange={(e) => onUpdate({ brightness: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-2 block">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border-2 border-slate-600 bg-transparent"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {presetColors.map(c => (
                    <button
                      key={c}
                      onClick={() => onUpdate({ color: c })}
                      className={`w-8 h-8 rounded-lg border-2 transition-all duration-200 active:scale-90 ${
                        color === c ? 'border-white scale-110' : 'border-slate-600 hover:border-slate-400'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Mode selector */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-2 block">Effect Mode</label>
              <div className="flex flex-wrap gap-1.5">
                {modes.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onUpdate({ mode: m.id })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                      mode === m.id 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 ring-1 ring-cyan-500/20' 
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600 border border-transparent'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Schedule & Automation Button */}
      <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center">
        <button
          type="button"
          onClick={() => setShowAutomation(true)}
          className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg transition-all ${
            hasAnyAutomation
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Schedule & Count
          {hasAnyAutomation && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
        </button>
      </div>

      {/* Modal */}
      <LightAutomationModal
        device={device}
        isOpen={showAutomation}
        onClose={() => setShowAutomation(false)}
      />

      {/* Edit Component Modal */}
      <EditComponentModal
        device={device}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </div>
  );
}
