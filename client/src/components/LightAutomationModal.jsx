import { useState, useEffect } from 'react';
import {
  Clock,
  Timer,
  Repeat,
  X,
  Check,
  AlertCircle,
  Play,
  Square,
  Calendar,
  Zap,
  Trash2
} from 'lucide-react';
import {
  setDeviceSchedule,
  setDeviceCountdown,
  setDeviceCycleCount,
  cancelDeviceAutomation
} from '../api';
import toast from 'react-hot-toast';

export default function LightAutomationModal({ device, isOpen, onClose, onAutomationChanged }) {
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'countdown' | 'cycle'
  const automation = device.automation || {};

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [onTime, setOnTime] = useState('18:00');
  const [offTime, setOffTime] = useState('06:00');
  const [scheduleMode, setScheduleMode] = useState('daily'); // 'daily' | 'datetime'
  const [onDateTime, setOnDateTime] = useState('');
  const [offDateTime, setOffDateTime] = useState('');
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]);

  // Countdown state
  const [countdownAction, setCountdownAction] = useState(device.state?.on ? 'turn_off' : 'turn_on');
  const [countdownHours, setCountdownHours] = useState(0);
  const [countdownMinutes, setCountdownMinutes] = useState(30);
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  // Cycle Count state
  const [totalCount, setTotalCount] = useState(5);
  const [intervalOn, setIntervalOn] = useState(3);
  const [intervalOff, setIntervalOff] = useState(3);

  // Live countdown clock state for active timers
  const [remainingTimeStr, setRemainingTimeStr] = useState('');
  const [cycleProgressStr, setCycleProgressStr] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize from device.automation
  useEffect(() => {
    if (automation.schedule) {
      setScheduleEnabled(automation.schedule.enabled !== false);
      if (automation.schedule.on_time) {
        if (automation.schedule.on_time.includes('T')) {
          setScheduleMode('datetime');
          setOnDateTime(automation.schedule.on_time);
        } else {
          setScheduleMode('daily');
          setOnTime(automation.schedule.on_time);
        }
      }
      if (automation.schedule.off_time) {
        if (automation.schedule.off_time.includes('T')) {
          setScheduleMode('datetime');
          setOffDateTime(automation.schedule.off_time);
        } else {
          setScheduleMode('daily');
          setOffTime(automation.schedule.off_time);
        }
      }
      if (Array.isArray(automation.schedule.days)) {
        setSelectedDays(automation.schedule.days);
      }
    }
  }, [automation.schedule]);

  // Tick for remaining countdown and cycle time display
  useEffect(() => {
    const timer = setInterval(() => {
      // Countdown remaining
      if (automation.countdown && automation.countdown.active) {
        const diffMs = automation.countdown.target_time - Date.now();
        if (diffMs > 0) {
          const totalSec = Math.floor(diffMs / 1000);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          let str = '';
          if (h > 0) str += `${h}h `;
          if (m > 0 || h > 0) str += `${m}m `;
          str += `${s}s`;
          setRemainingTimeStr(str);
        } else {
          setRemainingTimeStr('Finishing...');
        }
      } else {
        setRemainingTimeStr('');
      }

      // Cycle remaining
      if (automation.cycle_count && automation.cycle_count.active) {
        const diffMs = automation.cycle_count.next_toggle_time - Date.now();
        const sec = Math.max(0, Math.ceil(diffMs / 1000));
        setCycleProgressStr(
          `Cycle ${automation.cycle_count.current_count + (automation.cycle_count.phase === 'on' ? 1 : 0)} of ${automation.cycle_count.total_count} (${automation.cycle_count.phase.toUpperCase()} for ${sec}s)`
        );
      } else {
        setCycleProgressStr('');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [automation]);

  if (!isOpen) return null;

  const daysLabels = [
    { id: 0, label: 'Su' },
    { id: 1, label: 'Mo' },
    { id: 2, label: 'Tu' },
    { id: 3, label: 'We' },
    { id: 4, label: 'Th' },
    { id: 5, label: 'Fr' },
    { id: 6, label: 'Sa' }
  ];

  const toggleDay = (dayId) => {
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter(d => d !== dayId));
      }
    } else {
      setSelectedDays([...selectedDays, dayId].sort());
    }
  };

  // Handlers
  const handleSaveSchedule = async () => {
    setLoading(true);
    try {
      const payload = {
        enabled: scheduleEnabled,
        on_time: scheduleMode === 'daily' ? onTime : onDateTime,
        off_time: scheduleMode === 'daily' ? offTime : offDateTime,
        days: scheduleMode === 'daily' ? selectedDays : null
      };
      await setDeviceSchedule(device.id, payload);
      toast.success('Schedule saved successfully');
      if (onAutomationChanged) onAutomationChanged();
    } catch (err) {
      toast.error(err.message || 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleStartCountdown = async () => {
    const totalSec = countdownHours * 3600 + countdownMinutes * 60 + countdownSeconds;
    if (totalSec <= 0) {
      toast.error('Please enter a duration greater than 0');
      return;
    }
    setLoading(true);
    try {
      await setDeviceCountdown(device.id, {
        action: countdownAction,
        duration_seconds: totalSec
      });
      toast.success(`Countdown started: Auto-${countdownAction === 'turn_on' ? 'ON' : 'OFF'} in ${countdownHours > 0 ? countdownHours + 'h ' : ''}${countdownMinutes}m ${countdownSeconds}s`);
      if (onAutomationChanged) onAutomationChanged();
    } catch (err) {
      toast.error(err.message || 'Failed to start countdown');
    } finally {
      setLoading(false);
    }
  };

  const handleStartCycle = async () => {
    if (totalCount <= 0) {
      toast.error('Count must be at least 1');
      return;
    }
    if (intervalOn <= 0 || intervalOff <= 0) {
      toast.error('ON and OFF durations must be greater than 0');
      return;
    }
    setLoading(true);
    try {
      await setDeviceCycleCount(device.id, {
        total_count: totalCount,
        interval_on_sec: intervalOn,
        interval_off_sec: intervalOff
      });
      toast.success(`Started cycle count: ${totalCount} times`);
      if (onAutomationChanged) onAutomationChanged();
    } catch (err) {
      toast.error(err.message || 'Failed to start cycle count');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (type) => {
    setLoading(true);
    try {
      await cancelDeviceAutomation(device.id, type);
      toast.success(`Cancelled ${type.replace('_', ' ')}`);
      if (onAutomationChanged) onAutomationChanged();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel');
    } finally {
      setLoading(false);
    }
  };

  const hasActiveSchedule = automation.schedule && automation.schedule.enabled && (automation.schedule.on_time || automation.schedule.off_time);
  const hasActiveCountdown = automation.countdown && automation.countdown.active;
  const hasActiveCycle = automation.cycle_count && automation.cycle_count.active;

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
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">{device.name} Automations</h3>
              <p className="text-xs text-slate-400">Schedules, Auto Turn On/Off & Count Cycles</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700 bg-slate-900/50 p-1 gap-1">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'schedule'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Schedule
            {hasActiveSchedule && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
          </button>

          <button
            onClick={() => setActiveTab('countdown')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'countdown'
                ? 'bg-amber-500/20 text-amber-400 shadow-sm border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Timer className="w-4 h-4" />
            Auto On/Off
            {hasActiveCountdown && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
          </button>

          <button
            onClick={() => setActiveTab('cycle')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'cycle'
                ? 'bg-purple-500/20 text-purple-400 shadow-sm border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-4 h-4" />
            Count Cycle
            {hasActiveCycle && <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* ================= TAB 1: SCHEDULE ================= */}
          {activeTab === 'schedule' && (
            <div className="space-y-5">
              {/* Active schedule badge */}
              {hasActiveSchedule ? (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Active Schedule</span>
                    <p className="text-sm text-slate-200 mt-0.5">
                      {automation.schedule.on_time && `ON at ${automation.schedule.on_time} `}
                      {automation.schedule.off_time && `• OFF at ${automation.schedule.off_time}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {automation.schedule.days ? 'Daily repeat' : 'Specific date'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancel('schedule')}
                    disabled={loading}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium border border-red-500/20 transition-all"
                  >
                    Disable
                  </button>
                </div>
              ) : (
                <div className="bg-slate-700/20 border border-slate-700 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  No schedule active. Set daily or future date/time below.
                </div>
              )}

              {/* Mode switch: Daily vs Specific Date */}
              <div className="flex gap-2 bg-slate-900/60 p-1 rounded-xl border border-slate-700/50">
                <button
                  type="button"
                  onClick={() => setScheduleMode('daily')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    scheduleMode === 'daily'
                      ? 'bg-slate-800 text-cyan-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Daily Recurring
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('datetime')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    scheduleMode === 'datetime'
                      ? 'bg-slate-800 text-cyan-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Specific Date & Time (No Limit)
                </button>
              </div>

              {/* Time Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 border border-slate-700/60 rounded-xl p-4">
                  <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    Turn ON At
                  </label>
                  {scheduleMode === 'daily' ? (
                    <input
                      type="time"
                      value={onTime}
                      onChange={e => setOnTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={onDateTime}
                      onChange={e => setOnDateTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  )}
                </div>

                <div className="bg-slate-900/50 border border-slate-700/60 rounded-xl p-4">
                  <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    Turn OFF At
                  </label>
                  {scheduleMode === 'daily' ? (
                    <input
                      type="time"
                      value={offTime}
                      onChange={e => setOffTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={offDateTime}
                      onChange={e => setOffDateTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  )}
                </div>
              </div>

              {/* Days selector for daily mode */}
              {scheduleMode === 'daily' && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-slate-300">Repeat Days</label>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                      className="text-[11px] text-cyan-400 hover:underline"
                    >
                      Every Day
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {daysLabels.map(d => {
                      const isSelected = selectedDays.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDay(d.id)}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-900 shadow-md shadow-cyan-500/20'
                              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={loading}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  Save Schedule
                </button>
                {hasActiveSchedule && (
                  <button
                    type="button"
                    onClick={() => handleCancel('schedule')}
                    disabled={loading}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-xl text-sm transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 2: COUNTDOWN (AUTO ON/OFF) ================= */}
          {activeTab === 'countdown' && (
            <div className="space-y-5">
              {/* Active countdown banner */}
              {hasActiveCountdown ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      Countdown Running
                    </span>
                    <button
                      onClick={() => handleCancel('countdown')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop Timer
                    </button>
                  </div>
                  <div className="text-2xl font-mono font-bold text-slate-100">
                    {remainingTimeStr || 'Calculating...'}
                  </div>
                  <p className="text-xs text-slate-300">
                    Will auto turn <strong className="text-amber-400">{automation.countdown.action === 'turn_on' ? 'ON' : 'OFF'}</strong> when timer reaches zero.
                  </p>
                </div>
              ) : (
                <div className="bg-slate-700/20 border border-slate-700 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  Set a timer to automatically turn this light ON or OFF after any duration.
                </div>
              )}

              {/* Action Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Target Action</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCountdownAction('turn_off')}
                    className={`py-2.5 px-4 rounded-xl text-sm font-medium border transition-all ${
                      countdownAction === 'turn_off'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-slate-900/40 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Auto Turn OFF
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountdownAction('turn_on')}
                    className={`py-2.5 px-4 rounded-xl text-sm font-medium border transition-all ${
                      countdownAction === 'turn_on'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                        : 'bg-slate-900/40 text-slate-400 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    Auto Turn ON
                  </button>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Quick Presets</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { label: '5m', h: 0, m: 5 },
                    { label: '15m', h: 0, m: 15 },
                    { label: '30m', h: 0, m: 30 },
                    { label: '1h', h: 1, m: 0 },
                    { label: '2h', h: 2, m: 0 },
                    { label: '8h', h: 8, m: 0 }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setCountdownHours(p.h);
                        setCountdownMinutes(p.m);
                        setCountdownSeconds(0);
                      }}
                      className="py-2 bg-slate-900/60 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Duration Inputs (No longest limit!) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Custom Duration (No Maximum Limit)</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Hours</span>
                    <input
                      type="number"
                      min="0"
                      value={countdownHours}
                      onChange={e => setCountdownHours(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Minutes</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={countdownMinutes}
                      onChange={e => setCountdownMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Seconds</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={countdownSeconds}
                      onChange={e => setCountdownSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Start Button */}
              <button
                type="button"
                onClick={handleStartCountdown}
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {hasActiveCountdown ? 'Restart Countdown' : 'Start Auto Countdown'}
              </button>
            </div>
          )}

          {/* ================= TAB 3: COUNT CYCLE ================= */}
          {activeTab === 'cycle' && (
            <div className="space-y-5">
              {/* Active cycle banner */}
              {hasActiveCycle ? (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                      Cycle Running
                    </span>
                    <button
                      onClick={() => handleCancel('cycle_count')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Stop Cycle
                    </button>
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-100">
                    {cycleProgressStr || 'Running...'}
                  </div>
                  <p className="text-xs text-slate-300">
                    Toggling light ON for {automation.cycle_count.interval_on_sec}s and OFF for {automation.cycle_count.interval_off_sec}s for {automation.cycle_count.total_count} repetitions.
                  </p>
                </div>
              ) : (
                <div className="bg-slate-700/20 border border-slate-700 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  Repeatedly turn this light ON and OFF for an exact number of counts.
                </div>
              )}

              {/* Total Count input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Total Count (How many times to turn ON and OFF)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    value={totalCount}
                    onChange={e => setTotalCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-32 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {[3, 5, 10, 20, 50, 100].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTotalCount(c)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          totalCount === c
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {c}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Intervals */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 border border-slate-700/60 rounded-xl p-4">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">ON Duration (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    value={intervalOn}
                    onChange={e => setIntervalOn(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-center text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Light stays ON</span>
                </div>

                <div className="bg-slate-900/50 border border-slate-700/60 rounded-xl p-4">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">OFF Duration (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    value={intervalOff}
                    onChange={e => setIntervalOff(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-center text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Light stays OFF</span>
                </div>
              </div>

              {/* Start Button */}
              <button
                type="button"
                onClick={handleStartCycle}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-purple-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {hasActiveCycle ? 'Restart Count Cycle' : `Start ${totalCount}× Count Cycle`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
