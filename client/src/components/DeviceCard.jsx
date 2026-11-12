import { useContext, useState } from 'react';
import { AuthContext, WebSocketContext } from '../App';
import { updateDevice } from '../api';
import {
  Lightbulb,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Power,
  Clock,
  Timer,
  Repeat,
  Edit3,
  Lock,
  Loader2,
  WifiOff,
  Ban
} from 'lucide-react';
import toast from 'react-hot-toast';
import LightAutomationModal from './LightAutomationModal';
import EditComponentModal from './EditComponentModal';

export default function DeviceCard({ device, onUpdate, isParkingFull }) {
  const { deviceOnline, esp32Online, controllers = [] } = useContext(WebSocketContext);
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  // Controller-specific online status
  let isOnline = deviceOnline ?? esp32Online;
  if (device.controller_id && controllers.length > 0) {
    const assigned = controllers.find(c => c.id === device.controller_id);
    if (assigned) {
      isOnline = Boolean(assigned.online);
    }
  }

  const isReadOnly = (user?.role !== 'superadmin') && user?.can_control === false;
  const isDisabled = Boolean(device.disabled);
  const disabled = isReadOnly || !isOnline || isDisabled;

  const handleUpdate = async (newState) => {
    if (isDisabled) {
      toast.error(`"${device.name}" is disabled.`);
      return;
    }
    if (!isOnline) {
      toast.error(`ESP32 ${device.controller_name || device.controller_id || 'controller'} is offline. Controls are disabled.`);
      return;
    }
    if (isReadOnly) {
      toast.error('Your account is in read-only mode.');
      return;
    }
    setLoading(true);
    try {
      await updateDevice(device.id, newState);
    } catch (err) {
      toast.error(err.message || 'Failed to update device');
    } finally {
      setLoading(false);
    }
  };

  if (device.type === 'light') return <LightCard device={device} onUpdate={handleUpdate} loading={loading} disabled={disabled} isOffline={!isOnline} isReadOnly={isReadOnly} isDisabled={isDisabled} />;
  if (device.type === 'rolling-door') return <RollingDoorCard device={device} onUpdate={handleUpdate} loading={loading} disabled={disabled} isOffline={!isOnline} isReadOnly={isReadOnly} isDisabled={isDisabled} />;
  if (device.type === 'boom-gate') return <BoomGateCard device={device} onUpdate={handleUpdate} loading={loading} disabled={disabled} isOffline={!isOnline} isReadOnly={isReadOnly} isDisabled={isDisabled} isParkingFull={isParkingFull} />;
  if (device.type === 'party-light') return <PartyLightCard device={device} onUpdate={handleUpdate} loading={loading} disabled={disabled} isOffline={!isOnline} isReadOnly={isReadOnly} isDisabled={isDisabled} />;
  return null;
}

function DeviceCardBadges({ isDisabled, isOffline, isReadOnly, isAdmin, onEdit, extra }) {
  return (
    <>
      {isDisabled && (
        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/40 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
          <Ban className="w-2.5 h-2.5" /> Disabled
        </span>
      )}
      {isOffline && (
        <span className="text-[10px] font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
          <WifiOff className="w-2.5 h-2.5" /> Offline
        </span>
      )}
      {extra}
      {!isOffline && !isDisabled && isReadOnly && (
        <Lock className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" title="Read-Only Mode" />
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={onEdit}
          className="p-1 text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-md transition-colors flex-shrink-0"
          title="Configure component settings"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
      )}
    </>
  );
}

// ============ LIGHT CARD ============
function LightCard({ device, onUpdate, loading, disabled, isOffline, isReadOnly, isDisabled }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  // When device is offline, button turns off by default
  const isOn = !isOffline && Boolean(device.state?.on);
  const [showAutomation, setShowAutomation] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const automation = device.automation || {};

  const hasSchedule = automation.schedule?.enabled && (automation.schedule.on_time || automation.schedule.off_time);
  const hasCountdown = automation.countdown?.active;
  const hasCycle = automation.cycle_count?.active;
  const hasAnyAutomation = hasSchedule || hasCountdown || hasCycle;

  return (
    <div className={`relative bg-white dark:bg-slate-800 border rounded-2xl p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm h-full min-h-[300px] ${
      isDisabled
        ? 'border-amber-300 dark:border-amber-500/40'
        : isOn 
        ? 'border-amber-400 dark:border-amber-500/40 shadow-md shadow-amber-500/10' 
        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      {isOn && !isDisabled && <div className="absolute inset-0 rounded-2xl bg-amber-500/5 pointer-events-none" />}
      
      <div className="min-w-0">
        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
              isOn && !isDisabled
                ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400' 
                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500'
            }`}>
              <Lightbulb className={`w-5 h-5 sm:w-6 sm:h-6 ${isOn && !isDisabled ? 'drop-shadow-md' : ''}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate max-w-[170px]" title={device.name}>
                  {device.name}
                </h3>
                <DeviceCardBadges
                  isDisabled={isDisabled}
                  isOffline={isOffline}
                  isReadOnly={isReadOnly}
                  isAdmin={isAdmin}
                  onEdit={() => setShowEditModal(true)}
                />
              </div>
              <p className={`text-xs font-medium ${
                isDisabled
                  ? 'text-amber-600 dark:text-amber-400'
                  : isOn
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              } mt-0.5`}>
                {isDisabled ? 'Disabled • Controls Locked' : isOn ? '● ON' : '○ OFF'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onUpdate({ on: !isOn })}
            disabled={loading || disabled}
            aria-label={`Toggle ${device.name}`}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 flex-shrink-0 ${
              isOn ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'
            } ${(loading || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
          >
            <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${
              isOn ? 'left-7.5' : 'left-0.5'
            }`} />
          </button>
        </div>

        {/* Visual Light Display Stage (Uniform h-24) */}
        <div 
          onClick={() => (!loading && !disabled) && onUpdate({ on: !isOn })}
          className={`mb-4 rounded-xl p-3 h-24 border transition-all duration-300 flex items-center justify-center relative overflow-hidden select-none ${
            disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
          } ${
            isOn && !isDisabled
              ? 'bg-amber-500/10 border-amber-400/40 dark:bg-amber-500/10 dark:border-amber-500/30 shadow-inner'
              : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          title={isDisabled ? 'Component is disabled' : 'Click to toggle lighting'}
        >
          {isOn && !isDisabled && (
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/20 via-amber-400/10 to-transparent pointer-events-none animate-pulse" />
          )}
          <div className="flex flex-col items-center gap-1.5 relative z-10 text-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 ${
              isOn && !isDisabled
                ? 'bg-amber-400 text-amber-950 shadow-md shadow-amber-400/50 scale-110' 
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
            }`}>
              <Lightbulb className={`w-5 h-5 ${isOn && !isDisabled ? 'fill-current' : ''}`} />
            </div>
            <span className={`text-[11px] font-semibold tracking-wide ${
              isDisabled
                ? 'text-amber-600 dark:text-amber-400'
                : isOn
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              {isDisabled
                ? 'Component Disabled • Controls Locked'
                : isOn
                ? 'Illumination Active • Circuit Closed'
                : 'Standby • Circuit Open'}
            </span>
          </div>
        </div>

        {/* Active automation badges */}
        {hasAnyAutomation && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {hasSchedule && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
                <Clock className="w-3 h-3" />
                {automation.schedule.on_time && `ON ${automation.schedule.on_time}`}
                {automation.schedule.off_time && ` OFF ${automation.schedule.off_time}`}
              </span>
            )}
            {hasCountdown && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-md font-mono">
                <Timer className="w-3 h-3 animate-pulse" />
                Auto-{automation.countdown.action === 'turn_on' ? 'ON' : 'OFF'}
              </span>
            )}
            {hasCycle && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20 px-2 py-0.5 rounded-md font-mono">
                <Repeat className="w-3 h-3 animate-spin" />
                Cycle {automation.cycle_count.current_count}/{automation.cycle_count.total_count}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex justify-between items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAutomation(true)}
          disabled={disabled}
          className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg transition-all ${
            hasAnyAutomation
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Clock className="w-3.5 h-3.5" />
          Schedule & Count
          {hasAnyAutomation && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ on: !isOn })}
          disabled={loading || disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
            isOn
              ? 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
          } disabled:opacity-50`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{isOn ? 'Turn OFF' : 'Turn ON'}</span>
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
function RollingDoorCard({ device, onUpdate, loading, disabled, isOffline, isReadOnly, isDisabled }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [showEditModal, setShowEditModal] = useState(false);
  // When device is offline, door status is closed by default
  const status = isOffline ? 'closed' : (device.state?.status || 'closed');
  const isMoving = !isOffline && !isDisabled && (status === 'opening' || status === 'closing');

  const statusColors = {
    opened: 'text-green-600 dark:text-green-400',
    closed: 'text-red-600 dark:text-red-400',
    opening: 'text-cyan-600 dark:text-cyan-400',
    closing: 'text-amber-600 dark:text-amber-400',
    stopped: 'text-yellow-600 dark:text-yellow-400'
  };

  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm h-full min-h-[300px] ${
      isDisabled
        ? 'border-amber-300 dark:border-amber-500/40'
        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      <div className="min-w-0">
        <div className="flex items-start gap-3 mb-4 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-slate-500 dark:text-slate-400 flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="16" x2="20" y2="16" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate max-w-[170px]" title={device.name}>
                {device.name}
              </h3>
              <DeviceCardBadges
                isDisabled={isDisabled}
                isOffline={isOffline}
                isReadOnly={isReadOnly}
                isAdmin={isAdmin}
                onEdit={() => setShowEditModal(true)}
              />
            </div>
            <p className={`text-xs font-medium flex items-center gap-1 ${
              isDisabled ? 'text-amber-600 dark:text-amber-400' : statusColors[status] || 'text-slate-500'
            } mt-0.5`}>
              {isDisabled ? (
                'Disabled • Controls Locked'
              ) : (
                <>
                  {isMoving && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                  {isMoving && '...'}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Visual door representation (Uniform h-24) */}
        <div className="mb-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 h-24 flex flex-col justify-center overflow-hidden relative">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="h-3 bg-slate-300 dark:bg-slate-600 rounded-sm mb-1 transition-all duration-700"
              style={{
                transitionDelay: `${i * 80}ms`,
                opacity: status === 'opened' ? 0 : status === 'opening' ? (1 - i * 0.15) : 1,
                transform: status === 'opened' ? 'translateY(-80px)' : status === 'opening' ? `translateY(-${i * 8}px)` : 'translateY(0)'
              }}
            />
          ))}
        </div>
      </div>

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onUpdate({ status: 'opening' })}
            disabled={loading || status === 'opened' || isMoving || disabled}
            className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 active:scale-95 ${
              status === 'opening' || status === 'opened'
                ? 'bg-cyan-50 text-cyan-600 border border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 border border-transparent'
            } disabled:opacity-50`}
          >
            <ArrowUp className="w-4 h-4" />
            Open
          </button>
          <button
            onClick={() => onUpdate({ status: 'closing' })}
            disabled={loading || status === 'closed' || isMoving || disabled}
            className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 active:scale-95 ${
              status === 'closing' || status === 'closed'
                ? 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 border border-transparent'
            } disabled:opacity-50`}
          >
            <ArrowDown className="w-4 h-4" />
            Close
          </button>
        </div>

        {isMoving && (
          <div className="flex items-center justify-center gap-2 text-xs text-cyan-600 dark:text-cyan-400 animate-pulse pt-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Door is rolling... Please wait
          </div>
        )}
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
function BoomGateCard({ device, onUpdate, loading, disabled, isOffline, isReadOnly, isDisabled, isParkingFull }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [showEditModal, setShowEditModal] = useState(false);
  // When device is offline, gate status is closed by default
  const status = isOffline ? 'closed' : (device.state?.status || 'closed');
  const isOpen = !isOffline && (status === 'open' || status === 'opened');

  return (
    <div className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm h-full min-h-[300px] ${
      isDisabled
        ? 'border-amber-300 dark:border-amber-500/40'
        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      <div className="min-w-0">
        <div className="flex items-start gap-3 mb-4 min-w-0">
          <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-colors duration-300 flex-shrink-0 ${
            isOpen ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="10" y="14" width="4" height="8" rx="1" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate max-w-[170px]" title={device.name}>
                {device.name}
              </h3>
              <DeviceCardBadges
                isDisabled={isDisabled}
                isOffline={isOffline}
                isReadOnly={isReadOnly}
                isAdmin={isAdmin}
                onEdit={() => setShowEditModal(true)}
                extra={isParkingFull && (
                  <span className="text-[10px] font-bold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse flex-shrink-0">
                    PARKING FULL
                  </span>
                )}
              />
            </div>
            <p className={`text-xs font-medium ${
              isDisabled
                ? 'text-amber-600 dark:text-amber-400'
                : isOpen
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            } mt-0.5`}>
              {isDisabled ? 'Disabled • Controls Locked' : isOpen ? '● Open (Raised)' : '● Closed (Lowered)'}
            </p>
          </div>
        </div>

        {/* Visual boom gate (Uniform h-24) */}
        <div className="mb-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-24 relative overflow-hidden flex items-end">
          {/* Post */}
          <div className="w-6 h-16 bg-slate-400 dark:bg-slate-600 rounded-t-sm ml-4 relative z-10" />
          {/* Signal lights */}
          <div className="absolute left-6 top-3 flex flex-col gap-1">
            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${isOpen ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-green-900/30 dark:bg-green-900'}`} />
            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${!isOpen ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-red-900/30 dark:bg-red-900'}`} />
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

      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onUpdate({ status: 'open' })}
            disabled={loading || isOpen || disabled || (!isAdmin && isParkingFull)}
            title={!isAdmin && isParkingFull ? 'Parking floor is at full capacity (0 slots available)' : ''}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 active:scale-95 ${
              isOpen
                ? 'bg-green-50 text-green-600 border border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30'
                : !isAdmin && isParkingFull
                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                : 'bg-slate-100 text-slate-700 hover:bg-green-50 hover:text-green-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-green-500/10 dark:hover:text-green-400 border border-transparent'
            } disabled:opacity-50`}
          >
            <ChevronUp className="w-4 h-4" />
            {!isAdmin && isParkingFull ? 'Full' : isAdmin && isParkingFull ? 'Open (Over)' : 'Open Gate'}
          </button>
          <button
            onClick={() => onUpdate({ status: 'closed' })}
            disabled={loading || !isOpen || disabled}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 active:scale-95 ${
              !isOpen
                ? 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30'
                : 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-400 border border-transparent'
            } disabled:opacity-50`}
          >
            <ChevronDown className="w-4 h-4" />
            Close Gate
          </button>
        </div>
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
function PartyLightCard({ device, onUpdate, loading, disabled, isOffline, isReadOnly, isDisabled }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const { brightness = 100, color = '#ff00ff', mode = 'static' } = device.state || {};
  // When device is offline, power button turns off by default
  const on = !isOffline && Boolean(device.state?.on);
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
    <div className={`relative bg-white dark:bg-slate-800 border rounded-2xl p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-sm h-full min-h-[300px] ${
      isDisabled
        ? 'border-amber-300 dark:border-amber-500/40'
        : on 
        ? 'border-purple-400 dark:border-purple-500/40 shadow-md shadow-purple-500/10' 
        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
    }`}
      style={on && !isDisabled ? { boxShadow: `0 0 25px ${color}18, 0 0 50px ${color}08` } : {}}
    >
      <div className="min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4 min-w-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
              on && !isDisabled ? 'text-purple-500 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500'
            }`}
              style={on && !isDisabled ? { backgroundColor: `${color}20`, color: color } : {}}
            >
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate max-w-[170px]" title={device.name}>
                  {device.name}
                </h3>
                <DeviceCardBadges
                  isDisabled={isDisabled}
                  isOffline={isOffline}
                  isReadOnly={isReadOnly}
                  isAdmin={isAdmin}
                  onEdit={() => setShowEditModal(true)}
                />
              </div>
              <p className={`text-xs font-medium ${
                isDisabled
                  ? 'text-amber-600 dark:text-amber-400'
                  : on
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-slate-500 dark:text-slate-400'
              } mt-0.5`}>
                {isDisabled
                  ? 'Disabled • Controls Locked'
                  : on
                  ? `● ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`
                  : '○ OFF'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onUpdate({ on: !on })}
            disabled={loading || disabled}
            aria-label={`Power toggle for ${device.name}`}
            className={`p-2.5 rounded-xl transition-all duration-300 active:scale-95 flex-shrink-0 ${
              on 
                ? 'bg-purple-100 text-purple-600 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30 hover:bg-purple-200 dark:hover:bg-purple-500/30' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 border border-transparent'
            } ${(loading || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Power className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Party Light Display Stage (Uniform h-24) */}
        <div 
          onClick={() => (!loading && !disabled) && onUpdate({ on: !on })}
          className={`mb-4 rounded-xl p-3 h-24 border transition-all duration-300 flex items-center justify-center relative overflow-hidden select-none ${
            disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
          } ${
            on && !isDisabled
              ? 'border-purple-400/40 dark:border-purple-500/40'
              : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          style={on && !isDisabled ? { backgroundColor: `${color}15` } : {}}
          title={isDisabled ? 'Component is disabled' : 'Click to toggle power'}
        >
          {on && !isDisabled && (
            <div 
              className="absolute inset-0 opacity-20 blur-xl pointer-events-none"
              style={{ backgroundColor: color }}
            />
          )}
          <div className="flex flex-col items-center gap-1.5 relative z-10 text-center">
            <div 
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                on && !isDisabled ? 'shadow-md scale-110' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
              }`}
              style={on && !isDisabled ? { backgroundColor: color, color: '#fff' } : {}}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <span className={`text-[11px] font-semibold tracking-wide ${
              isDisabled
                ? 'text-amber-600 dark:text-amber-400'
                : on
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              {isDisabled
                ? 'Component Disabled • Controls Locked'
                : on
                ? `RGB Active • ${brightness}% • ${mode.toUpperCase()}`
                : 'Party Light Standby • Circuit Open'}
            </span>
          </div>
        </div>

        {/* Active automation badges */}
        {hasAnyAutomation && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {hasSchedule && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
                <Clock className="w-3 h-3" />
                {automation.schedule.on_time && `ON ${automation.schedule.on_time}`}
                {automation.schedule.off_time && ` OFF ${automation.schedule.off_time}`}
              </span>
            )}
            {hasCountdown && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 px-2 py-0.5 rounded-md font-mono">
                <Timer className="w-3 h-3 animate-pulse" />
                Auto-{automation.countdown.action === 'turn_on' ? 'ON' : 'OFF'}
              </span>
            )}
            {hasCycle && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20 px-2 py-0.5 rounded-md font-mono">
                <Repeat className="w-3 h-3 animate-spin" />
                Cycle {automation.cycle_count.current_count}/{automation.cycle_count.total_count}
              </span>
            )}
          </div>
        )}

        {on && (
          <div className="space-y-3 mb-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
            {/* Brightness slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Brightness</label>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-300 font-mono">{brightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={brightness}
                disabled={disabled}
                onChange={(e) => onUpdate({ brightness: parseInt(e.target.value) })}
                className={`w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>

            {/* Color picker */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  disabled={disabled}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                  className={`w-8 h-8 rounded-lg cursor-pointer border-2 border-slate-300 dark:border-slate-600 bg-transparent flex-shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                <div className="flex gap-1.5 flex-wrap">
                  {presetColors.map(c => (
                    <button
                      key={c}
                      disabled={disabled}
                      onClick={() => onUpdate({ color: c })}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border-2 transition-all duration-200 active:scale-90 ${
                        color === c ? 'border-slate-900 dark:border-white scale-110 shadow-sm' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Set color to ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Mode selector */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Effect Mode</label>
              <div className="flex flex-wrap gap-1.5">
                {modes.map(m => (
                  <button
                    key={m.id}
                    disabled={disabled}
                    onClick={() => onUpdate({ mode: m.id })}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200 active:scale-95 ${
                      mode === m.id 
                        ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 ring-1 ring-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/40 dark:ring-cyan-500/20' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 border border-transparent'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex justify-between items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAutomation(true)}
          disabled={disabled}
          className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg transition-all ${
            hasAnyAutomation
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Clock className="w-3.5 h-3.5" />
          Schedule & Count
          {hasAnyAutomation && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
        </button>

        <button
          type="button"
          onClick={() => onUpdate({ on: !on })}
          disabled={loading || disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
            on
              ? 'bg-purple-50 text-purple-600 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
          } disabled:opacity-50`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{on ? 'Turn OFF' : 'Turn ON'}</span>
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
